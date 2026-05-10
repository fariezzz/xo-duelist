"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import { supabaseClient } from "../../lib/supabase";
import { deleteFriendship, searchProfilesByKeyword, type FriendProfileRow } from "../../lib/friendsService";
import { parseUserStatus, statusSortWeight, type UserStatus } from "../../lib/statusUtils";
import ConfirmDeleteModal from "../../components/friends/ConfirmDeleteModal";
import { FriendRow, SearchPlayerRow } from "../../components/friends/FriendRow";
import { useNotification } from "../../hooks/useNotification";

type FriendRequest = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
};

type GameInvite = {
  id: string;
  sender_id: string;
  receiver_id: string;
  room_id: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
  responded_at: string | null;
  expires_at: string | null;
};

type Profile = {
  id: string;
  username: string;
  elo_rating: number;
  avatar_url: string | null;
};

type RequestWithProfile = FriendRequest & { profile?: Profile };
type InviteWithProfile = GameInvite & { profile?: Profile };

type FriendListItem = {
  profile: FriendProfileRow;
  friendsSince: string;
};

type BusyReason = "sender_busy" | "receiver_busy" | null;

type FriendFilterTab = "all" | "online" | "offline";
type FriendSortKey = "elo_desc" | "elo_asc" | "name_az" | "recent";

function isActiveInvite(row: GameInvite): boolean {
  if (row.status !== "pending") return false;

  if (!row.expires_at) return true;

  const expiresMs = new Date(row.expires_at).getTime();

  if (!Number.isFinite(expiresMs)) return true;

  return expiresMs > Date.now();
}

function formatFriendError(message: string): string {
  const normalized = String(message ?? "").trim();
  if (!normalized || normalized === "{}" || normalized === "[]") {
    return "Something went wrong. Please try again.";
  }
  const lower = normalized.toLowerCase();
  if (lower.includes("sender_busy")) return "You are currently in a match or matchmaking.";
  if (lower.includes("receiver_busy")) return "Your friend is in a match or matchmaking.";
  if (
    lower.includes("player_is_busy") ||
    lower.includes("one_player_already_in_match") ||
    lower.includes("one_player_already_matchmaking")
  ) {
    return "Player is in a match or matchmaking.";
  }
  if (lower.includes("invite_expired")) return "That invite has expired.";
  if (lower.includes("invite_cancelled")) return "That invite was cancelled.";
  if (lower.includes("invite_already_resolved")) return "That invite has already been resolved.";
  if (lower.includes("invite_already_pending")) return "An invite is already pending.";
  if (lower.includes("request_already_pending")) return "A friend request is already pending.";
  if (lower.includes("already_friends")) return "You are already friends with this player.";
  if (lower.includes("not_friends")) return "You must be friends before sending a match invite.";
  if (lower.includes("cannot_invite_yourself")) return "You cannot invite yourself.";
  if (lower.includes("cannot_add_yourself")) return "You cannot add yourself.";
  if (lower.includes("invite_not_found")) return "That invite is no longer available.";
  if (lower.includes("request_not_found")) return "That friend request is no longer available.";
  if (lower.includes("could not find the function") || lower.includes("function public.send_game_invite")) {
    return "Invites are not available on the server yet. Apply the latest migrations.";
  }
  if (lower.includes("permission denied")) return "Permission denied. Sign in again and retry.";
  return normalized || "Something went wrong.";
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string") {
    const text = err.trim();
    return text && text !== "{}" ? text : fallback;
  }
  if (err && typeof err === "object") {
    const source = err as {
      message?: unknown;
      error_description?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const candidates = [source.message, source.error_description, source.details, source.hint];
    for (const value of candidates) {
      if (typeof value === "string") {
        const text = value.trim();
        if (text && text !== "{}") return text;
      }
    }
    try {
      const text = JSON.stringify(err);
      if (text && text !== "{}") return text;
    } catch {
      /* ignore */
    }
  }
  return fallback;
}

const QUEUE_STALE_MS = 15 * 60 * 1000;
const LOBBY_ACTIVITY_STALE_MS = 4 * 60 * 1000;

type WaitingRoomRow = {
  player1_id: string;
  player2_id: string | null;
  player1_last_heartbeat: string | null;
  player2_last_heartbeat: string | null;
  last_move_at: string | null;
  created_at: string | null;
};

function waitingRowActiveForUser(row: WaitingRoomRow, userId: string, now: number): boolean {
  if (row.player1_id === userId) {
    const ts = row.player1_last_heartbeat ?? row.last_move_at ?? row.created_at;
    const t = new Date(ts ?? 0).getTime();
    return Number.isFinite(t) && now - t < LOBBY_ACTIVITY_STALE_MS;
  }
  if (row.player2_id === userId) {
    const ts = row.player2_last_heartbeat ?? row.last_move_at ?? row.created_at;
    const t = new Date(ts ?? 0).getTime();
    return Number.isFinite(t) && now - t < LOBBY_ACTIVITY_STALE_MS;
  }
  return false;
}

async function checkInviteBusyState(meId: string, friendId: string): Promise<BusyReason> {
  const now = Date.now();
  const queueStaleCutoff = now - QUEUE_STALE_MS;
  const cutoffIso = new Date(queueStaleCutoff).toISOString();

  await supabaseClient.from("matchmaking_queue").delete().in("player_id", [meId, friendId]).lt("joined_at", cutoffIso);

  const [ongoingRes, waitingRes, queueRes] = await Promise.all([
    supabaseClient
      .from("game_rooms")
      .select("player1_id, player2_id")
      .or(`player1_id.eq.${meId},player2_id.eq.${meId},player1_id.eq.${friendId},player2_id.eq.${friendId}`)
      .eq("status", "ongoing")
      .limit(20),
    supabaseClient
      .from("game_rooms")
      .select("player1_id, player2_id, player1_last_heartbeat, player2_last_heartbeat, last_move_at, created_at")
      .or(`player1_id.eq.${meId},player2_id.eq.${meId},player1_id.eq.${friendId},player2_id.eq.${friendId}`)
      .eq("status", "waiting")
      .limit(20),
    supabaseClient.from("matchmaking_queue").select("player_id, joined_at").in("player_id", [meId, friendId]).limit(20),
  ]);

  const ongoingRows = ongoingRes.data ?? [];
  const waitingRows = (waitingRes.data ?? []) as WaitingRoomRow[];
  const queueRows = (queueRes.data ?? []).filter((row) => {
    const joinedAt = new Date(row.joined_at ?? 0).getTime();
    if (!Number.isFinite(joinedAt)) return false;
    return joinedAt >= queueStaleCutoff;
  });

  const senderBusyInRoom = ongoingRows.some((row) => row.player1_id === meId || row.player2_id === meId);
  const receiverBusyInRoom = ongoingRows.some((row) => row.player1_id === friendId || row.player2_id === friendId);
  const senderWaitingInRoom = waitingRows.some((row) => waitingRowActiveForUser(row, meId, now));
  const receiverWaitingInRoom = waitingRows.some((row) => waitingRowActiveForUser(row, friendId, now));
  const senderBusyInQueue = queueRows.some((row) => row.player_id === meId);
  const receiverBusyInQueue = queueRows.some((row) => row.player_id === friendId);

  if (senderBusyInRoom || senderWaitingInRoom || senderBusyInQueue) return "sender_busy";
  if (receiverBusyInRoom || receiverWaitingInRoom || receiverBusyInQueue) return "receiver_busy";
  return null;
}

function EmptyBlock({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <div className="fb-root">
      <div className="fb-icon" aria-hidden>
        {icon}
      </div>
      <div className="fb-title">{title}</div>
      <p className="fb-hint">{hint}</p>
      <style jsx>{`
        .fb-root {
          text-align: center;
          padding: 28px 16px 22px;
        }
        .fb-icon {
          font-size: 2rem;
          line-height: 1;
          margin-bottom: 10px;
        }
        .fb-title {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 0.98rem;
          color: #e2e8f0;
          margin-bottom: 6px;
        }
        .fb-hint {
          margin: 0;
          font-size: 0.85rem;
          line-height: 1.45;
          color: rgba(148, 163, 184, 0.92);
          max-width: 320px;
          margin-left: auto;
          margin-right: auto;
        }
      `}</style>
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();
  const { showToast } = useNotification();

  // ── Perf: guard against concurrent loadData calls ──────────────
  const isLoadingRef = useRef(false);
  // ── Perf: debounce rapid realtime triggers ──────────────────────
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ── Perf: in-session profile mini-cache (name/avatar/elo) ──────
  const profileMiniCache = useRef<Map<string, Profile>>(new Map());
  // ── Search: debounce ref for real-time search ───────────────────
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [friendItems, setFriendItems] = useState<FriendListItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<RequestWithProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<RequestWithProfile[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<InviteWithProfile[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<InviteWithProfile[]>([]);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<FriendProfileRow[]>([]);


  const [friendFilter, setFriendFilter] = useState<FriendFilterTab>("all");
  const [friendSort, setFriendSort] = useState<FriendSortKey>("recent");

  const [deleteTarget, setDeleteTarget] = useState<FriendListItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const friendIds = useMemo(() => new Set(friendItems.map((f) => f.profile.id)), [friendItems]);
  const friendIdListKey = useMemo(() => [...friendItems.map((f) => f.profile.id)].sort().join(","), [friendItems]);

  const stats = useMemo(() => {
    let online = 0;
    let queue = 0;
    let match = 0;
    for (const { profile } of friendItems) {
      const s = parseUserStatus(profile.status);
      if (s === "online") online += 1;
      if (s === "matchmaking") queue += 1;
      if (s === "in_game") match += 1;
    }
    return { online, queue, match, total: friendItems.length };
  }, [friendItems]);

  const filteredSortedFriends = useMemo(() => {
    let rows = [...friendItems];
    if (friendFilter === "online") {
      rows = rows.filter(({ profile }) => parseUserStatus(profile.status) !== "offline");
    } else if (friendFilter === "offline") {
      rows = rows.filter(({ profile }) => parseUserStatus(profile.status) === "offline");
    }

    rows.sort((a, b) => {
      if (friendSort === "elo_desc") {
        const d = (b.profile.elo_rating ?? 0) - (a.profile.elo_rating ?? 0);
        if (d !== 0) return d;
      } else if (friendSort === "elo_asc") {
        const d = (a.profile.elo_rating ?? 0) - (b.profile.elo_rating ?? 0);
        if (d !== 0) return d;
      } else if (friendSort === "name_az") {
        const d = a.profile.username.localeCompare(b.profile.username);
        if (d !== 0) return d;
      } else {
        const d = new Date(b.friendsSince).getTime() - new Date(a.friendsSince).getTime();
        if (d !== 0) return d;
      }
      const aw = statusSortWeight(parseUserStatus(a.profile.status));
      const bw = statusSortWeight(parseUserStatus(b.profile.status));
      if (aw !== bw) return aw - bw;
      return a.profile.username.localeCompare(b.profile.username);
    });

    return rows;
  }, [friendItems, friendFilter, friendSort]);

  function showNotice(message: string) {
    showToast({ type: 'success', title: 'Friends', message });
  }

  function redirectToLobby(roomId: string) {
    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

    if (currentPath === `/lobby/${roomId}`) return;

    showNotice("Invite accepted. Opening lobby...");
    setTimeout(() => router.push(`/lobby/${roomId}`), 700);
  }

  async function fetchProfiles(ids: string[]): Promise<Map<string, Profile>> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return new Map();

    // ── Perf: serve cached entries, only fetch missing ones ────────
    const result = new Map<string, Profile>();
    const missing: string[] = [];
    for (const id of uniqueIds) {
      const cached = profileMiniCache.current.get(id);
      if (cached) result.set(id, cached);
      else missing.push(id);
    }
    if (missing.length === 0) return result;

    const { data, error: err } = await supabaseClient
      .from("profiles")
      .select("id, username, elo_rating, avatar_url")
      .in("id", missing);
    if (err) throw err;
    for (const p of data ?? []) {
      const profile = p as Profile;
      result.set(profile.id, profile);
      profileMiniCache.current.set(profile.id, profile);
    }
    return result;
  }

  const loadData = useCallback(async () => {
    // ── Perf: prevent concurrent in-flight calls ───────────────────
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      setError(null);
      const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData.session;
      if (!session) {
        router.push("/");
        return;
      }
      const uid = session.user.id;
      setMeId(uid);
      // expire_stale_invites is called separately on mount only (see below)

      const [friendRes, requestRes, inviteRes] = await Promise.all([
        supabaseClient.from("friends").select("user_id, friend_id, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
        supabaseClient.from("friend_requests").select("*").or(`sender_id.eq.${uid},receiver_id.eq.${uid}`).order("created_at", { ascending: false }),
        supabaseClient.from("game_invites").select("*").or(`sender_id.eq.${uid},receiver_id.eq.${uid}`).order("created_at", { ascending: false }),
      ]);

      if (friendRes.error) throw friendRes.error;
      if (requestRes.error) throw requestRes.error;
      if (inviteRes.error) throw inviteRes.error;

      const friendRows = (friendRes.data ?? []) as { user_id: string; friend_id: string; created_at: string }[];
      const requestRows = (requestRes.data ?? []) as FriendRequest[];
      const inviteRows = (inviteRes.data ?? []) as GameInvite[];

      const friendProfileIds = friendRows.map((r) => r.friend_id);
      const profileIds = [
        ...friendProfileIds,
        ...requestRows.map((r) => r.sender_id),
        ...requestRows.map((r) => r.receiver_id),
        ...inviteRows.map((r) => r.sender_id),
        ...inviteRows.map((r) => r.receiver_id),
      ];

      const profileMap = await fetchProfiles(profileIds);

      let fpById = new Map<string, FriendProfileRow>();
      if (friendProfileIds.length > 0) {
        const { data: friendProfilesRaw, error: fpErr } = await supabaseClient
          .from("profiles")
          .select("id, username, elo_rating, avatar_url, status, last_seen")
          .in("id", friendProfileIds);
        if (fpErr) throw fpErr;
        fpById = new Map((friendProfilesRaw ?? []).map((row) => [row.id, row as FriendProfileRow]));
      }

      const items: FriendListItem[] = friendRows
        .map((row) => {
          const p = fpById.get(row.friend_id);
          if (!p) return null;
          return { profile: p, friendsSince: row.created_at };
        })
        .filter(Boolean) as FriendListItem[];

      setFriendItems(items);

      setIncomingRequests(
        requestRows
          .filter((row) => row.receiver_id === uid && row.status === "pending")
          .map((row) => ({ ...row, profile: profileMap.get(row.sender_id) }))
      );
      setOutgoingRequests(
        requestRows
          .filter((row) => row.sender_id === uid && row.status === "pending")
          .map((row) => ({ ...row, profile: profileMap.get(row.receiver_id) }))
      );
      setIncomingInvites(
        inviteRows
          .filter((row) => row.receiver_id === uid && isActiveInvite(row))
          .map((row) => ({ ...row, profile: profileMap.get(row.sender_id) }))
      );

      setOutgoingInvites(
        inviteRows
          .filter((row) => row.sender_id === uid && isActiveInvite(row))
          .map((row) => ({ ...row, profile: profileMap.get(row.receiver_id) }))
      );

    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Failed to load friends")));
    } finally {
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // ── Perf: run expire_stale_invites only once on mount ──────────
    void supabaseClient.rpc("expire_stale_invites");
    void loadData();
  }, [loadData]);

  // ── Perf: 5s polling REMOVED — realtime subscriptions handle updates ──

  const profileChannelRef = useRef<ReturnType<typeof supabaseClient.channel> | null>(null);

  useEffect(() => {
    if (!meId || friendItems.length === 0) return;
    const ids = friendIdListKey.split(",").filter(Boolean);
    if (ids.length === 0) return;
    const filter = `id=in.(${ids.join(",")})`;
    const ch = supabaseClient
      .channel(`friends-profiles-${meId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter },
        (payload: { new: Record<string, unknown> }) => {
          const row = payload.new as FriendProfileRow;
          if (!row?.id) return;
          setFriendItems((prev) =>
            prev.map((item) =>
              item.profile.id === row.id
                ? {
                  ...item,
                  profile: {
                    ...item.profile,
                    status: row.status ?? item.profile.status,
                    last_seen: row.last_seen ?? item.profile.last_seen,
                    elo_rating: typeof row.elo_rating === "number" ? row.elo_rating : item.profile.elo_rating,
                    username: row.username ?? item.profile.username,
                    avatar_url: row.avatar_url ?? item.profile.avatar_url,
                  },
                }
                : item
            )
          );
        }
      )
      .subscribe();

    profileChannelRef.current = ch;
    return () => {
      if (profileChannelRef.current) {
        supabaseClient.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [meId, friendIdListKey, friendItems.length]);

  useEffect(() => {
    if (!meId) return;
    const channel = supabaseClient
      .channel(`friends-page-${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${meId}` },
        () => {
          // debounce: collapse rapid-fire events into one reload
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => loadData(), 300);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friend_requests", filter: `sender_id=eq.${meId}` },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => loadData(), 300);
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${meId}` }, () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => loadData(), 300);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "game_invites", filter: `receiver_id=eq.${meId}` },
        () => {
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            loadData();
            showNotice("You have a new match invite.");
          }, 300);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_invites", filter: `receiver_id=eq.${meId}` },
        (payload: { new: GameInvite }) => {
          const row = payload.new;
          if (row.status === "accepted" && row.room_id) {
            redirectToLobby(row.room_id);
            return;
          }
          loadData();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_invites", filter: `sender_id=eq.${meId}` },
        (payload: { new: GameInvite }) => {
          const row = payload.new;
          if (row.status === "accepted" && row.room_id) {
            redirectToLobby(row.room_id);
            return;
          }
          if (row.status === "declined") showNotice("Invite declined.");
          loadData();
        }
      )
      .subscribe();

    // ── Perf: pause realtime-triggered reloads when tab is hidden ──
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadData();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      supabaseClient.removeChannel(channel);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, [meId, loadData, router]);

  async function runSearch() {
    if (!meId) return;
    const keyword = search.trim();
    if (keyword.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setSearching(true);
      setError(null);
      const rows = await searchProfilesByKeyword(meId, keyword, 12);
      setSearchResults(rows);
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Search failed")));
    } finally {
      setSearching(false);
    }
  }

  // ── Real-time search: auto-trigger with 300ms debounce ─────────
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (search.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      void runSearch();
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, meId]);

  async function addFriend(profileId: string) {
    try {
      setActionLoading(`add-${profileId}`);
      setError(null);
      const { error: err } = await supabaseClient.rpc("send_friend_request", { input_receiver_id: profileId });
      if (err) throw err;
      showNotice("Friend request sent.");
      await loadData();
      if (search.trim().length >= 2) await runSearch();
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not send friend request")));
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelFriendRequest(requestId: string, profileId: string) {
    try {
      setActionLoading(`cancel-req-${profileId}`);
      setError(null);
      const { error: err } = await supabaseClient.rpc("cancel_friend_request", {
        input_request_id: requestId,
      });
      if (err) throw err;
      showNotice("Friend request cancelled.");
      await loadData();
      if (search.trim().length >= 2) await runSearch();
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not cancel friend request")));
    } finally {
      setActionLoading(null);
    }
  }

  async function respondFriendRequest(requestId: string, accept: boolean) {
    try {
      setActionLoading(`friend-${requestId}`);
      setError(null);
      const { error: err } = await supabaseClient.rpc("respond_friend_request", {
        input_request_id: requestId,
        input_accept: accept,
      });
      if (err) throw err;
      showNotice(accept ? "Friend request accepted." : "Friend request declined.");
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not respond to request")));
    } finally {
      setActionLoading(null);
    }
  }

  async function inviteFriend(friendId: string) {
    try {
      setActionLoading(`invite-${friendId}`);
      setError(null);

      if (!meId) {
        setError("Sign in required.");
        return;
      }

      const { error: expireErr } = await supabaseClient.rpc("expire_stale_invites");

      if (expireErr) {
        console.warn("expire_stale_invites failed:", {
          message: expireErr.message,
          details: expireErr.details,
          hint: expireErr.hint,
          code: expireErr.code,
        });
      }

      const { error: inviteErr } = await supabaseClient.rpc("send_game_invite", {
        input_receiver_id: friendId,
      });

      if (inviteErr) {
        console.warn("send_game_invite failed:", {
          message: inviteErr.message,
          details: inviteErr.details,
          hint: inviteErr.hint,
          code: inviteErr.code,
        });

        setError(
          formatFriendError(
            extractErrorMessage(inviteErr, "Could not send invite")
          )
        );
        return;
      }

      showNotice("Match invite sent.");
      await loadData();
    } catch (err: unknown) {
      console.warn("inviteFriend unexpected error:", err);
      setError(
        formatFriendError(
          extractErrorMessage(err, "Could not send invite")
        )
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelInvite(inviteId: string) {
    try {
      setActionLoading(`cancel-${inviteId}`);
      setError(null);
      const { error: err } = await supabaseClient.rpc("cancel_game_invite", { input_invite_id: inviteId });
      if (err) throw err;
      showNotice("Invite cancelled.");
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not cancel invite")));
    } finally {
      setActionLoading(null);
    }
  }

  async function respondGameInvite(inviteId: string, accept: boolean) {
    try {
      setActionLoading(`game-${inviteId}`);
      setError(null);
      const { data: roomId, error: err } = await supabaseClient.rpc("respond_game_invite", {
        input_invite_id: inviteId,
        input_accept: accept,
      });
      if (err) throw err;
      await loadData();
      if (accept && roomId) redirectToLobby(roomId as string);
      else showNotice("Invite declined.");
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not respond to invite")));
    } finally {
      setActionLoading(null);
    }
  }

  async function confirmRemoveFriend() {
    if (!meId || !deleteTarget) return;
    try {
      setDeleteLoading(true);
      setError(null);
      await deleteFriendship(meId, deleteTarget.profile.id);
      showNotice("Friend removed.");
      setDeleteTarget(null);
      await loadData();
    } catch (err: unknown) {
      console.error(err);
      setError(formatFriendError(extractErrorMessage(err, "Could not remove friend")));
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="page-container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div
              className="animate-spin-slow"
              style={{
                width: 42,
                height: 42,
                border: "3px solid rgba(124,58,237,0.2)",
                borderTopColor: "#7c3aed",
                borderRadius: "50%",
                margin: "0 auto 14px",
              }}
            />
            <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-heading)" }}>Loading friends…</div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="fp-shell animate-fade-in">
        <div className="fp-container">
          <section className="card fp-hero">
            <div className="fp-hero-copy">
              <span className="fp-kicker">SOCIAL HUB</span>
              <h1 className="fp-title">Friends</h1>
              <p className="fp-desc">Find players, manage requests, and start private matches.</p>
            </div>
            <div className="fp-stats">
              <div className="fp-st fp-st-friends">
                <span className="fp-st-ico" aria-hidden>
                  {"\u{1F465}"}
                </span>
                <div className="fp-st-body">
                  <strong className="fp-st-num fp-num-white">{stats.total}</strong>
                  <span className="fp-st-label">Friends</span>
                </div>
              </div>
              <div className="fp-st fp-st-on">
                <span className="fp-st-ico" aria-hidden>
                  {"\u{1F7E2}"}
                </span>
                <div className="fp-st-body">
                  <strong className="fp-st-num fp-num-green">{stats.online}</strong>
                  <span className="fp-st-label">Online</span>
                </div>
              </div>
              <div className="fp-st fp-st-q">
                <span className="fp-st-ico" aria-hidden>
                  {"\u{1F7E1}"}
                </span>
                <div className="fp-st-body">
                  <strong className="fp-st-num fp-num-amber">{stats.queue}</strong>
                  <span className="fp-st-label">Queue</span>
                </div>
              </div>
              <div className="fp-st fp-st-m">
                <span className="fp-st-ico" aria-hidden>
                  {"\u{1F534}"}
                </span>
                <div className="fp-st-body">
                  <strong className="fp-st-num fp-num-red">{stats.match}</strong>
                  <span className="fp-st-label">Match</span>
                </div>
              </div>
            </div>
          </section>


          {error ? <div className="card fp-alert danger">{error}</div> : null}

          <div className="fp-grid">
            <div className="fp-main">
              <section className="card fp-panel">
                <div className="fp-head">
                  <span className="fp-head-title">Find players</span>
                  <small>Type at least 2 characters</small>
                </div>
                <div className="fp-search-wrap">
                  <input
                    className="fp-search-input"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by username…"
                    aria-label="Search players"
                    autoComplete="off"
                  />
                  {searching && (
                    <span
                      className="animate-spin-slow"
                      style={{
                        display: 'inline-block',
                        width: 16,
                        height: 16,
                        border: '2px solid rgba(124,58,237,0.25)',
                        borderTopColor: '#7c3aed',
                        borderRadius: '50%',
                        flexShrink: 0,
                        marginRight: 12,
                      }}
                    />
                  )}
                </div>
                <div className="fp-list">
                  {searching ? (
                    <EmptyBlock icon={"\u2728"} title="Searching…" hint="Looking for matching usernames." />
                  ) : search.trim().length < 2 ? (
                    <EmptyBlock
                      icon={"\u{1F50D}"}
                      title="Find your next duel"
                      hint="Start typing a username to search."
                    />
                  ) : searchResults.length === 0 ? (
                    <EmptyBlock icon={"\u{1F50D}"} title="No players found." hint="Try a different keyword or spelling." />
                  ) : (
                    searchResults.map((p) => {
                      const already = friendIds.has(p.id);
                      const outgoingPending = outgoingRequests.some((r) => r.receiver_id === p.id);
                      const incomingPending = incomingRequests.some((r) => r.sender_id === p.id);
                      return (
                        <SearchPlayerRow
                          key={p.id}
                          profile={p}
                          onProfile={() => router.push(`/profile/${encodeURIComponent(p.username)}`)}
                          right={
                            already ? (
                              <span className="fp-badge disabled">Already friends</span>
                            ) : outgoingPending ? (
                              (() => {
                                const req = outgoingRequests.find((r) => r.receiver_id === p.id);
                                return (
                                  <button
                                    type="button"
                                    className="btn btn-ghost fp-mini"
                                    disabled={actionLoading === `cancel-req-${p.id}`}
                                    onClick={() => req && cancelFriendRequest(req.id, p.id)}
                                    style={{ color: "#f87171" }}
                                  >
                                    {actionLoading === `cancel-req-${p.id}` ? "…" : "Cancel request"}
                                  </button>
                                );
                              })()
                            ) : incomingPending ? (
                              <span className="fp-badge violet">Incoming request</span>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary fp-mini"
                                disabled={actionLoading === `add-${p.id}`}
                                onClick={() => addFriend(p.id)}
                              >
                                {actionLoading === `add-${p.id}` ? "…" : "Add friend"}
                              </button>
                            )
                          }
                        />
                      );
                    })
                  )}
                </div>
              </section>

              <section className="card fp-panel">
                <div className="fp-head fp-head-row">
                  <div className="fp-head-block">
                    <span className="fp-head-title">Friends</span>
                    <small className="fp-head-sub">{friendItems.length} total</small>
                  </div>
                </div>
                <div className="fp-toolbar">
                  <div className="fp-pills">
                    {(
                      [
                        ["all", "All"],
                        ["online", "Online"],
                        ["offline", "Offline"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`fp-pill ${friendFilter === key ? "is-on" : ""}`}
                        onClick={() => setFriendFilter(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select className="fp-select" value={friendSort} onChange={(e) => setFriendSort(e.target.value as FriendSortKey)}>
                    <option value="recent">Recent</option>
                    <option value="elo_desc">ELO high → low</option>
                    <option value="elo_asc">ELO low → high</option>
                    <option value="name_az">Name A–Z</option>
                  </select>
                </div>
                <div className="fp-list fp-friends-list">
                  {friendItems.length === 0 ? (
                    <EmptyBlock
                      icon={"\u{1F465}"}
                      title="No friends yet"
                      hint="Search for players above and send a friend request."
                    />
                  ) : filteredSortedFriends.length === 0 ? (
                    <EmptyBlock icon={"\u{1F644}"} title="No one in this filter" hint="Try another tab or clear filters." />
                  ) : (
                    filteredSortedFriends.map(({ profile: p }) => {
                      const st = parseUserStatus(p.status);
                      const pendingInv = outgoingInvites.some((i) => i.receiver_id === p.id);
                      return (
                        <FriendRow
                          key={p.id}
                          profile={p}
                          status={st}
                          lastSeen={p.last_seen}
                          pendingOutgoingInvite={pendingInv}
                          inviteLoading={actionLoading === `invite-${p.id}`}
                          onProfile={() => router.push(`/profile/${encodeURIComponent(p.username)}`)}
                          onInvite={() => inviteFriend(p.id)}
                          onRemove={() => setDeleteTarget({ profile: p, friendsSince: friendItems.find((x) => x.profile.id === p.id)?.friendsSince ?? "" })}
                        />
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <aside className="fp-side">
              <section className="card fp-panel">
                <div className="fp-head">
                  <span className="fp-head-title">Friend requests</span>
                  {incomingRequests.length > 0 ? <small className="fp-ping">{incomingRequests.length} new</small> : <small>No new</small>}
                </div>
                <div className="fp-list">
                  {incomingRequests.length === 0 ? (
                    <EmptyBlock
                      icon={"\u{1F4ED}"}
                      title="Inbox clear"
                      hint="New requests will appear here."
                    />
                  ) : (
                    incomingRequests.map((req) =>
                      req.profile ? (
                        <div key={req.id} className="fp-inbox-row">
                          <SearchPlayerRow
                            profile={req.profile}
                            onProfile={() => router.push(`/profile/${encodeURIComponent(req.profile!.username)}`)}
                            right={
                              <div className="fp-inbox-actions">
                                <button
                                  type="button"
                                  className="btn btn-success fp-mini"
                                  disabled={actionLoading === `friend-${req.id}`}
                                  onClick={() => respondFriendRequest(req.id, true)}
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost fp-mini"
                                  disabled={actionLoading === `friend-${req.id}`}
                                  onClick={() => respondFriendRequest(req.id, false)}
                                >
                                  Decline
                                </button>
                              </div>
                            }
                          />
                        </div>
                      ) : null
                    )
                  )}
                </div>
              </section>

              <section className="card fp-panel">
                <div className="fp-head">
                  <span className="fp-head-title">Match invites</span>
                  <small>{incomingInvites.length} pending</small>
                </div>
                <div className="fp-list">
                  {incomingInvites.length === 0 ? (
                    <EmptyBlock icon={"\u2694"} title="No duels pending" hint="Private invites show up here." />
                  ) : (
                    incomingInvites.map((inv) =>
                      inv.profile ? (
                        <div key={inv.id} className="fp-inbox-row">
                          <SearchPlayerRow
                            profile={inv.profile}
                            onProfile={() => router.push(`/profile/${encodeURIComponent(inv.profile!.username)}`)}
                            right={
                              <div className="fp-inbox-actions">
                                <button
                                  type="button"
                                  className="btn btn-primary fp-mini"
                                  disabled={actionLoading === `game-${inv.id}`}
                                  onClick={() => respondGameInvite(inv.id, true)}
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost fp-mini"
                                  disabled={actionLoading === `game-${inv.id}`}
                                  onClick={() => respondGameInvite(inv.id, false)}
                                >
                                  Decline
                                </button>
                              </div>
                            }
                          />
                        </div>
                      ) : null
                    )
                  )}
                </div>
              </section>

              {(outgoingRequests.length > 0 || outgoingInvites.length > 0) && (
                <section className="card fp-panel fp-wait">
                  <div className="fp-head">
                    <span className="fp-head-title">Waiting</span>
                    <small>Total {outgoingRequests.length + outgoingInvites.length}</small>
                  </div>
                  <div className="fp-wait-body">
                    {outgoingRequests.map((req) =>
                      req.profile ? (
                        <div key={req.id} className="fp-wait-line">
                          Friend request to <b>{req.profile.username}</b>
                        </div>
                      ) : null
                    )}
                    {outgoingInvites.map((inv) =>
                      inv.profile ? (
                        <div key={inv.id} className="fp-wait-line" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span>Match invite to <b>{inv.profile.username}</b></span>
                          <button
                            type="button"
                            className="btn btn-ghost fp-mini"
                            disabled={actionLoading === `cancel-${inv.id}`}
                            onClick={() => cancelInvite(inv.id)}
                            style={{ color: "#ef4444", flexShrink: 0 }}
                          >
                            {actionLoading === `cancel-${inv.id}` ? "…" : "Cancel"}
                          </button>
                        </div>
                      ) : null
                    )}
                  </div>
                </section>
              )}

            </aside>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        username={deleteTarget?.profile.username ?? ""}
        loading={deleteLoading}
        onCancel={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmRemoveFriend()}
      />

      <style jsx>{`
        .fp-shell {
          position: relative;
          z-index: 1;
          min-height: 100vh;
          padding: calc(var(--navbar-height) + 20px) 22px 28px;
        }

        .fp-container {
          width: min(1240px, 100%);
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .fp-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 18px;
          padding: 18px 20px;
          border-color: rgba(124, 58, 237, 0.22);
        }

        .fp-kicker {
          display: block;
          font-family: var(--font-heading);
          font-weight: 700;
          letter-spacing: 0.18em;
          font-size: 0.7rem;
          color: rgba(148, 163, 184, 0.95);
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .fp-title {
          margin: 0;
          font-family: var(--font-heading);
          font-size: clamp(1.75rem, 2.2vw, 2.25rem);
          color: #f8fafc;
          line-height: 1;
        }

        .fp-desc {
          margin: 8px 0 0;
          max-width: 520px;
          color: rgba(226, 232, 240, 0.72);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .fp-stats {
          display: grid;
          grid-template-columns: repeat(2, minmax(104px, 1fr));
          gap: 8px;
          width: min(340px, 100%);
        }

        .fp-st {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          min-height: 64px;
        }

        .fp-st-ico {
          font-size: 1.25rem;
          line-height: 1;
        }

        .fp-st-body {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .fp-st-num {
          font-family: var(--font-heading);
          font-size: 1.35rem;
          line-height: 1;
          font-weight: 800;
        }

        .fp-num-white {
          color: #f8fafc;
        }
        .fp-num-green {
          color: #34d399;
        }
        .fp-num-amber {
          color: #fbbf24;
        }
        .fp-num-red {
          color: #f87171;
        }

        .fp-st-label {
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          font-family: var(--font-heading);
          font-weight: 700;
          color: rgba(148, 163, 184, 0.95);
        }

        .fp-alert {
          padding: 12px 14px;
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 0.9rem;
        }
        .fp-alert.success {
          border-color: rgba(16, 185, 129, 0.35);
          color: #10b981;
        }
        .fp-alert.danger {
          border-color: rgba(239, 68, 68, 0.35);
          color: #ef4444;
        }

        .fp-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(300px, 0.95fr);
          gap: 14px;
          align-items: start;
        }

        .fp-main {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .fp-side {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .fp-panel {
          padding: 16px;
        }

        .fp-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 12px;
        }

        .fp-head-row {
          align-items: flex-start;
        }

        .fp-head-block {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
        }

        .fp-head-title {
          font-family: var(--font-heading);
          font-weight: 800;
          font-size: 1rem;
          color: #f8fafc;
          line-height: 1.2;
        }

        .fp-head-sub {
          display: block;
          margin: 0;
        }

        .fp-head small {
          color: rgba(148, 163, 184, 0.95);
          font-size: 0.74rem;
          font-family: var(--font-heading);
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .fp-ping {
          color: #fecaca !important;
        }

        .fp-search-wrap {
          position: relative;
          width: 100%;
          margin-bottom: 4px;
        }

        .fp-search-input {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: var(--text-primary);
          border-radius: 12px;
          padding: 12px 48px 12px 14px;
          font-size: 0.95rem;
          outline: none;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .fp-search-input:focus {
          border-color: rgba(124, 58, 237, 0.55);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
        }

        .fp-search-btn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          background: rgba(124, 58, 237, 0.25);
          color: #f8fafc;
          font-size: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s ease;
        }

        .fp-search-btn:hover:not(:disabled) {
          background: rgba(124, 58, 237, 0.4);
        }

        .fp-search-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .fp-list {
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
          background: rgba(0, 0, 0, 0.12);
        }

        .fp-friends-list {
          max-height: min(520px, 55vh);
          overflow: auto;
        }

        .fp-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .fp-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .fp-pill {
          height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.03);
          color: rgba(226, 232, 240, 0.9);
          font-family: var(--font-heading);
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .fp-pill.is-on {
          border-color: rgba(124, 58, 237, 0.45);
          background: rgba(124, 58, 237, 0.18);
          color: #fff;
        }

        .fp-select {
          height: 32px;
          padding: 0 10px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          color: #e2e8f0;
          font-family: var(--font-heading);
          font-size: 12px;
          font-weight: 600;
        }

        .fp-mini {
          height: 32px;
          padding: 0 12px;
          font-size: 12px;
        }

        .fp-badge {
          display: inline-flex;
          align-items: center;
          height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          font-family: var(--font-heading);
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .fp-badge.disabled {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(148, 163, 184, 0.95);
        }

        .fp-badge.violet {
          background: rgba(124, 58, 237, 0.2);
          border: 1px solid rgba(167, 139, 250, 0.35);
          color: #ddd6fe;
        }

        .fp-inbox-row :global(.spr-row) {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .fp-inbox-row:last-child :global(.spr-row) {
          border-bottom: none;
        }

        .fp-inbox-actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .fp-wait {
          border-color: rgba(245, 158, 11, 0.22);
        }

        .fp-wait-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .fp-wait-line {
          font-size: 0.85rem;
          color: rgba(148, 163, 184, 0.95);
          line-height: 1.4;
        }

        .fp-wait-line b {
          color: #f8fafc;
        }

        .fp-back {
          width: 100%;
          min-height: 44px;
        }

        @media (max-width: 1024px) {
          .fp-grid {
            grid-template-columns: 1fr;
          }
          .fp-side {
            order: 3;
          }
        }

        @media (max-width: 768px) {
          .fp-shell {
            padding: calc(var(--navbar-height) + 12px) 12px 88px;
          }
          .fp-hero {
            grid-template-columns: 1fr;
          }
          .fp-stats {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
