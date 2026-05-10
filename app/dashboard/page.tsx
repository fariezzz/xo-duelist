"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSound from "use-sound";
import { supabaseClient } from "../../lib/supabase";
import MatchFoundModal from "../../components/notifications/MatchFoundModal";
import TierBadge from "../../components/TierBadge";
import { getRandomPersona } from "../../lib/aiPlayer";
import ArenaCard from "../../components/ArenaCard";
import RightPanel, {
  FriendPresenceItem,
} from "../../components/RightPanel";
import Sidebar, { SidebarNavKey } from "../../components/Sidebar";
import { useStatusManager } from "../../hooks/useStatusManager";
import { useFriendsStatus } from "../../hooks/useFriendsStatus";
import { useOnlineCount } from "../../hooks/useOnlineCount";
import { statusSortWeight, UserStatus } from "../../lib/statusUtils";

type Profile = {
  id: string;
  username: string;
  elo_rating: number;
  wins: number;
  losses: number;
  draws: number;
  avatar_url: string | null;
};

type RankSummary = {
  position: number;
  total: number;
};

type FriendLinkRow = {
  friend_id: string;
};

type ProfilePresenceRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  status?: UserStatus | null;
  last_seen?: string | null;
};

type RecentHistoryRow = {
  id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  winner_elo_before: number;
  winner_elo_after: number;
  loser_elo_before: number;
  loser_elo_after: number;
  played_at: string;
  match_type: "pvp" | "ai_ranked" | "ai_casual" | "ai" | null;
};

type RecentMatchItem = {
  id: string;
  result: "W" | "L" | "D";
  opponentName: string;
  opponentUsername?: string;
  eloDelta: number;
};

const TIERS = [
  { name: "Bronze", min: 0, max: 799, color: "#b45309" },
  { name: "Silver", min: 800, max: 999, color: "#94a3b8" },
  { name: "Gold", min: 1000, max: 1199, color: "#f59e0b" },
  { name: "Platinum", min: 1200, max: 1399, color: "#22d3ee" },
  { name: "Diamond", min: 1400, max: Number.POSITIVE_INFINITY, color: "#60a5fa" },
] as const;

function getInitials(username: string): string {
  const initials = username
    .split(/\s+/)
    .map((chunk) => chunk.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials || username.charAt(0).toUpperCase() || "?";
}

function truncateName(name: string): string {
  if (name.length <= 12) return name;
  return `${name.slice(0, 12)}...`;
}

export default function DashboardPage() {
  const router = useRouter();
  const friendIdSetRef = useRef<Set<string>>(new Set());

  const [profile, setProfile] = useState<Profile | null>(null);
  const [rank, setRank] = useState<RankSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<SidebarNavKey | null>(null);
  const [pendingFriendRequestCount, setPendingFriendRequestCount] = useState(0);
  const [arenaInviteCount, setArenaInviteCount] = useState(0);
  const [activeGameRoomId, setActiveGameRoomId] = useState<string | null>(null);

  // Invite from dashboard
  const [invitingFriendId, setInvitingFriendId] = useState<string | null>(null);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
  const [outgoingInviteMap, setOutgoingInviteMap] = useState<Map<string, string>>(new Map());


  const [viewerId, setViewerId] = useState<string | null>(null);
  const [recentMatches, setRecentMatches] = useState<RecentMatchItem[]>([]);
  const { currentStatus, setStatus } = useStatusManager(viewerId);
  const { friends: friendsFromStatus } = useFriendsStatus(viewerId);
  const onlineCounts = useOnlineCount();
  const friendsOnline = useMemo<FriendPresenceItem[]>(() => {
    const mapped: FriendPresenceItem[] = friendsFromStatus.map((friend) => ({
      id: friend.id,
      username: friend.username,
      avatarUrl: friend.avatar_url,
      status: friend.status,
      lastSeen: friend.last_seen,
    }));
    mapped.sort((a, b) => {
      const aWeight = statusSortWeight(a.status);
      const bWeight = statusSortWeight(b.status);
      if (aWeight !== bWeight) return aWeight - bWeight;
      return a.username.localeCompare(b.username);
    });
    return mapped;
  }, [friendsFromStatus]);
  const totalFriends = friendsOnline.length;

  const [aiLoading, setAiLoading] = useState(false);
  const [aiMatchFound, setAiMatchFound] = useState<{
    gameId: string;
    myName: string;
    myElo: number;
    myAvatarUrl: string | null;
    oppName: string;
    oppElo: number;
  } | null>(null);
  const [playMatchFound] = useSound("/sounds/match-found.mp3", { volume: 0.7 });

  const totalMatches = useMemo(() => {
    if (!profile) return 0;
    return profile.wins + profile.losses + profile.draws;
  }, [profile]);

  const winrate = useMemo(() => {
    if (!profile || totalMatches === 0) return 0;
    return Math.round((profile.wins / totalMatches) * 100);
  }, [profile, totalMatches]);

  const tierInfo = useMemo(() => {
    const elo = profile?.elo_rating ?? 0;
    const currentTierIndex = TIERS.findIndex((tier) => elo >= tier.min && elo <= tier.max);
    const safeTierIndex = currentTierIndex === -1 ? 0 : currentTierIndex;
    const currentTier = TIERS[safeTierIndex];
    const nextTier = safeTierIndex < TIERS.length - 1 ? TIERS[safeTierIndex + 1] : null;
    const isMaxTier = !nextTier;
    const range = nextTier ? nextTier.min - currentTier.min : 0;
    const progressRaw = nextTier ? ((elo - currentTier.min) / range) * 100 : 100;
    const progress = Math.max(0, Math.min(100, progressRaw));
    const eloToNext = nextTier ? Math.max(0, nextTier.min - elo) : 0;
    return { currentTier, nextTier, isMaxTier, progress, eloToNext };
  }, [profile?.elo_rating]);

  async function loadFriendProfiles(userId: string) {
    const { data: links, error: linksError } = await supabaseClient
      .from("friends")
      .select("friend_id")
      .eq("user_id", userId);

    if (linksError) throw linksError;

    const rows = (links ?? []) as FriendLinkRow[];
    const friendIds = rows.map((row) => row.friend_id);
    friendIdSetRef.current = new Set(friendIds);

    if (friendIds.length === 0) {
      return;
    }

    const withPresence = await supabaseClient
      .from("profiles")
      .select("id, username, avatar_url, status, last_seen")
      .in("id", friendIds);

    let source = withPresence.data as ProfilePresenceRow[] | null;
    if (withPresence.error) {
      const fallback = await supabaseClient
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", friendIds);

      if (fallback.error) throw fallback.error;
      source = (fallback.data ?? []) as ProfilePresenceRow[];
    }

    // Friends list is sourced from useFriendsStatus hook.
  }

  async function refreshCounts(userId: string) {
    const [requestCountRes, inviteCountRes] = await Promise.all([
      supabaseClient
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending"),
      supabaseClient
        .from("game_invites")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending"),
    ]);

    setPendingFriendRequestCount(requestCountRes.count ?? 0);
    setArenaInviteCount(inviteCountRes.count ?? 0);
  }

  async function refreshOutgoingInvites(userId: string) {
    const { data } = await supabaseClient
      .from("game_invites")
      .select("id, receiver_id")
      .eq("sender_id", userId)
      .eq("status", "pending");
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      map.set(row.receiver_id, row.id);
    }
    setOutgoingInviteMap(map);
  }



  async function handleInviteFriend(friendId: string) {
    if (!viewerId || invitingFriendId) return;
    setInvitingFriendId(friendId);
    try {
      // Auto-expire stale invites first
      await supabaseClient.rpc("expire_stale_invites");
      const { error: err } = await supabaseClient.rpc("send_game_invite", {
        input_receiver_id: friendId,
      });
      if (err) {
        const msg = err.message?.toLowerCase() ?? "";
        if (msg.includes("sender_busy")) {
          console.log("You are in a match or matchmaking.");
        } else if (msg.includes("receiver_busy")) {
          console.log("Your friend is in a match or matchmaking.");
        } else if (msg.includes("invite_already_pending")) {
          console.log("An invite is already pending.");
        } else if (msg.includes("not_friends")) {
          console.log("You must be friends first.");
        } else {
          console.log(err.message || "Could not send invite.");
        }
        return;
      }
      console.log("Match invite sent!");
      await refreshOutgoingInvites(viewerId);
    } catch (err) {
      console.error("Invite failed:", err);
      console.log("Could not send invite.");
    } finally {
      setInvitingFriendId(null);
    }
  }

  async function handleCancelInvite(inviteId: string) {
    if (!viewerId || cancellingInviteId) return;
    setCancellingInviteId(inviteId);
    try {
      const { error: err } = await supabaseClient.rpc("cancel_game_invite", {
        input_invite_id: inviteId,
      });
      if (err) {
        console.log(err.message || "Could not cancel invite.");
        return;
      }
      console.log("Invite cancelled.");
      await refreshOutgoingInvites(viewerId);
    } catch (err) {
      console.error("Cancel invite failed:", err);
      console.log("Could not cancel invite.");
    } finally {
      setCancellingInviteId(null);
    }
  }

  async function handleChallengeAI() {
    if (aiLoading) return;
    setAiLoading(true);
    setActiveNav("vs_ai");
    try {
      const { data, error: rpcErr } = await supabaseClient.rpc("create_ai_match", {
        input_difficulty: "adaptive",
        input_origin: "dashboard",
      });
      if (rpcErr) throw rpcErr;

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.room_id) throw new Error("No room created");

      const session = await supabaseClient.auth.getSession();
      const uid = session.data.session?.user.id;
      const { data: myProfile } = await supabaseClient
        .from("profiles")
        .select("username, elo_rating, avatar_url")
        .eq("id", uid ?? "")
        .maybeSingle();

      const persona = getRandomPersona();
      setAiMatchFound({
        gameId: row.room_id,
        myName: myProfile?.username ?? "You",
        myElo: myProfile?.elo_rating ?? 1000,
        myAvatarUrl: myProfile?.avatar_url ?? null,
        oppName: persona,
        oppElo: myProfile?.elo_rating ?? 1000,
      });
      playMatchFound();
    } catch (err: unknown) {
      console.error("Failed to create AI match:", err);
      const message = err instanceof Error ? err.message : "Failed to create AI match";
      setError(message);
      setAiLoading(false);
    }
  }

  function handleNavigate(key: SidebarNavKey) {
    setActiveNav(key);
    if (key === "vs_ai") {
      void handleChallengeAI();
      return;
    }
    if (key === "training") {
      router.push("/training");
      return;
    }
    if (key === "lobby") {
      router.push("/lobby");
      return;
    }
    if (key === "friends") {
      router.push("/friends");
      return;
    }
    if (key === "leaderboard") {
      router.push("/leaderboard");
      return;
    }
    router.push("/history");
  }

  async function handleSignOut() {
    await setStatus("offline");
    await supabaseClient.auth.signOut();
    router.push("/");
  }

  function goToProfile() {
    router.push("/profile");
  }

  useEffect(() => {
    let cancelled = false;
    let requestChannel: ReturnType<typeof supabaseClient.channel> | null = null;
    let inviteChannel: ReturnType<typeof supabaseClient.channel> | null = null;
    let friendsChannel: ReturnType<typeof supabaseClient.channel> | null = null;
    let roomsChannel: ReturnType<typeof supabaseClient.channel> | null = null;
    let matchmakingChannel: ReturnType<typeof supabaseClient.channel> | null = null;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        if (sessionError) throw sessionError;

        const session = sessionData.session;
        if (!session) {
          router.push("/");
          return;
        }

        const uid = session.user.id;
        setViewerId(uid);
        await setStatus("online", uid);
        const fallbackUsername =
          session.user.user_metadata?.username ||
          session.user.email?.split("@")[0] ||
          "Player";

        const { data: existingProfile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("id, username, elo_rating, wins, losses, draws, avatar_url")
          .eq("id", uid)
          .maybeSingle();

        if (profileError) throw profileError;

        let nextProfile = existingProfile;
        if (!nextProfile) {
          const { data: createdProfile, error: createError } = await supabaseClient
            .from("profiles")
            .upsert(
              {
                id: uid,
                username: fallbackUsername,
                elo_rating: 1000,
                wins: 0,
                losses: 0,
                draws: 0,
              },
              { onConflict: "id" }
            )
            .select("id, username, elo_rating, wins, losses, draws, avatar_url")
            .single();

          if (createError) throw createError;
          nextProfile = createdProfile;
        }

        if (!nextProfile) throw new Error("Profile not found");
        if (!cancelled) setProfile(nextProfile);

        const [rankPositionRes, rankTotalRes, activeRoomRes] = await Promise.all([
          supabaseClient
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .gte("elo_rating", nextProfile.elo_rating),
          supabaseClient.from("profiles").select("id", { count: "exact", head: true }),
          supabaseClient
            .from("game_rooms")
            .select("id")
            .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
            .eq("status", "ongoing")
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

        if (!cancelled && rankPositionRes.count !== null && rankTotalRes.count !== null) {
          setRank({ position: rankPositionRes.count, total: rankTotalRes.count });
        }

        if (!cancelled) {
          const nextRoom = activeRoomRes.data?.[0]?.id ?? null;
          setActiveGameRoomId(nextRoom);
        }

        await Promise.all([refreshCounts(uid), loadFriendProfiles(uid), refreshOutgoingInvites(uid)]);

        try {
          const { data: recentRows, error: recentError } = await supabaseClient
            .from("match_history")
            .select(
              "id, player1_id, player2_id, winner_id, winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after, played_at, match_type"
            )
            .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
            .eq("match_type", "pvp")
            .order("played_at", { ascending: false })
            .limit(3);

          if (recentError) throw recentError;

          const recent = (recentRows as RecentHistoryRow[] | null) ?? [];
          if (recent.length === 0) {
            if (!cancelled) setRecentMatches([]);
          } else {
            const opponentIds = Array.from(
              new Set(recent.map((row) => (row.player1_id === uid ? row.player2_id : row.player1_id)))
            );

            const { data: opponentProfiles } = await supabaseClient
              .from("profiles")
              .select("id, username")
              .in("id", opponentIds);

            const opponentMap = new Map<string, string>();
            for (const opponent of opponentProfiles ?? []) {
              opponentMap.set(opponent.id, opponent.username ?? "Opponent");
            }

            const mapped: RecentMatchItem[] = recent.map((row) => {
              const opponentId = row.player1_id === uid ? row.player2_id : row.player1_id;
              const fullOpponentName = opponentMap.get(opponentId) ?? "Opponent";
              const opponentName = truncateName(fullOpponentName);
              if (!row.winner_id) {
                return { id: row.id, result: "D", opponentName, opponentUsername: fullOpponentName, eloDelta: 0 };
              }
              if (row.winner_id === uid) {
                return {
                  id: row.id,
                  result: "W",
                  opponentName,
                  opponentUsername: fullOpponentName,
                  eloDelta: row.winner_elo_after - row.winner_elo_before,
                };
              }
              return {
                id: row.id,
                result: "L",
                opponentName,
                opponentUsername: fullOpponentName,
                eloDelta: row.loser_elo_after - row.loser_elo_before,
              };
            });

            if (!cancelled) setRecentMatches(mapped);
          }
        } catch (recentErr) {
          console.warn("Recent activity failed to load:", recentErr);
          if (!cancelled) setRecentMatches([]);
        }

        if (!cancelled) {
          requestChannel = supabaseClient
            .channel(`dashboard-friend-requests-${uid}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${uid}` },
              () => {
                void refreshCounts(uid);
              }
            )
            .subscribe();

          inviteChannel = supabaseClient
            .channel(`dashboard-game-invites-${uid}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "game_invites", filter: `receiver_id=eq.${uid}` },
              () => {
                void refreshCounts(uid);
              }
            )
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "game_invites", filter: `sender_id=eq.${uid}` },
              () => {
                void refreshOutgoingInvites(uid);
              }
            )
            .subscribe();

          friendsChannel = supabaseClient
            .channel(`dashboard-friends-${uid}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${uid}` },
              () => {
                void loadFriendProfiles(uid);
              }
            )
            .subscribe();

          roomsChannel = supabaseClient
            .channel(`dashboard-rooms-${uid}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "game_rooms" },
              async () => {
                const { data: roomData } = await supabaseClient
                  .from("game_rooms")
                  .select("id")
                  .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
                  .eq("status", "ongoing")
                  .order("created_at", { ascending: false })
                  .limit(1);
                if (!cancelled) setActiveGameRoomId(roomData?.[0]?.id ?? null);
              }
            )
            .subscribe();

          matchmakingChannel = null;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load dashboard";
        console.error("Dashboard load failed:", err);

        if (
          msg.toLowerCase().includes("refresh token") ||
          msg.toLowerCase().includes("not authenticated")
        ) {
          if (viewerId) await setStatus("offline");
          await supabaseClient.auth.signOut();
          router.push("/");
          return;
        }

        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (requestChannel) supabaseClient.removeChannel(requestChannel);
      if (inviteChannel) supabaseClient.removeChannel(inviteChannel);
      if (friendsChannel) supabaseClient.removeChannel(friendsChannel);
      if (roomsChannel) supabaseClient.removeChannel(roomsChannel);
      if (matchmakingChannel) supabaseClient.removeChannel(matchmakingChannel);
    };
  }, [router, setStatus]);

  if (loading) {
    return (
      <main className="dash-loading">
        <div className="dash-spinner" />
        <span>Loading arena...</span>
        <style jsx>{`
          .dash-loading {
            height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            color: #94a3b8;
            font-family: var(--font-heading);
            font-size: 1.2rem;
          }

          .dash-spinner {
            width: 42px;
            height: 42px;
            border-radius: 999px;
            border: 3px solid rgba(124, 58, 237, 0.2);
            border-top-color: #7c3aed;
            animation: spin 0.9s linear infinite;
          }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="dash-error-wrap">
        <div className="dash-error-card">
          <h2>Failed to load dashboard</h2>
          <p>{error ?? "Unknown error"}</p>
          <button onClick={() => window.location.reload()}>Try Again</button>
        </div>
        <style jsx>{`
          .dash-error-wrap {
            height: 100vh;
            display: grid;
            place-items: center;
            padding: 20px;
          }

          .dash-error-card {
            width: min(520px, 100%);
            border-radius: 12px;
            border: 1px solid rgba(239, 68, 68, 0.28);
            background: rgba(255, 255, 255, 0.03);
            padding: 24px;
          }

          .dash-error-card h2 {
            margin: 0;
            color: #ef4444;
            font-family: var(--font-heading);
            font-size: 1.7rem;
          }

          .dash-error-card p {
            margin: 10px 0 0;
            color: #94a3b8;
            font-size: 1rem;
          }

          .dash-error-card button {
            margin-top: 14px;
            height: 38px;
            border: none;
            border-radius: 9px;
            padding: 0 16px;
            background: #7c3aed;
            color: #fff;
            font-family: var(--font-heading);
            font-size: 1rem;
            font-weight: 700;
            cursor: pointer;
          }
        `}</style>
      </main>
    );
  }

  const userInitials = getInitials(profile.username);

  return (
    <>
      <div className="dash-layout animate-fade-in">
        <Sidebar
          activeNav={activeNav}
          pendingFriendRequests={pendingFriendRequestCount}
          username={profile.username}
          avatarUrl={profile.avatar_url}
          onNavigate={handleNavigate}
          onOpenProfile={goToProfile}
          onSignOut={() => {
            void handleSignOut();
          }}
          userStatus={currentStatus}
          onToggleStatus={() => {
            void setStatus(currentStatus === "offline" ? "online" : "offline");
          }}
        />

        <main className="dash-main">
          <section className="dash-hero card-panel">
            <div className="hero-left">
              <button className="hero-avatar-btn" onClick={goToProfile} title="Go to profile">
                <div className="hero-avatar">
                  {profile.avatar_url ? (
                    <img src={profile.avatar_url} alt={profile.username} />
                  ) : (
                    <span>{userInitials}</span>
                  )}
                </div>
              </button>

              <div className="hero-copy">
                <span className="hero-kicker">WELCOME BACK</span>
                <button className="hero-username-link" onClick={goToProfile} title="Open profile">
                  {profile.username}
                </button>

                <div className="hero-tier-row">
                  <TierBadge elo={profile.elo_rating} />

                  {!tierInfo.isMaxTier ? (
                    <>
                      <div
                        className="hero-tier-track"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(tierInfo.progress)}
                      >
                        <div
                          className="hero-tier-fill"
                          style={{
                            width: `${tierInfo.progress}%`,
                            background: `linear-gradient(90deg, ${tierInfo.currentTier.color}, ${tierInfo.nextTier?.color ?? "#60a5fa"})`,
                          }}
                        />
                      </div>
                      <span className="hero-tier-caption">
                        {tierInfo.eloToNext} ELO to {tierInfo.nextTier?.name}
                      </span>
                    </>
                  ) : (
                    <span className="hero-tier-caption">Max Tier</span>
                  )}
                </div>
              </div>
            </div>

            <div className="hero-right">
              <div className="hero-elo-label">CURRENT ELO</div>
              <div className="hero-elo-value">{profile.elo_rating}</div>
              {rank && (
                <div className="hero-rank">
                  Rank #{rank.position} of {rank.total}
                </div>
              )}
              {activeGameRoomId && (
                <button
                  className="hero-rejoin-btn"
                  onClick={() => router.push(`/game/${activeGameRoomId}`)}
                >
                  Rejoin Match
                </button>
              )}
            </div>
          </section>

          <section className="dash-stats">
            <article className="stat-card">
              <span className="stat-label">Wins</span>
              <strong className="stat-value win">{profile.wins}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Losses</span>
              <strong className="stat-value loss">{profile.losses}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Draws</span>
              <strong className="stat-value draws">{profile.draws}</strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">Winrate</span>
              <strong className="stat-value rate">{winrate}%</strong>
            </article>
          </section>

          <section className="dash-utility-row card-panel">
            <div className="dash-recent-activity">
              <div className="dash-utility-title">Recent Activity</div>
              <div className="dash-recent-list">
                {recentMatches.length > 0 ? (
                  recentMatches.map((match) => (
                    <div key={match.id} className="dash-recent-row">
                      <span
                        className={`dash-result-pill ${
                          match.result === "W" ? "is-win" : match.result === "L" ? "is-loss" : "is-draw"
                        }`}
                      >
                        {match.result}
                      </span>
                      <span className="dash-recent-text">vs <span className="dash-recent-link" onClick={() => router.push(`/profile/${encodeURIComponent(match.opponentUsername)}`)} title={`View ${match.opponentUsername}'s profile`}>{match.opponentName}</span></span>
                      <span
                        className={`dash-recent-elo ${
                          match.result === "W" ? "is-win" : match.result === "L" ? "is-loss" : "is-draw"
                        }`}
                      >
                        {match.result === "D" ? "\u00B10" : `${match.eloDelta > 0 ? "+" : ""}${match.eloDelta}`}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="dash-recent-empty">No recent ranked matches</div>
                )}
              </div>
            </div>

            <div className="dash-quick-actions">
              <div className="dash-utility-title">Quick Actions</div>
              <div className="dash-quick-btns">
                <button className="dash-quick-btn" onClick={goToProfile}>
                  View Profile
                </button>
                <button className="dash-quick-btn" onClick={() => router.push("/history")}>
                  Match History
                </button>
                <button className="dash-quick-btn" onClick={() => router.push("/lobby")}>
                  Open Lobby
                </button>
              </div>
            </div>
          </section>

          <div className="dash-arena-wrap">
            <ArenaCard
              disabled={aiLoading}
              onStartMatch={() => {
                router.push("/matchmaking");
              }}
            />
          </div>
        </main>

        <RightPanel
          inviteCount={arenaInviteCount}
          friends={friendsOnline}
          totalFriends={totalFriends}
          onlineCounts={onlineCounts}
          onViewFriends={() => router.push("/friends")}
          onInviteFriend={(friendId) => void handleInviteFriend(friendId)}
          invitingFriendId={invitingFriendId}
          outgoingInviteMap={outgoingInviteMap}
          onCancelInvite={(inviteId) => void handleCancelInvite(inviteId)}
          cancellingInviteId={cancellingInviteId}
          onProfileClick={(username) => router.push(`/profile/${encodeURIComponent(username)}`)}
        />

      </div>



      <MatchFoundModal
        open={!!aiMatchFound}
        myName={aiMatchFound?.myName ?? ""}
        myElo={aiMatchFound?.myElo ?? 0}
        myAvatarUrl={aiMatchFound?.myAvatarUrl}
        oppName={aiMatchFound?.oppName ?? ""}
        oppElo={aiMatchFound?.oppElo ?? 0}
        oppAvatarUrl={null}
        isVsAi
        aiEloMode="none"
        onCountdownDone={() => {
          if (aiMatchFound) {
            const personaParam = encodeURIComponent(aiMatchFound.oppName);
            router.push(`/game/${aiMatchFound.gameId}?origin=dashboard&persona=${personaParam}`);
          }
        }}
      />

      <style jsx>{`
        .dash-layout {
          height: 100vh;
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr) 280px;
          overflow: hidden;
          position: relative;
          z-index: 1;
          gap: 0;
          background: transparent;
        }

        .dash-main {
          min-width: 0;
          min-height: 0;
          display: grid;
          grid-template-rows: auto auto auto 1fr;
          gap: 10px;
          padding: 10px;
          overflow: hidden;
        }

        .card-panel {
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .dash-hero {
          min-height: 130px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .hero-left {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 1;
        }

        .hero-avatar {
          width: 72px;
          height: 72px;
          border-radius: 16px;
          border: 2px solid rgba(124, 58, 237, 0.6);
          background: rgba(255, 255, 255, 0.08);
          overflow: hidden;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.35);
        }

        .hero-avatar-btn {
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
        }

        .hero-avatar-btn:hover .hero-avatar {
          box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.45), 0 0 18px rgba(124, 58, 237, 0.22);
        }

        .hero-avatar :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .hero-avatar span {
          font-family: var(--font-heading);
          font-size: 2rem;
          font-weight: 700;
          color: #f8fafc;
        }

        .hero-copy {
          min-width: 0;
        }

        .hero-kicker {
          display: block;
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          line-height: 1;
        }

        .hero-username-link {
          margin: 4px 0 8px;
          border: none;
          background: transparent;
          padding: 0;
          cursor: pointer;
          text-align: left;
          font-family: var(--font-heading);
          font-size: clamp(2rem, 3vw, 2.6rem);
          line-height: 1;
          color: #f8fafc;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          transition: color 0.2s ease;
        }

        .hero-username-link:hover {
          color: #d8b4fe;
        }

        .hero-tier-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .hero-tier-track {
          width: 220px;
          max-width: 38vw;
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
        }

        .hero-tier-fill {
          height: 100%;
          border-radius: inherit;
          transition: width 0.3s ease;
        }

        .hero-tier-caption {
          font-family: var(--font-heading);
          font-size: 1.05rem;
          font-weight: 600;
          color: #c4b5fd;
        }

        .hero-right {
          flex-shrink: 0;
          text-align: right;
          min-width: 180px;
        }

        .hero-elo-label {
          font-family: var(--font-heading);
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          color: #94a3b8;
        }

        .hero-elo-value {
          margin-top: 4px;
          font-family: var(--font-heading);
          font-size: clamp(2.6rem, 4vw, 3.4rem);
          font-weight: 700;
          color: #f59e0b;
          line-height: 0.95;
          text-shadow: 0 0 20px rgba(245, 158, 11, 0.25);
        }

        .hero-rank {
          margin-top: 4px;
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 1.03rem;
          white-space: nowrap;
        }

        .hero-rejoin-btn {
          margin-top: 8px;
          border: none;
          border-radius: 9px;
          height: 34px;
          padding: 0 12px;
          background: linear-gradient(135deg, #10b981, #059669);
          color: #fff;
          font-family: var(--font-heading);
          font-size: 1rem;
          font-weight: 700;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .hero-rejoin-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(16, 185, 129, 0.35);
        }

        .dash-stats {
          height: 72px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .stat-card {
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.03);
          padding: 8px 12px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          min-width: 0;
        }

        .stat-label {
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          line-height: 1;
        }

        .stat-value {
          margin-top: 6px;
          font-family: var(--font-heading);
          font-size: 1.8rem;
          font-weight: 700;
          line-height: 1;
        }

        .stat-value.win {
          color: #10b981;
        }

        .stat-value.loss {
          color: #ef4444;
        }

        .stat-value.draws {
          color: #f8fafc;
        }

        .stat-value.rate {
          background: linear-gradient(90deg, #a78bfa 0%, #f59e0b 100%);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .dash-arena-wrap {
          min-height: 0;
        }

        .dash-utility-row {
          min-height: 88px;
          padding: 10px 12px;
          display: grid;
          grid-template-columns: 1.35fr 0.8fr;
          gap: 12px;
        }

        .dash-utility-title {
          color: #94a3b8;
          font-family: var(--font-heading);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .dash-recent-activity,
        .dash-quick-actions {
          min-width: 0;
          display: grid;
          grid-template-rows: auto auto;
          gap: 6px;
        }

        .dash-recent-list {
          min-height: 0;
          display: grid;
          gap: 4px;
        }

        .dash-recent-row {
          border: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(255, 255, 255, 0.02);
          border-radius: 8px;
          min-height: 26px;
          padding: 0 8px;
          display: grid;
          grid-template-columns: 20px 1fr auto;
          align-items: center;
          gap: 8px;
        }

        .dash-result-pill {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          font-family: var(--font-heading);
          font-size: 0.64rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }

        .dash-result-pill.is-win {
          background: #10b981;
        }

        .dash-result-pill.is-loss {
          background: #ef4444;
        }

        .dash-result-pill.is-draw {
          background: #6b7280;
        }

        .dash-recent-text {
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #e2e8f0;
          font-size: 0.88rem;
          font-weight: 500;
          font-family: var(--font-heading);
        }

        .dash-recent-link {
          cursor: pointer;
          transition: color 0.2s;
        }

        .dash-recent-link:hover {
          color: #a78bfa;
        }

        .dash-recent-elo {
          font-family: var(--font-heading);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .dash-recent-elo.is-win {
          color: #10b981;
        }

        .dash-recent-elo.is-loss {
          color: #ef4444;
        }

        .dash-recent-elo.is-draw {
          color: #6b7280;
        }

        .dash-recent-empty {
          border: 1px dashed rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.01);
          border-radius: 8px;
          min-height: 84px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(148, 163, 184, 0.9);
          font-family: var(--font-heading);
          font-size: 0.82rem;
        }

        .dash-quick-btns {
          display: grid;
          gap: 6px;
          align-content: start;
        }

        .dash-quick-btn {
          border: 1px solid rgba(124, 58, 237, 0.35);
          background: rgba(124, 58, 237, 0.15);
          color: #e9d5ff;
          border-radius: 8px;
          min-height: 30px;
          padding: 0 10px;
          text-align: left;
          font-family: var(--font-heading);
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dash-quick-btn:hover {
          background: rgba(124, 58, 237, 0.25);
          transform: translateY(-1px);
        }

        @media (max-width: 1024px) {
          .dash-layout {
            grid-template-columns: 48px minmax(0, 1fr);
          }

          .dash-main {
            padding: 10px 10px 10px 8px;
          }

          .hero-tier-track {
            width: 200px;
          }
        }

        @media (max-width: 768px) {
          .dash-layout {
            grid-template-columns: 1fr;
            grid-template-rows: minmax(0, 1fr) auto;
          }

          .dash-main {
            order: 1;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding: 10px;
            padding-bottom: 14px;
          }

          :global(.sb-root) {
            order: 2;
          }

          .dash-hero {
            order: 1;
            min-height: auto;
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .dash-arena-wrap {
            order: 2;
            min-height: auto;
            flex: 0 0 auto;
          }

          .dash-stats {
            order: 3;
            height: auto;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dash-utility-row {
            order: 4;
            min-height: auto;
            grid-template-columns: 1fr;
            gap: 10px;
            overflow: visible;
          }

          .hero-left {
            width: 100%;
          }

          .hero-right {
            width: 100%;
            min-width: 0;
            text-align: left;
            display: grid;
            gap: 4px;
            align-content: start;
          }

          .hero-elo-value {
            font-size: 2.2rem;
            line-height: 0.95;
          }

          .hero-rank {
            margin-top: 0;
            font-size: 0.96rem;
          }

          .hero-tier-track {
            width: min(220px, 62vw);
          }

          .stat-card {
            min-height: 50px;
          }

          .dash-recent-empty {
            min-height: 44px;
          }

          .dash-quick-btn {
            min-height: 32px;
          }

        }
      `}</style>
    </>
  );
}
