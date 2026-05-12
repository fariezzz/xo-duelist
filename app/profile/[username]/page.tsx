"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Check,
  Copy,
  Flame,
  Handshake,
  Medal,
  Pencil,
  Swords,
  Target,
  Trophy,
  UserMinus,
  UserPlus,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Navbar from "../../../components/Navbar";
import TierBadge from "../../../components/TierBadge";
import { supabaseClient } from "../../../lib/supabase";
import { getPublicProfileByUsername, getPublicProfileMatches, deleteFriendship, type PublicMatchRow } from "../../../lib/friendsService";
import ConfirmDeleteModal from "../../../components/friends/ConfirmDeleteModal";
import SuccessChallengeModal from "../../../components/profile/SuccessChallengeModal";
import { resolveUserStatusForPresence, STATUS_COLOR, STATUS_LABEL, type UserStatus } from "../../../lib/statusUtils";
import StatusDot from "../../../components/ui/StatusDot";
import { getPresenceStatuses, subscribePresenceState } from "../../../hooks/usePresence";

type OpponentMap = Record<string, string>;
type MatchTab = "all" | "pvp" | "ai";
type PresenceViewState = { ready: boolean; statuses: Map<string, UserStatus> };

function initials(name: string): string {
  const p = name.split(/[\s_]+/).filter(Boolean);
  if (p.length === 0) return "?";
  return `${p[0][0] ?? ""}${p[1]?.[0] ?? ""}`.toUpperCase().slice(0, 2);
}

function winRate(wins: number, losses: number, draws: number): string {
  const total = wins + losses + draws;
  if (total === 0) return "—";
  return `${Math.round((wins / total) * 1000) / 10}%`;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ── ELO tier helpers ─────────────────────────────────── */
interface Tier { name: string; min: number; max: number; color: string; }
const ELO_TIERS: Tier[] = [
  { name: "Bronze", min: 0, max: 799, color: "#b45309" },
  { name: "Silver", min: 800, max: 1199, color: "#9ca3af" },
  { name: "Gold", min: 1200, max: 1599, color: "#f59e0b" },
  { name: "Platinum", min: 1600, max: 1999, color: "#38bdf8" },
  { name: "Diamond", min: 2000, max: 9999, color: "#a78bfa" },
];

function getEloTier(elo: number) {
  let idx = 0;
  for (let i = ELO_TIERS.length - 1; i >= 0; i--) {
    if (elo >= ELO_TIERS[i].min) { idx = i; break; }
  }
  const current = ELO_TIERS[idx];
  const next = idx < ELO_TIERS.length - 1 ? ELO_TIERS[idx + 1] : null;
  const pct = next ? Math.min(100, Math.max(0, ((elo - current.min) / (next.min - current.min)) * 100)) : 100;
  return { current, next, pct };
}

/* ── Achievement definitions ─────────────────────────── */
interface Achievement { Icon: LucideIcon; label: string; earned: boolean; }
function getAchievements(wins: number, losses: number, draws: number, elo: number): Achievement[] {
  const total = wins + losses + draws;
  return [
    { Icon: Target, label: "First Win", earned: wins >= 1 },
    { Icon: Flame, label: "On Fire", earned: wins >= 10 },
    { Icon: Zap, label: "Centurion", earned: total >= 100 },
    { Icon: Trophy, label: "Champion", earned: elo >= 1400 },
  ];
}

export default function PublicProfilePage() {
  const router = useRouter();
  const params = useParams();
  const usernameParam = params.username;
  const username = typeof usernameParam === "string" ? usernameParam : Array.isArray(usernameParam) ? usernameParam[0] : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getPublicProfileByUsername>>>(null);
  const [matches, setMatches] = useState<PublicMatchRow[]>([]);
  const [opponents, setOpponents] = useState<OpponentMap>({});
  const [activeTab, setActiveTab] = useState<MatchTab>("all");
  const [copied, setCopied] = useState(false);
  const [rank, setRank] = useState<number | null>(null);
  const [totalPlayers, setTotalPlayers] = useState<number>(0);

  const [isFriend, setIsFriend] = useState(false);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [pendingFriendRequestId, setPendingFriendRequestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [pendingInviteId, setPendingInviteId] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceViewState>({ ready: false, statuses: new Map() });
  const [presenceNow, setPresenceNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!username) { setError("Invalid profile."); setLoading(false); return; }
    try {
      setError(null);
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const uid = sessionData.session?.user.id ?? null;
      setViewerId(uid);
      const p = await getPublicProfileByUsername(username);
      if (!p) { setProfile(null); setMatches([]); setOpponents({}); setLoading(false); return; }
      setProfile(p);

      // Fetch rank
      const { count: aboveCount } = await supabaseClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gt("elo_rating", p.elo_rating);
      const { count: totalCount } = await supabaseClient
        .from("profiles")
        .select("id", { count: "exact", head: true });
      setRank((aboveCount ?? 0) + 1);
      setTotalPlayers(totalCount ?? 0);

      if (uid && uid !== p.id) {
        const [friendCheck, reqCheck, inviteCheck] = await Promise.all([
          supabaseClient.from("friends").select("friend_id").eq("user_id", uid).eq("friend_id", p.id).maybeSingle(),
          supabaseClient.from("friend_requests").select("id, sender_id, receiver_id").or(`and(sender_id.eq.${uid},receiver_id.eq.${p.id}),and(sender_id.eq.${p.id},receiver_id.eq.${uid})`).eq("status", "pending").maybeSingle(),
          supabaseClient.from("game_invites").select("id").eq("sender_id", uid).eq("receiver_id", p.id).eq("status", "pending").maybeSingle()
        ]);
        setIsFriend(!!friendCheck.data);
        setHasPendingRequest(!!reqCheck.data);
        setPendingFriendRequestId(reqCheck.data?.sender_id === uid ? reqCheck.data.id : null);
        setPendingInviteId(inviteCheck.data?.id ?? null);
      } else {
        setIsFriend(false);
        setHasPendingRequest(false);
        setPendingFriendRequestId(null);
        setPendingInviteId(null);
      }

      const mh = await getPublicProfileMatches(p.id, 10);
      setMatches(mh);
      const oppIds = new Set<string>();
      for (const m of mh) {
        if (m.player1_id === p.id) oppIds.add(m.player2_id);
        else oppIds.add(m.player1_id);
      }
      if (oppIds.size > 0) {
        const { data: profs, error: pe } = await supabaseClient.from("profiles").select("id, username").in("id", [...oppIds]);
        if (pe) throw pe;
        const map: OpponentMap = {};
        for (const row of profs ?? []) { if (row.id && row.username) map[row.id] = row.username; }
        setOpponents(map);
      } else { setOpponents({}); }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to load profile.");
    } finally { setLoading(false); }
  }, [username]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [load]);

  useEffect(() => {
    const unsubscribe = subscribePresenceState((state, hasSynced) => {
      setPresence({ ready: hasSynced, statuses: getPresenceStatuses(state) });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPresenceNow(Date.now());
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabaseClient
      .channel(`public_profile_${profile.id}_${viewerId ?? "anon"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${profile.id}` }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "game_invites" }, () => { void load(); });

    if (viewerId) {
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `sender_id=eq.${viewerId}` }, () => { void load(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests", filter: `receiver_id=eq.${viewerId}` }, () => { void load(); })
        .on("postgres_changes", { event: "*", schema: "public", table: "friends", filter: `user_id=eq.${viewerId}` }, () => { void load(); });
    }

    channel.subscribe();
    return () => { void supabaseClient.removeChannel(channel); };
  }, [profile?.id, viewerId, load]);

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function handleAddFriend() {
    if (!profile || actionLoading) return;
    try {
      setActionLoading(true);
      const { error: err } = await supabaseClient.rpc("send_friend_request", { input_receiver_id: profile.id });
      if (err) {
        if (err.message.includes("already_friends")) {
          setIsFriend(true);
          setHasPendingRequest(false);
          setPendingFriendRequestId(null);
        } else if (err.message.includes("request_already_exists") || err.message.includes("request_already_pending")) {
          setHasPendingRequest(true);
          await load();
        } else {
          throw err;
        }
      } else {
        setHasPendingRequest(true);
        await load();
      }
    } catch (e: unknown) {
      console.error("Failed to add friend:", e);
      alert("Could not send friend request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelFriendRequest() {
    if (!pendingFriendRequestId || actionLoading) return;
    try {
      setActionLoading(true);
      const { error: err } = await supabaseClient.rpc("cancel_friend_request", {
        input_request_id: pendingFriendRequestId,
      });
      if (err) throw err;
      setHasPendingRequest(false);
      setPendingFriendRequestId(null);
      await load();
    } catch (e: unknown) {
      console.error("Failed to cancel friend request:", e);
      alert("Could not cancel friend request.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveFriend() {
    if (!profile || !viewerId || actionLoading) return;
    try {
      setActionLoading(true);
      await deleteFriendship(viewerId, profile.id);
      setIsFriend(false);
      setShowRemoveModal(false);
    } catch (e: unknown) {
      console.error("Failed to remove friend:", e);
      alert("Could not remove friend.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleChallenge() {
    if (!profile || challengeLoading) return;
    try {
      setChallengeLoading(true);
      await supabaseClient.rpc("expire_stale_invites");
      const { error: err } = await supabaseClient.rpc("send_game_invite", { input_receiver_id: profile.id });
      if (err) {
        if (err.message.includes("sender_busy")) alert("You are already in a room, match, or matchmaking.");
        else if (err.message.includes("receiver_busy")) alert("This player is currently busy.");
        else if (err.message.includes("invite_already_pending")) alert("An invite is already pending.");
        else throw err;
      } else {
        setShowChallengeModal(true);
        await load();
      }
    } catch (e: unknown) {
      console.error("Failed to send challenge:", e);
      alert("Could not send challenge.");
    } finally {
      setChallengeLoading(false);
    }
  }

  async function handleCancelInvite() {
    if (!pendingInviteId || challengeLoading) return;
    try {
      setChallengeLoading(true);
      const { error: err } = await supabaseClient.rpc("cancel_game_invite", { input_invite_id: pendingInviteId });
      if (err) throw err;
      setPendingInviteId(null);
    } catch (e: unknown) {
      console.error("Failed to cancel invite:", e);
      alert("Could not cancel invite.");
    } finally {
      setChallengeLoading(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="pp-wrap">
          <div className="pp-loading">Loading profile…</div>
        </div>
        <style jsx>{`
          .pp-wrap { min-height:100vh; padding:calc(var(--navbar-height)+32px) 20px 40px; display:flex; align-items:center; justify-content:center; }
          .pp-loading { color:var(--text-muted); font-family:var(--font-heading); }
        `}</style>
      </>
    );
  }

  if (error || !profile) {
    return (
      <>
        <Navbar />
        <div className="pp-miss-wrap">
          <div className="pp-miss-ambient pp-miss-ambient-a" />
          <div className="pp-miss-ambient pp-miss-ambient-b" />

          <div className="card pp-miss-card">
            <p className="pp-miss-kicker">Public Profile</p>

            <div className="pp-miss-sigil" aria-hidden="true">
              <span>404</span>
            </div>

            <h1 className="pp-miss-title">Pilot Not Found</h1>
            <p className="pp-miss-desc">
              {error ?? `No duelist found with username "${username}".`}
            </p>

            <div className="pp-miss-hint-row">
              <span className="pp-miss-hint">Check spelling</span>
              <span className="pp-miss-hint">Username may have changed</span>
            </div>

            <div className="pp-miss-actions">
              <button
                type="button"
                className="btn btn-primary pp-miss-main-btn"
                onClick={() => router.push("/dashboard")}
              >
                Back to Home
              </button>
              <button
                type="button"
                className="btn btn-ghost pp-miss-sub-btn"
                onClick={() => router.push("/leaderboard")}
              >
                Explore Leaderboard
              </button>
            </div>
          </div>
        </div>
        <style jsx>{`
          .pp-miss-wrap {
            min-height: 100vh;
            padding: calc(var(--navbar-height) + 28px) 18px 42px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
          }

          .pp-miss-ambient {
            position: absolute;
            pointer-events: none;
            border-radius: 9999px;
            filter: blur(14px);
            opacity: 0.45;
          }

          .pp-miss-ambient-a {
            width: 320px;
            height: 320px;
            background: radial-gradient(circle, rgba(124,58,237,0.38) 0%, rgba(124,58,237,0) 68%);
            top: 18%;
            left: 14%;
            animation: ppMissFloatA 8s ease-in-out infinite;
          }

          .pp-miss-ambient-b {
            width: 420px;
            height: 420px;
            background: radial-gradient(circle, rgba(245,158,11,0.23) 0%, rgba(245,158,11,0) 70%);
            bottom: 8%;
            right: 6%;
            animation: ppMissFloatB 10s ease-in-out infinite;
          }

          .pp-miss-card {
            width: min(100%, 560px);
            text-align: center;
            padding: 28px 26px 24px;
            position: relative;
            border: 1px solid rgba(124,58,237,0.34);
            background:
              linear-gradient(145deg, rgba(18,25,49,0.86), rgba(12,17,36,0.92)),
              radial-gradient(circle at 20% 10%, rgba(124,58,237,0.1), transparent 60%);
            box-shadow:
              0 20px 42px rgba(2, 6, 23, 0.58),
              inset 0 0 0 1px rgba(148, 163, 184, 0.08),
              0 0 34px rgba(124,58,237,0.2);
          }

          .pp-miss-kicker {
            margin: 0 0 10px;
            color: #93c5fd;
            font-family: var(--font-heading);
            font-size: 0.72rem;
            text-transform: uppercase;
            letter-spacing: 0.16em;
            font-weight: 700;
            opacity: 0.9;
          }

          .pp-miss-sigil {
            width: 86px;
            height: 86px;
            margin: 0 auto 14px;
            border-radius: 50%;
            border: 2px solid rgba(124,58,237,0.42);
            display: flex;
            align-items: center;
            justify-content: center;
            background:
              radial-gradient(circle at 30% 30%, rgba(124,58,237,0.32), rgba(30,41,59,0.18) 70%),
              rgba(15,23,42,0.66);
            box-shadow:
              inset 0 0 22px rgba(124,58,237,0.24),
              0 0 18px rgba(124,58,237,0.3);
            animation: ppMissPulse 3s ease-in-out infinite;
          }

          .pp-miss-sigil span {
            font-family: var(--font-heading);
            font-size: 1.15rem;
            font-weight: 800;
            letter-spacing: 0.08em;
            color: #e2e8f0;
          }

          .pp-miss-title {
            margin: 0 0 8px;
            font-family: var(--font-heading);
            font-size: clamp(1.38rem, 2.2vw, 1.72rem);
            line-height: 1.12;
            color: #f8fafc;
            letter-spacing: 0.02em;
          }

          .pp-miss-desc {
            margin: 0 auto;
            max-width: 470px;
            color: rgba(203, 213, 225, 0.88);
            font-size: 0.95rem;
            line-height: 1.55;
          }

          .pp-miss-hint-row {
            margin-top: 14px;
            display: flex;
            gap: 8px;
            justify-content: center;
            flex-wrap: wrap;
          }

          .pp-miss-hint {
            border-radius: 9999px;
            padding: 5px 10px;
            font-family: var(--font-heading);
            font-size: 0.72rem;
            letter-spacing: 0.04em;
            color: rgba(186, 230, 253, 0.92);
            border: 1px solid rgba(56,189,248,0.28);
            background: rgba(30, 41, 59, 0.58);
          }

          .pp-miss-actions {
            margin-top: 18px;
            display: grid;
            gap: 10px;
            grid-template-columns: 1fr;
          }

          .pp-miss-main-btn,
          .pp-miss-sub-btn {
            width: 100%;
            justify-content: center;
          }

          .pp-miss-main-btn {
            box-shadow: 0 0 24px rgba(124,58,237,0.36);
          }

          @media (min-width: 640px) {
            .pp-miss-card {
              padding: 32px 32px 28px;
            }

            .pp-miss-actions {
              grid-template-columns: 1fr 1fr;
            }
          }

          @keyframes ppMissPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.06); }
          }

          @keyframes ppMissFloatA {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(18px, -16px, 0); }
          }

          @keyframes ppMissFloatB {
            0%, 100% { transform: translate3d(0, 0, 0); }
            50% { transform: translate3d(-16px, 12px, 0); }
          }
        `}</style>
      </>
    );
  }

  const isOwn = viewerId !== null && viewerId === profile.id;
  const totalGames = profile.wins + profile.losses + profile.draws;
  const wPct = totalGames > 0 ? (profile.wins / totalGames) * 100 : 0;
  const lPct = totalGames > 0 ? (profile.losses / totalGames) * 100 : 0;
  const dPct = totalGames > 0 ? (profile.draws / totalGames) * 100 : 100;
  const { current: curTier, next: nextTier, pct: tierPct } = getEloTier(profile.elo_rating);
  const achievements = getAchievements(profile.wins, profile.losses, profile.draws, profile.elo_rating);

  // Filter matches by tab
  const filteredMatches = matches.filter((m) => {
    if (activeTab === "all") return true;
    if (activeTab === "pvp") return m.match_type === "pvp";
    if (activeTab === "ai") return m.match_type?.startsWith("ai") ?? false;
    return true;
  });

  const tabs: { key: MatchTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pvp", label: "PvP" },
    { key: "ai", label: "AI" },
  ];

  const parsedStatus = resolveUserStatusForPresence(profile.status, profile.last_seen, {
    presenceReady: presence.ready,
    liveStatus: presence.statuses.get(profile.id),
    now: presenceNow,
  });

  return (
    <>
      <Navbar />
      <div className="pp-page animate-fade-in">
        <div className="pp-inner">
          {/* ── Hero Card ── */}
          <header className="pp-hero card">
            <div className="pp-avatar">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" width={96} height={96} />
              ) : (
                <span>{initials(profile.username)}</span>
              )}
              <div className="pp-status-wrap" title={STATUS_LABEL[parsedStatus]}>
                <StatusDot status={parsedStatus} size={14} />
              </div>
            </div>
            <div className="pp-head-text">
              <h1 className="pp-name">{profile.username}</h1>
              {profile.bio && (
                <p className="pp-bio">{profile.bio}</p>
              )}
              <div className="pp-badges">
                <TierBadge elo={profile.elo_rating} />
                <span className="pp-elo-num">ELO {profile.elo_rating}</span>
                <span
                  className="pp-status-pill"
                  style={{
                    color: STATUS_COLOR[parsedStatus],
                    borderColor: `${STATUS_COLOR[parsedStatus]}55`,
                    background: `${STATUS_COLOR[parsedStatus]}18`,
                  }}
                >
                  <StatusDot status={parsedStatus} size={8} />
                  {STATUS_LABEL[parsedStatus]}
                </span>
                {isFriend && (
                  <span className="pp-friend-pill">
                    <Handshake size={13} aria-hidden="true" />
                    Friend
                  </span>
                )}
                <button type="button" className="pp-copy-btn" onClick={handleCopyLink} title="Copy profile link">
                  {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                </button>
              </div>

              {/* Rank + Member Since */}
              <div className="pp-meta-row">
                {rank !== null && (
                  <span className="pp-meta-item">
                    <Medal size={14} aria-hidden="true" />
                    Rank <strong>#{rank}</strong> <span className="pp-meta-dim">of {totalPlayers}</span>
                  </span>
                )}
                {profile.created_at && (
                  <span className="pp-meta-item">
                    <CalendarDays size={14} aria-hidden="true" />
                    Member since <strong>{new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong>
                  </span>
                )}
              </div>

              {/* ELO progress bar */}
              <div className="pp-elo-progress">
                <div className="pp-elo-labels">
                  <span style={{ color: curTier.color }}>{curTier.name} {profile.elo_rating}</span>
                  <span style={{ color: nextTier?.color ?? curTier.color }}>{nextTier ? `${nextTier.name} ${nextTier.min}` : "MAX"}</span>
                </div>
                <div className="pp-elo-track">
                  <div className="pp-elo-fill" style={{
                    width: `${tierPct}%`,
                    background: nextTier ? `linear-gradient(90deg, ${curTier.color}, ${nextTier.color})` : curTier.color,
                  }} />
                </div>
              </div>

              {/* Achievement badges */}
              <div className="pp-achievements">
                {achievements.map((a) => {
                  const AchievementIcon = a.Icon;
                  return (
                    <span key={a.label} className="pp-ach-pill" style={{ opacity: a.earned ? 1 : 0.35 }}>
                      <AchievementIcon size={13} aria-hidden="true" />
                      {a.label}
                    </span>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="pp-hero-actions">
                {isOwn ? (
                  <button type="button" className="btn btn-secondary pp-edit" onClick={() => router.push("/profile")}>
                    <Pencil size={16} aria-hidden="true" />
                    Edit profile
                  </button>
                ) : (
                  <>
                    {isFriend ? (
                      <>
                        <button 
                          type="button" 
                          className="btn btn-ghost pp-edit" 
                          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }} 
                          onClick={() => setShowRemoveModal(true)} 
                          disabled={actionLoading}
                          title="Remove from friends"
                        >
                          {actionLoading ? "..." : (
                            <>
                              <UserMinus size={16} aria-hidden="true" />
                              Unfriend
                            </>
                          )}
                        </button>
                        {pendingInviteId ? (
                          <button type="button" className="btn btn-ghost pp-edit" onClick={handleCancelInvite} disabled={challengeLoading}>
                            {challengeLoading ? "..." : (
                              <>
                                <X size={16} aria-hidden="true" />
                                Cancel
                              </>
                            )}
                          </button>
                        ) : parsedStatus === "online" ? (
                          <button type="button" className="btn btn-secondary pp-edit" onClick={handleChallenge} disabled={challengeLoading}>
                            {challengeLoading ? "..." : (
                              <>
                                <Swords size={16} aria-hidden="true" />
                                Challenge
                              </>
                            )}
                          </button>
                        ) : parsedStatus !== "offline" ? (
                          <button type="button" className="btn btn-ghost pp-edit" disabled>
                            {STATUS_LABEL[parsedStatus]}
                          </button>
                        ) : null}
                      </>
                    ) : pendingFriendRequestId ? (
                      <button
                        type="button"
                        className="btn btn-ghost pp-edit pp-danger-action"
                        onClick={handleCancelFriendRequest}
                        disabled={actionLoading}
                      >
                        {actionLoading ? "..." : (
                          <>
                            <UserMinus size={16} aria-hidden="true" />
                            Cancel request
                          </>
                        )}
                      </button>
                    ) : hasPendingRequest ? (
                      <button type="button" className="btn btn-ghost pp-edit" disabled>
                        <UserPlus size={16} aria-hidden="true" />
                        Request Pending
                      </button>
                    ) : (
                      <button type="button" className="btn btn-secondary pp-edit" onClick={handleAddFriend} disabled={actionLoading}>
                        {actionLoading ? "..." : (
                          <>
                            <UserPlus size={16} aria-hidden="true" />
                            Add Friend
                          </>
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </header>

          {/* ── Stats Section ── */}
          <section className="card pp-stats">
            <h2 className="pp-sec-title">
              <BarChart3 size={18} aria-hidden="true" />
              Stats
            </h2>

            {/* W/L/D bar */}
            {totalGames > 0 && (
              <div className="pp-wld-wrap">
                <div className="pp-wld-bar">
                  {wPct > 0 && <div className="pp-wld-seg pp-seg-w" style={{ width: `${wPct}%` }}>{wPct > 15 && <span>{Math.round(wPct)}%</span>}</div>}
                  {lPct > 0 && <div className="pp-wld-seg pp-seg-l" style={{ width: `${lPct}%` }}>{lPct > 15 && <span>{Math.round(lPct)}%</span>}</div>}
                  {dPct > 0 && <div className="pp-wld-seg pp-seg-d" style={{ width: `${dPct}%` }}>{dPct > 15 && <span>{Math.round(dPct)}%</span>}</div>}
                </div>
              </div>
            )}

            <div className="pp-stat-grid">
              <div><span className="pp-label">Wins</span><strong style={{ color: "#22c55e" }}>{profile.wins}</strong></div>
              <div><span className="pp-label">Losses</span><strong style={{ color: "#ef4444" }}>{profile.losses}</strong></div>
              <div><span className="pp-label">Draws</span><strong style={{ color: "#6b7280" }}>{profile.draws}</strong></div>
              <div><span className="pp-label">Win rate</span><strong>{winRate(profile.wins, profile.losses, profile.draws)}</strong></div>
            </div>
            <div className="pp-total-games">Total: {totalGames} games</div>
          </section>

          {/* ── Match History ── */}
          <section className="card pp-history">
            <h2 className="pp-sec-title">
              <Swords size={18} aria-hidden="true" />
              Recent Matches
            </h2>

            {/* Tab filter */}
            <div className="pp-tabs">
              {tabs.map((t) => (
                <button key={t.key} type="button" className={`pp-tab${activeTab === t.key ? " pp-tab-active" : ""}`} onClick={() => setActiveTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            {filteredMatches.length === 0 ? (
              <p className="pp-muted">No matches found.</p>
            ) : (
              <ul className="pp-matches">
                {filteredMatches.map((m) => {
                  const oppId = m.player1_id === profile.id ? m.player2_id : m.player1_id;
                  const oppName = opponents[oppId] ?? "Opponent";
                  let result: "W" | "L" | "D" = "D";
                  if (m.winner_id === profile.id) result = "W";
                  else if (m.loser_id === profile.id) result = "L";
                  const mode = m.match_type === "pvp" ? "PvP" : m.match_type?.startsWith("ai") ? "AI" : m.match_type ?? "—";
                  const eloRow = m as Record<string, unknown>;
                  const hasEloChange = typeof eloRow.elo_change === "number";

                  return (
                    <li key={m.id} className="pp-match-row">
                      <span className={`pp-res pp-res-${result}`}>{result}</span>
                      <span className="pp-opp">vs {oppName}</span>
                      <span className="pp-mode">{mode}</span>
                      {hasEloChange && (
                        <span className={`pp-elo-delta ${(eloRow.elo_change as number) >= 0 ? "pp-elo-plus" : "pp-elo-minus"}`}>
                          {(eloRow.elo_change as number) >= 0 ? "+" : ""}{eloRow.elo_change as number}
                        </span>
                      )}
                      <span className="pp-date">{relativeTime(m.played_at)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDeleteModal
        open={showRemoveModal}
        username={profile.username}
        loading={actionLoading}
        onCancel={() => setShowRemoveModal(false)}
        onConfirm={handleRemoveFriend}
      />

      <SuccessChallengeModal
        open={showChallengeModal}
        username={profile.username}
        onClose={() => setShowChallengeModal(false)}
      />

      <style jsx>{`
        .pp-page { position:relative; z-index:1; min-height:100vh; padding:calc(var(--navbar-height) + 40px) 18px 40px; }
        .pp-inner { max-width:720px; margin:0 auto; display:flex; flex-direction:column; gap:14px; }

        /* ── Hero ── */
        .pp-hero { display:flex; flex-wrap:wrap; align-items:center; gap:20px; padding:22px; }
        .pp-avatar { width:96px; height:96px; border-radius:50%; background:rgba(255,255,255,0.06); border:2px solid rgba(124,58,237,0.35); display:flex; align-items:center; justify-content:center; position:relative; flex-shrink:0; }
        .pp-avatar :global(img) { width:100%; height:100%; object-fit:cover; border-radius:50%; }
        .pp-avatar span:first-child { font-family:var(--font-heading); font-size:1.5rem; font-weight:800; color:#f8fafc; }
        .pp-status-wrap { position:absolute; bottom:2px; right:2px; z-index:2; border-radius:50%; background:var(--card-bg, #1e1b2e); padding:3px; display:flex; align-items:center; justify-content:center; }
        .pp-head-text { flex:1; min-width:200px; }
        .pp-bio { color:var(--text-muted); font-size:0.85rem; margin:0 0 8px; line-height:1.5; }
        .pp-meta-row { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:10px; }
        .pp-meta-item { display:inline-flex; align-items:center; gap:4px; font-family:var(--font-heading); font-size:0.78rem; color:var(--text-muted); font-weight:500; }
        .pp-meta-item strong { color:#e2e8f0; font-weight:700; }
        .pp-meta-dim { color:rgba(148,163,184,0.7); font-weight:400; }
        .pp-name { margin:0 0 8px; font-family:var(--font-heading); font-size:1.75rem; color:#f8fafc; }
        .pp-badges { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; }
        .pp-elo-num { font-family:var(--font-heading); font-weight:700; color:rgba(226,232,240,0.85); font-size:0.9rem; }
        .pp-status-pill, .pp-friend-pill { padding:2px 8px; border-radius:12px; font-size:0.75rem; font-family:var(--font-heading); font-weight:700; display:inline-flex; align-items:center; gap:5px; border:1px solid rgba(255,255,255,0.12); }
        .pp-friend-pill { background:rgba(34,197,94,0.1); border-color:rgba(34,197,94,0.25); color:#4ade80; }
        .pp-copy-btn { background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; color:#e2e8f0; transition:all 0.2s; }
        .pp-copy-btn:hover { background:rgba(167,139,250,0.15); border-color:rgba(167,139,250,0.3); }

        /* ELO Progress */
        .pp-elo-progress { margin-bottom:10px; }
        .pp-elo-labels { display:flex; justify-content:space-between; font-family:var(--font-heading); font-size:0.68rem; font-weight:700; margin-bottom:4px; }
        .pp-elo-track { width:100%; height:6px; border-radius:3px; background:rgba(255,255,255,0.08); overflow:hidden; }
        .pp-elo-fill { height:100%; border-radius:3px; transition:width 0.6s cubic-bezier(0.4,0,0.2,1); box-shadow:0 0 8px rgba(255,255,255,0.12); }

        /* Achievements */
        .pp-achievements { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
        .pp-ach-pill { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:20px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); font-family:var(--font-heading); font-size:0.7rem; font-weight:600; color:#e2e8f0; transition:opacity 0.3s; white-space:nowrap; }
        .pp-hero-actions { margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; }
        .pp-edit { margin-top:4px; display:inline-flex; align-items:center; justify-content:center; gap:6px; }
        .pp-danger-action { color:#f87171; border-color:rgba(248,113,113,0.32); background:rgba(248,113,113,0.06); }
        .pp-danger-action:hover:not(:disabled) { color:#fecaca; border-color:rgba(248,113,113,0.48); background:rgba(248,113,113,0.1); }
        .pp-friend-pill :global(svg),
        .pp-status-pill :global(.status-dot),
        .pp-copy-btn :global(svg),
        .pp-meta-item :global(svg),
        .pp-ach-pill :global(svg),
        .pp-edit :global(svg),
        .pp-sec-title :global(svg) { flex-shrink:0; }

        /* ── Stats ── */
        .pp-stats, .pp-history { padding:18px 20px; }
        .pp-sec-title { margin:0 0 14px; display:flex; align-items:center; gap:8px; font-family:var(--font-heading); font-size:1.05rem; color:#f8fafc; }

        .pp-wld-wrap { margin-bottom:14px; }
        .pp-wld-bar { display:flex; width:100%; height:8px; border-radius:4px; overflow:hidden; background:rgba(255,255,255,0.06); }
        .pp-wld-seg { display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .pp-wld-seg span { font-family:var(--font-heading); font-size:0; font-weight:700; color:white; }
        .pp-seg-w { background:#22c55e; }
        .pp-seg-l { background:#ef4444; }
        .pp-seg-d { background:#6b7280; }

        .pp-stat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:14px; }
        .pp-label { display:block; font-size:0.72rem; letter-spacing:0.08em; text-transform:uppercase; color:rgba(148,163,184,0.95); font-family:var(--font-heading); font-weight:700; margin-bottom:4px; }
        .pp-stat-grid strong { font-family:var(--font-heading); font-size:1.2rem; color:#f8fafc; }
        .pp-total-games { text-align:center; margin-top:14px; font-family:var(--font-heading); font-size:0.82rem; font-weight:600; color:var(--text-muted); padding:8px; border-radius:8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); }
        .pp-muted { color:rgba(148,163,184,0.92); font-size:0.9rem; margin:0; }

        /* ── Match History Tabs ── */
        .pp-tabs { display:flex; gap:4px; margin-bottom:14px; padding:3px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); }
        .pp-tab { flex:1; padding:7px 12px; border:none; background:transparent; color:var(--text-muted); font-family:var(--font-heading); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.2s; }
        .pp-tab:hover { color:#e2e8f0; background:rgba(255,255,255,0.04); }
        .pp-tab-active { color:#a78bfa; background:rgba(167,139,250,0.12); border-bottom:2px solid #a78bfa; }

        /* ── Match Rows ── */
        .pp-matches { list-style:none; margin:0; padding:0; }
        .pp-match-row { display:grid; grid-template-columns:32px minmax(0,1fr) auto auto auto; gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.88rem; }
        .pp-match-row:last-child { border-bottom:none; }

        .pp-res { width:28px; height:28px; border-radius:7px; display:inline-flex; align-items:center; justify-content:center; font-family:var(--font-heading); font-weight:800; font-size:0.78rem; }
        .pp-res-W { background:rgba(34,197,94,0.18); color:#34d399; }
        .pp-res-L { background:rgba(248,113,113,0.18); color:#f87171; }
        .pp-res-D { background:rgba(148,163,184,0.15); color:#94a3b8; }

        .pp-opp { color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pp-mode { color:#a78bfa; font-family:var(--font-heading); font-weight:600; font-size:0.78rem; }
        .pp-elo-delta { font-family:var(--font-heading); font-weight:700; font-size:0.78rem; }
        .pp-elo-plus { color:#34d399; }
        .pp-elo-minus { color:#f87171; }
        .pp-date { color:rgba(148,163,184,0.9); font-size:0.78rem; white-space:nowrap; }

        @media (max-width: 600px) {
          .pp-match-row { grid-template-columns:28px minmax(0,1fr); grid-template-rows:auto auto; }
          .pp-mode, .pp-date, .pp-elo-delta { grid-column:2; }
        }
      `}</style>
    </>
  );
}
