"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../components/Navbar";
import { supabaseClient } from "../../lib/supabase";

type Profile = {
  id: string;
  username: string;
  elo_rating: number;
  avatar_url: string | null;
};

type FriendRow = {
  user_id: string;
  friend_id: string;
  created_at: string;
};

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
  status: "pending" | "accepted" | "declined" | "cancelled";
  created_at: string;
  responded_at: string | null;
};

type RequestWithProfile = FriendRequest & {
  profile?: Profile;
};

type InviteWithProfile = GameInvite & {
  profile?: Profile;
};

function formatFriendError(message: string) {
  const lower = message.toLowerCase();

  if (
    lower.includes("player_is_busy") ||
    lower.includes("one_player_already_in_match") ||
    lower.includes("one_player_already_matchmaking")
  ) {
    return "Pemain sedang bermain atau sedang matchmaking.";
  }

  if (lower.includes("invite_already_pending")) {
    return "Invite sudah dikirim dan masih pending.";
  }

  if (lower.includes("request_already_pending")) {
    return "Friend request sudah dikirim dan masih pending.";
  }

  if (lower.includes("already_friends")) {
    return "Player ini sudah menjadi teman kamu.";
  }

  if (lower.includes("not_friends")) {
    return "Kamu harus berteman dulu sebelum mengirim invite.";
  }

  if (lower.includes("cannot_invite_yourself")) {
    return "Kamu tidak bisa invite diri sendiri.";
  }

  if (lower.includes("cannot_add_yourself")) {
    return "Kamu tidak bisa menambahkan diri sendiri.";
  }

  if (lower.includes("invite_not_found")) {
    return "Invite sudah tidak tersedia.";
  }

  if (lower.includes("request_not_found")) {
    return "Friend request sudah tidak tersedia.";
  }

  return message || "Terjadi kesalahan.";
}

function getInitials(name: string) {
  return name
    .split("_")
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function Avatar({ profile }: { profile: Profile }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: "50%",
        overflow: "hidden",
        background: profile.avatar_url
          ? "transparent"
          : "linear-gradient(135deg, rgba(124,58,237,0.8), rgba(245,158,11,0.8))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        border: "2px solid rgba(124,58,237,0.25)",
      }}
    >
      {profile.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.username}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      ) : (
        <span
          style={{
            color: "white",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "0.82rem",
          }}
        >
          {getInitials(profile.username)}
        </span>
      )}
    </div>
  );
}

function PlayerLine({
  profile,
  subtitle,
  right,
}: {
  profile: Profile;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: "14px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <Avatar profile={profile} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {profile.username}
        </div>

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.82rem",
            marginTop: 2,
          }}
        >
          {subtitle ?? `ELO ${profile.elo_rating ?? 1000}`}
        </div>
      </div>

      {right}
    </div>
  );
}

export default function FriendsPage() {
  const router = useRouter();

  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [friends, setFriends] = useState<Profile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<RequestWithProfile[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<RequestWithProfile[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<InviteWithProfile[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<InviteWithProfile[]>([]);

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const friendIds = useMemo(() => {
    return new Set(friends.map((friend) => friend.id));
  }, [friends]);

  function showNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 2500);
  }

  function redirectToRoom(roomId: string) {
    const currentPath =
      typeof window !== "undefined" ? window.location.pathname : "";

    if (currentPath === `/game/${roomId}`) return;

    showNotice("⚔️ Match accepted! Starting game...");

    setTimeout(() => {
      router.push(`/game/${roomId}`);
    }, 700);
  }

  async function fetchProfiles(ids: string[]) {
    const uniqueIds = [...new Set(ids)].filter(Boolean);

    if (uniqueIds.length === 0) {
      return new Map<string, Profile>();
    }

    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username, elo_rating, avatar_url")
      .in("id", uniqueIds);

    if (error) throw error;

    return new Map(
      (data ?? []).map((profile) => [profile.id, profile as Profile])
    );
  }

  const loadData = useCallback(async () => {
    try {
      setError(null);

      const { data: sessionData, error: sessionError } =
        await supabaseClient.auth.getSession();

      if (sessionError) throw sessionError;

      const session = sessionData.session;

      if (!session) {
        router.push("/");
        return;
      }

      const uid = session.user.id;
      setMeId(uid);

      const [friendRes, requestRes, inviteRes] = await Promise.all([
        supabaseClient
          .from("friends")
          .select("user_id, friend_id, created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false }),

        supabaseClient
          .from("friend_requests")
          .select("*")
          .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
          .order("created_at", { ascending: false }),

        supabaseClient
          .from("game_invites")
          .select("*")
          .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
          .order("created_at", { ascending: false }),
      ]);

      if (friendRes.error) throw friendRes.error;
      if (requestRes.error) throw requestRes.error;
      if (inviteRes.error) throw inviteRes.error;

      const friendRows = (friendRes.data ?? []) as FriendRow[];
      const requestRows = (requestRes.data ?? []) as FriendRequest[];
      const inviteRows = (inviteRes.data ?? []) as GameInvite[];

      const profileIds = [
        ...friendRows.map((row) => row.friend_id),
        ...requestRows.map((row) => row.sender_id),
        ...requestRows.map((row) => row.receiver_id),
        ...inviteRows.map((row) => row.sender_id),
        ...inviteRows.map((row) => row.receiver_id),
      ];

      const profileMap = await fetchProfiles(profileIds);

      setFriends(
        friendRows
          .map((row) => profileMap.get(row.friend_id))
          .filter(Boolean) as Profile[]
      );

      setIncomingRequests(
        requestRows
          .filter((row) => row.receiver_id === uid && row.status === "pending")
          .map((row) => ({
            ...row,
            profile: profileMap.get(row.sender_id),
          }))
      );

      setOutgoingRequests(
        requestRows
          .filter((row) => row.sender_id === uid && row.status === "pending")
          .map((row) => ({
            ...row,
            profile: profileMap.get(row.receiver_id),
          }))
      );

      setIncomingInvites(
        inviteRows
          .filter((row) => row.receiver_id === uid && row.status === "pending")
          .map((row) => ({
            ...row,
            profile: profileMap.get(row.sender_id),
          }))
      );

      setOutgoingInvites(
        inviteRows
          .filter((row) => row.sender_id === uid && row.status === "pending")
          .map((row) => ({
            ...row,
            profile: profileMap.get(row.receiver_id),
          }))
      );
    } catch (err: any) {
      console.error("Failed to load friends:", err);
      setError(formatFriendError(err?.message || "Failed to load friends"));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!meId) return;

    const channel = supabaseClient
      .channel(`friends-page-${meId}`)

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `receiver_id=eq.${meId}`,
        },
        () => {
          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `sender_id=eq.${meId}`,
        },
        () => {
          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friends",
          filter: `user_id=eq.${meId}`,
        },
        () => {
          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "game_invites",
          filter: `receiver_id=eq.${meId}`,
        },
        () => {
          loadData();
          showNotice("⚔️ Kamu mendapat match invite baru.");
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `receiver_id=eq.${meId}`,
        },
        (payload: any) => {
          const row = payload.new as GameInvite;

          if (row.status === "accepted" && row.room_id) {
            redirectToRoom(row.room_id);
            return;
          }

          loadData();
        }
      )

      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "game_invites",
          filter: `sender_id=eq.${meId}`,
        },
        (payload: any) => {
          const row = payload.new as GameInvite;

          if (row.status === "accepted" && row.room_id) {
            redirectToRoom(row.room_id);
            return;
          }

          if (row.status === "declined") {
            showNotice("Invite ditolak.");
          }

          loadData();
        }
      )

      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [meId, loadData, router]);

  async function searchPlayers(e?: React.FormEvent) {
    e?.preventDefault();

    if (!meId) return;

    const keyword = search.trim();

    if (keyword.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      setError(null);

      const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username, elo_rating, avatar_url")
        .ilike("username", `%${keyword}%`)
        .neq("id", meId)
        .limit(12);

      if (error) throw error;

      setSearchResults((data ?? []) as Profile[]);
    } catch (err: any) {
      console.error("Search failed:", err);
      setError(formatFriendError(err?.message || "Search failed"));
    } finally {
      setSearching(false);
    }
  }

  async function addFriend(profileId: string) {
    try {
      setActionLoading(`add-${profileId}`);
      setError(null);

      const { error } = await supabaseClient.rpc("send_friend_request", {
        input_receiver_id: profileId,
      });

      if (error) throw error;

      showNotice("Friend request berhasil dikirim.");
      await loadData();
      await searchPlayers();
    } catch (err: any) {
      console.error("Add friend failed:", err);
      setError(formatFriendError(err?.message || "Add friend failed"));
    } finally {
      setActionLoading(null);
    }
  }

  async function respondFriendRequest(requestId: string, accept: boolean) {
    try {
      setActionLoading(`friend-${requestId}`);
      setError(null);

      const { error } = await supabaseClient.rpc("respond_friend_request", {
        input_request_id: requestId,
        input_accept: accept,
      });

      if (error) throw error;

      showNotice(accept ? "Friend request diterima." : "Friend request ditolak.");
      await loadData();
    } catch (err: any) {
      console.error("Respond friend request failed:", err);
      setError(formatFriendError(err?.message || "Failed to respond friend request"));
    } finally {
      setActionLoading(null);
    }
  }

  async function inviteFriend(friendId: string) {
    try {
      setActionLoading(`invite-${friendId}`);
      setError(null);

      const { error } = await supabaseClient.rpc("send_game_invite", {
        input_receiver_id: friendId,
      });

      if (error) throw error;

      showNotice("Match invite berhasil dikirim.");
      await loadData();
    } catch (err: any) {
      console.error("Invite friend failed:", err);
      setError(formatFriendError(err?.message || "Invite friend failed"));
    } finally {
      setActionLoading(null);
    }
  }

  async function respondGameInvite(inviteId: string, accept: boolean) {
    try {
      setActionLoading(`game-${inviteId}`);
      setError(null);

      const { data: roomId, error } = await supabaseClient.rpc(
        "respond_game_invite",
        {
          input_invite_id: inviteId,
          input_accept: accept,
        }
      );

      if (error) throw error;

      await loadData();

      if (accept && roomId) {
        redirectToRoom(roomId);
      } else {
        showNotice("Invite ditolak.");
      }
    } catch (err: any) {
      console.error("Respond game invite failed:", err);
      setError(formatFriendError(err?.message || "Failed to respond game invite"));
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />

        <div
          className="page-container"
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
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

            <div
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-heading)",
              }}
            >
              Loading friends...
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />

      <div
        className="animate-fade-in"
        style={{
          paddingTop: "calc(var(--navbar-height) + 32px)",
          paddingBottom: "32px",
          paddingLeft: "24px",
          paddingRight: "24px",
          minHeight: "100vh",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>👥</div>

            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: "2rem",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Friends
            </h1>

            <p
              style={{
                color: "var(--text-muted)",
                marginTop: 8,
                fontSize: "0.92rem",
              }}
            >
              Search players, add friends, invite them, and start a private match.
            </p>
          </div>

          {notice && (
            <div
              className="card animate-fade-in"
              style={{
                marginBottom: 18,
                padding: 14,
                borderColor: "rgba(16,185,129,0.35)",
                color: "#10b981",
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
              }}
            >
              {notice}
            </div>
          )}

          {error && (
            <div
              className="card"
              style={{
                marginBottom: 18,
                padding: 14,
                borderColor: "rgba(239,68,68,0.35)",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* SEARCH PLAYER */}
          <div className="card" style={{ padding: 18, marginBottom: 18 }}>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                color: "var(--text-primary)",
                marginBottom: 12,
              }}
            >
              🔎 Search Player
            </div>

            <form
              onSubmit={searchPlayers}
              style={{
                display: "flex",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search username..."
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--text-primary)",
                  outline: "none",
                }}
              />

              <button
                className="btn btn-primary"
                type="submit"
                disabled={searching}
                style={{ minWidth: 110 }}
              >
                {searching ? "Searching..." : "Search"}
              </button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {searchResults.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    textAlign: "center",
                    padding: "10px 0",
                  }}
                >
                  Search username minimal 2 karakter.
                </div>
              ) : (
                searchResults.map((profile) => {
                  const alreadyFriend = friendIds.has(profile.id);
                  const outgoingPending = outgoingRequests.some(
                    (req) => req.receiver_id === profile.id
                  );
                  const incomingPending = incomingRequests.some(
                    (req) => req.sender_id === profile.id
                  );

                  return (
                    <PlayerLine
                      key={profile.id}
                      profile={profile}
                      right={
                        alreadyFriend ? (
                          <span
                            style={{
                              color: "#10b981",
                              fontFamily: "var(--font-heading)",
                              fontWeight: 800,
                              fontSize: "0.82rem",
                            }}
                          >
                            Friend
                          </span>
                        ) : outgoingPending ? (
                          <span
                            style={{
                              color: "#f59e0b",
                              fontFamily: "var(--font-heading)",
                              fontWeight: 800,
                              fontSize: "0.82rem",
                            }}
                          >
                            Pending
                          </span>
                        ) : incomingPending ? (
                          <span
                            style={{
                              color: "#a78bfa",
                              fontFamily: "var(--font-heading)",
                              fontWeight: 800,
                              fontSize: "0.82rem",
                            }}
                          >
                            Request masuk
                          </span>
                        ) : (
                          <button
                            className="btn btn-secondary"
                            disabled={actionLoading === `add-${profile.id}`}
                            onClick={() => addFriend(profile.id)}
                          >
                            {actionLoading === `add-${profile.id}`
                              ? "Adding..."
                              : "Add"}
                          </button>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 18,
            }}
          >
            {/* FRIEND REQUESTS */}
            <div className="card" style={{ padding: 18 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  marginBottom: 12,
                  color: "var(--text-primary)",
                }}
              >
                📩 Friend Requests
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {incomingRequests.length === 0 ? (
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Tidak ada request masuk.
                  </div>
                ) : (
                  incomingRequests.map((req) =>
                    req.profile ? (
                      <PlayerLine
                        key={req.id}
                        profile={req.profile}
                        subtitle="Wants to be your friend"
                        right={
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn btn-success"
                              disabled={actionLoading === `friend-${req.id}`}
                              onClick={() => respondFriendRequest(req.id, true)}
                            >
                              Accept
                            </button>

                            <button
                              className="btn btn-ghost"
                              disabled={actionLoading === `friend-${req.id}`}
                              onClick={() => respondFriendRequest(req.id, false)}
                            >
                              Decline
                            </button>
                          </div>
                        }
                      />
                    ) : null
                  )
                )}
              </div>
            </div>

            {/* GAME INVITES */}
            <div className="card" style={{ padding: 18 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  marginBottom: 12,
                  color: "var(--text-primary)",
                }}
              >
                ⚔️ Game Invites
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {incomingInvites.length === 0 ? (
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Tidak ada invite match.
                  </div>
                ) : (
                  incomingInvites.map((invite) =>
                    invite.profile ? (
                      <PlayerLine
                        key={invite.id}
                        profile={invite.profile}
                        subtitle="Invited you to a match"
                        right={
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              className="btn btn-primary"
                              disabled={actionLoading === `game-${invite.id}`}
                              onClick={() => respondGameInvite(invite.id, true)}
                            >
                              Accept
                            </button>

                            <button
                              className="btn btn-ghost"
                              disabled={actionLoading === `game-${invite.id}`}
                              onClick={() => respondGameInvite(invite.id, false)}
                            >
                              Decline
                            </button>
                          </div>
                        }
                      />
                    ) : null
                  )
                )}
              </div>
            </div>
          </div>

          {/* FRIEND LIST */}
          <div className="card" style={{ padding: 18, marginTop: 18 }}>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                marginBottom: 12,
                color: "var(--text-primary)",
              }}
            >
              👥 Your Friends
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {friends.length === 0 ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.85rem",
                    textAlign: "center",
                    padding: "16px 0",
                  }}
                >
                  Belum ada teman. Search player lalu klik Add.
                </div>
              ) : (
                friends.map((friend) => {
                  const alreadyInvited = outgoingInvites.some(
                    (invite) => invite.receiver_id === friend.id
                  );

                  return (
                    <PlayerLine
                      key={friend.id}
                      profile={friend}
                      right={
                        alreadyInvited ? (
                          <span
                            style={{
                              color: "#f59e0b",
                              fontFamily: "var(--font-heading)",
                              fontWeight: 800,
                              fontSize: "0.82rem",
                            }}
                          >
                            Invite sent
                          </span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            disabled={actionLoading === `invite-${friend.id}`}
                            onClick={() => inviteFriend(friend.id)}
                          >
                            {actionLoading === `invite-${friend.id}`
                              ? "Inviting..."
                              : "Invite"}
                          </button>
                        )
                      }
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* PENDING INFO */}
          {(outgoingRequests.length > 0 || outgoingInvites.length > 0) && (
            <div className="card" style={{ padding: 18, marginTop: 18 }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  marginBottom: 12,
                  color: "var(--text-primary)",
                }}
              >
                ⏳ Pending
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outgoingRequests.map((req) =>
                  req.profile ? (
                    <div
                      key={req.id}
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.86rem",
                      }}
                    >
                      Friend request sent to{" "}
                      <b style={{ color: "var(--text-primary)" }}>
                        {req.profile.username}
                      </b>
                    </div>
                  ) : null
                )}

                {outgoingInvites.map((invite) =>
                  invite.profile ? (
                    <div
                      key={invite.id}
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.86rem",
                      }}
                    >
                      Match invite sent to{" "}
                      <b style={{ color: "var(--text-primary)" }}>
                        {invite.profile.username}
                      </b>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          <button
            className="btn btn-ghost"
            onClick={() => router.push("/dashboard")}
            style={{ width: "100%", marginTop: 18 }}
          >
            ← Dashboard
          </button>
        </div>
      </div>
    </>
  );
}