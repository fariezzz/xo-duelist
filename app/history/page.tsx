"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Clock,
  Flag,
  Flame,
  History,
  Inbox,
  ListFilter,
  LoaderCircle,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Swords,
  Timer,
  TrendingUp,
  Trophy,
  UserRound,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';
import Board from '../../components/Board';
import TierBadge from '../../components/TierBadge';
import type { Cell } from '../../lib/gameLogic';

const PAGE_SIZE = 20;
const EMPTY_BOARD: Cell[] = Array(25).fill(null);
const NOOP_MOVE = () => {};

type MatchType = 'pvp' | 'ai_ranked' | 'ai_casual' | 'ai';
type ModeFilter = 'all' | 'pvp' | 'ai_ranked' | 'ai_casual';
type ResultFilter = 'all' | 'win' | 'loss' | 'draw';
type DatePreset = 'all' | '7d' | '30d' | '90d' | 'custom';
type MatchResult = 'win' | 'loss' | 'draw';

type HistoryRow = {
  id: string;
  room_id: string;
  player1_id: string;
  player2_id: string;
  winner_id: string | null;
  winner_elo_before: number;
  winner_elo_after: number;
  loser_elo_before: number;
  loser_elo_after: number;
  played_at: string;
  match_type: MatchType | null;
  board_snapshot: unknown;
  move_log: unknown;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  total_turns: number | null;
  finish_reason: string | null;
};

type ReplayFrame = {
  board: Cell[];
  turnCount: number;
  actorId: string | null;
  playedAt: string | null;
};

type OpponentProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

const modeFilterMeta: Record<ModeFilter, { label: string; Icon: LucideIcon }> = {
  all: { label: 'All Modes', Icon: UsersRound },
  pvp: { label: 'PVP', Icon: Swords },
  ai_ranked: { label: 'AI Ranked', Icon: Bot },
  ai_casual: { label: 'AI Casual', Icon: Bot },
};

const resultFilterMeta: Record<ResultFilter, { label: string; Icon: LucideIcon; color: string }> = {
  all: { label: 'All Results', Icon: ListFilter, color: 'var(--text-primary)' },
  win: { label: 'Win', Icon: CircleCheck, color: '#10b981' },
  loss: { label: 'Loss', Icon: CircleX, color: '#ef4444' },
  draw: { label: 'Draw', Icon: Flag, color: '#94a3b8' },
};

const datePresetMeta: Record<DatePreset, { label: string; Icon: LucideIcon }> = {
  all: { label: 'All Time', Icon: Clock },
  '7d': { label: 'Last 7D', Icon: CalendarDays },
  '30d': { label: 'Last 30D', Icon: CalendarDays },
  '90d': { label: 'Last 90D', Icon: CalendarDays },
  custom: { label: 'Custom Date', Icon: CalendarDays },
};

function normalizeMatchType(t: MatchType | null): 'pvp' | 'ai_ranked' | 'ai_casual' {
  if (t === 'ai_casual') return 'ai_casual';
  if (t === 'ai_ranked' || t === 'ai') return 'ai_ranked';
  return 'pvp';
}

function getModeBadge(mode: 'pvp' | 'ai_ranked' | 'ai_casual') {
  if (mode === 'ai_casual') {
    return { label: 'AI Casual', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)', Icon: Bot };
  }
  if (mode === 'ai_ranked') {
    return { label: 'AI Ranked', color: '#a78bfa', bg: 'rgba(124,58,237,0.18)', Icon: Bot };
  }
  return { label: 'PVP', color: '#10b981', bg: 'rgba(16,185,129,0.16)', Icon: Swords };
}

function parseBoardSnapshot(raw: unknown): Cell[] | null {
  if (!raw) return null;
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value) || value.length !== 25) return null;
    return value.map((cell) => {
      if (cell === 'X' || cell === 'O' || cell === 'BARRIER' || cell === null) return cell;
      return null;
    }) as Cell[];
  } catch {
    return null;
  }
}

function parseMoveLog(raw: unknown): ReplayFrame[] {
  if (!raw) return [];

  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return [];

    const frames: ReplayFrame[] = [];
    for (const entry of value) {
      const board = parseBoardSnapshot((entry as { board_state?: unknown })?.board_state);
      if (!board) continue;

      frames.push({
        board,
        turnCount: Number((entry as { turn_count?: unknown })?.turn_count ?? frames.length + 1),
        actorId: typeof (entry as { actor_id?: unknown })?.actor_id === 'string'
          ? (entry as { actor_id: string }).actor_id
          : null,
        playedAt: typeof (entry as { played_at?: unknown })?.played_at === 'string'
          ? (entry as { played_at: string }).played_at
          : null,
      });
    }
    return frames;
  } catch {
    return [];
  }
}

function getResult(row: HistoryRow, uid: string | null): MatchResult {
  if (!uid) return 'draw';
  if (!row.winner_id) return 'draw';
  return row.winner_id === uid ? 'win' : 'loss';
}

function getOpponentId(row: HistoryRow, uid: string): string {
  return row.player1_id === uid ? row.player2_id : row.player1_id;
}

function getMyEloDelta(row: HistoryRow, uid: string): number {
  if (!row.winner_id) {
    if (row.player1_id === uid) return row.winner_elo_after - row.winner_elo_before;
    return row.loser_elo_after - row.loser_elo_before;
  }
  if (row.winner_id === uid) return row.winner_elo_after - row.winner_elo_before;
  return row.loser_elo_after - row.loser_elo_before;
}

function getMyEloAfter(row: HistoryRow, uid: string): number {
  if (!row.winner_id) {
    return row.player1_id === uid ? row.winner_elo_after : row.loser_elo_after;
  }
  return row.winner_id === uid ? row.winner_elo_after : row.loser_elo_after;
}

function formatFinishReason(raw: string | null | undefined): string {
  if (!raw) return 'Normal Finish';
  switch (raw) {
    case 'line_win':
      return 'Line Win';
    case 'draw_board_full':
      return 'Draw (Board Full)';
    case 'timeout_second_strike':
      return 'Timeout (Second Strike)';
    case 'surrender':
      return 'Surrender';
    case 'skill_overwrite_win':
      return 'Skill Overwrite Win';
    default:
      return raw.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function getDurationSeconds(match: HistoryRow, frames: ReplayFrame[]): number | null {
  if (typeof match.duration_seconds === 'number') return match.duration_seconds;
  if (match.started_at && match.ended_at) {
    const diff = Math.floor((new Date(match.ended_at).getTime() - new Date(match.started_at).getTime()) / 1000);
    if (Number.isFinite(diff) && diff >= 0) return diff;
  }
  const first = frames[0]?.playedAt ? new Date(frames[0].playedAt as string).getTime() : NaN;
  const last = frames[frames.length - 1]?.playedAt ? new Date(frames[frames.length - 1].playedAt as string).getTime() : NaN;
  if (!Number.isNaN(first) && !Number.isNaN(last) && last >= first) {
    return Math.floor((last - first) / 1000);
  }
  return null;
}

function getThresholdMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function asDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calcWinRate(rows: HistoryRow[], uid: string | null): number {
  if (!uid || rows.length === 0) return 0;
  const wins = rows.filter((r) => getResult(r, uid) === 'win').length;
  return Math.round((wins / rows.length) * 1000) / 10;
}

function calcCurrentStreak(rows: HistoryRow[], uid: string | null): { label: string; count: number } {
  if (!uid || rows.length === 0) return { label: '-', count: 0 };
  const latest = getResult(rows[0], uid);
  let count = 0;
  for (const row of rows) {
    if (getResult(row, uid) !== latest) break;
    count += 1;
  }
  const label = latest === 'win' ? 'W' : latest === 'loss' ? 'L' : 'D';
  return { label, count };
}

export default function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [searchText, setSearchText] = useState('');
  const [opponentProfiles, setOpponentProfiles] = useState<Record<string, OpponentProfile>>({});
  const [selectedMatch, setSelectedMatch] = useState<HistoryRow | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<1 | 2>(1);
  const [showChart, setShowChart] = useState(false);

  const ensureProfiles = useCallback(async (historyRows: HistoryRow[], uid: string) => {
    const opponentIds = Array.from(
      new Set(
        historyRows
          .map((r) => (r.player1_id === uid ? r.player2_id : r.player1_id))
          .filter((id): id is string => !!id)
      )
    );
    if (opponentIds.length === 0) return;

    const { data } = await supabaseClient
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', opponentIds);

    if (!data || data.length === 0) return;

    setOpponentProfiles((prev) => {
      const next = { ...prev };
      for (const p of data) {
        next[p.id] = {
          id: p.id,
          username: p.username ?? 'Opponent',
          avatar_url: p.avatar_url ?? null,
        };
      }
      return next;
    });
  }, []);

  const fetchPage = useCallback(async (uid: string, pageIndex: number, replace = false) => {
    const from = pageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data } = await supabaseClient
      .from('match_history')
      .select('id, room_id, player1_id, player2_id, winner_id, winner_elo_before, winner_elo_after, loser_elo_before, loser_elo_after, played_at, match_type, board_snapshot, move_log, started_at, ended_at, duration_seconds, total_turns, finish_reason')
      .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
      .order('played_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    const nextRows = (data as HistoryRow[] | null) ?? [];
    setHasMore(nextRows.length === PAGE_SIZE);
    setPage(pageIndex);

    if (replace) setRows(nextRows);
    else setRows((prev) => [...prev, ...nextRows]);

    await ensureProfiles(nextRows, uid);
  }, [ensureProfiles]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabaseClient.channel> | null = null;

    (async () => {
      const s = await supabaseClient.auth.getSession();
      const uid = s.data.session?.user.id ?? null;
      if (!uid || cancelled) {
        if (!cancelled) setLoading(false);
        return;
      }

      setMeId(uid);
      await fetchPage(uid, 0, true);
      if (!cancelled) setLoading(false);

      channel = supabaseClient
        .channel(`realtime-history-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_history' }, (payload) => {
          const record = payload.new as Partial<HistoryRow> | null;
          if (!record) return;
          const player1Id = typeof record.player1_id === 'string' ? record.player1_id : null;
          const player2Id = typeof record.player2_id === 'string' ? record.player2_id : null;
          if (player1Id === uid || player2Id === uid) {
            void fetchPage(uid, 0, true);
          }
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabaseClient.removeChannel(channel);
    };
  }, [fetchPage]);

  const viewRows = useMemo(() => {
    const trimmedSearch = searchText.trim().toLowerCase();
    const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null;

    return rows.filter((r) => {
      const mode = normalizeMatchType(r.match_type);
      if (modeFilter !== 'all' && mode !== modeFilter) return false;

      const playedAtMs = new Date(r.played_at).getTime();
      if (datePreset === '7d' && playedAtMs < getThresholdMs(7)) return false;
      if (datePreset === '30d' && playedAtMs < getThresholdMs(30)) return false;
      if (datePreset === '90d' && playedAtMs < getThresholdMs(90)) return false;
      if (datePreset === 'custom') {
        if (fromMs !== null && playedAtMs < fromMs) return false;
        if (toMs !== null && playedAtMs > toMs) return false;
      }

      if (meId && resultFilter !== 'all') {
        const result = getResult(r, meId);
        if (result !== resultFilter) return false;
      }

      if (trimmedSearch && meId) {
        const opponentId = getOpponentId(r, meId);
        const opponentName = (opponentProfiles[opponentId]?.username ?? opponentId).toLowerCase();
        if (!opponentName.includes(trimmedSearch)) return false;
      }

      return true;
    });
  }, [rows, modeFilter, datePreset, fromDate, toDate, meId, resultFilter, searchText, opponentProfiles]);

  const summary = useMemo(() => {
    if (!meId) return { win: 0, loss: 0, draw: 0 };
    return viewRows.reduce(
      (acc, r) => {
        const result = getResult(r, meId);
        if (result === 'win') acc.win += 1;
        else if (result === 'loss') acc.loss += 1;
        else acc.draw += 1;
        return acc;
      },
      { win: 0, loss: 0, draw: 0 }
    );
  }, [meId, viewRows]);

  const analytics = useMemo(() => {
    if (!meId) {
      return {
        winRate7: 0,
        winRate30: 0,
        currentStreak: { label: '-', count: 0 },
        avgDelta20: 0,
      };
    }

    const rows7 = rows.filter((r) => new Date(r.played_at).getTime() >= getThresholdMs(7));
    const rows30 = rows.filter((r) => new Date(r.played_at).getTime() >= getThresholdMs(30));
    const currentStreak = calcCurrentStreak(rows, meId);
    const last20 = rows.slice(0, 20);
    const avgDelta20 = last20.length > 0
      ? Math.round((last20.reduce((sum, row) => sum + getMyEloDelta(row, meId), 0) / last20.length) * 100) / 100
      : 0;

    return {
      winRate7: calcWinRate(rows7, meId),
      winRate30: calcWinRate(rows30, meId),
      currentStreak,
      avgDelta20,
    };
  }, [rows, meId]);

  const eloTrend = useMemo(() => {
    if (!meId) return [] as Array<{ elo: number; playedAt: string }>;
    return [...rows]
      .sort((a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime())
      .map((row) => ({
        elo: getMyEloAfter(row, meId),
        playedAt: row.played_at,
      }));
  }, [rows, meId]);

  const selectedBoardSnapshot = useMemo(() => {
    if (!selectedMatch) return null;
    return parseBoardSnapshot(selectedMatch.board_snapshot);
  }, [selectedMatch]);

  const replayFrames = useMemo(() => {
    if (!selectedMatch) return [];
    const frames = parseMoveLog(selectedMatch.move_log);
    if (frames.length > 0) return frames;
    if (selectedBoardSnapshot) {
      return [{
        board: selectedBoardSnapshot,
        turnCount: selectedMatch.total_turns ?? 0,
        actorId: null,
        playedAt: selectedMatch.played_at,
      }];
    }
    return [];
  }, [selectedBoardSnapshot, selectedMatch]);

  useEffect(() => {
    if (!selectedMatch || !replayPlaying || replayFrames.length <= 1) return;

    const delay = replaySpeed === 2 ? 450 : 900;
    const timer = setInterval(() => {
      setReplayIndex((prev) => {
        const next = prev + 1;
        if (next >= replayFrames.length) {
          setReplayPlaying(false);
          return replayFrames.length - 1;
        }
        return next;
      });
    }, delay);

    return () => clearInterval(timer);
  }, [replayFrames.length, replayPlaying, replaySpeed, selectedMatch]);

  const safeReplayIndex = Math.min(Math.max(replayIndex, 0), Math.max(replayFrames.length - 1, 0));
  const selectedBoard = replayFrames[safeReplayIndex]?.board ?? EMPTY_BOARD;
  const currentFrame = replayFrames[safeReplayIndex];

  const selectedDetail = useMemo(() => {
    if (!selectedMatch || !meId) return null;
    const opponentId = getOpponentId(selectedMatch, meId);
    const opponentName = opponentProfiles[opponentId]?.username ?? `${opponentId.slice(0, 8)}...`;
    const result = getResult(selectedMatch, meId);
    const eloDelta = getMyEloDelta(selectedMatch, meId);
    const turns = selectedMatch.total_turns ?? replayFrames.length;
    const duration = getDurationSeconds(selectedMatch, replayFrames);
    const h2hRows = rows.filter((r) => getOpponentId(r, meId) === opponentId);

    const headToHead = h2hRows.reduce(
      (acc, row) => {
        const r = getResult(row, meId);
        if (r === 'win') acc.win += 1;
        else if (r === 'loss') acc.loss += 1;
        else acc.draw += 1;
        acc.eloDelta += getMyEloDelta(row, meId);
        return acc;
      },
      { win: 0, loss: 0, draw: 0, eloDelta: 0 }
    );

    return {
      opponentName,
      result,
      eloDelta,
      turns,
      duration,
      finishReason: formatFinishReason(selectedMatch.finish_reason),
      startedAt: selectedMatch.started_at,
      endedAt: selectedMatch.ended_at,
      headToHead,
      h2hCount: h2hRows.length,
    };
  }, [selectedMatch, meId, opponentProfiles, replayFrames, rows]);

  function openReplay(match: HistoryRow) {
    setReplayIndex(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    setSelectedMatch(match);
  }

  function closeReplay() {
    setReplayPlaying(false);
    setSelectedMatch(null);
  }

  async function loadMore() {
    if (!meId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(meId, page + 1, false);
    } finally {
      setLoadingMore(false);
    }
  }

  const chart = useMemo(() => {
    if (eloTrend.length === 0) return null;
    const width = 360;
    const height = 92;
    const pad = 16;

    const min = Math.min(...eloTrend.map((p) => p.elo));
    const max = Math.max(...eloTrend.map((p) => p.elo));
    const range = Math.max(max - min, 1);

    const points = eloTrend.map((p, i) => {
      const x = pad + (i * (width - pad * 2)) / Math.max(eloTrend.length - 1, 1);
      const y = height - pad - ((p.elo - min) / range) * (height - pad * 2);
      return `${x},${y}`;
    }).join(' ');

    return (
      <>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
          <line x1={pad} y1={pad} x2={pad} y2={height - pad} stroke="rgba(148,163,184,0.2)" />
          <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="rgba(148,163,184,0.2)" />
          <polyline
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />
        </svg>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.74rem', marginTop: '6px' }}>
          <span>Min: {min}</span>
          <span>Max: {max}</span>
        </div>
      </>
    );
  }, [eloTrend]);

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in history-page" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div className="history-shell" style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <h1 className="heading history-title" style={{ fontSize: '2rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <History size={30} strokeWidth={2.4} color="var(--accent-violet-light)" />
            Match History
          </h1>

          <div className="card history-stats-grid" style={{ marginBottom: '14px', padding: '8px', display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <div className="history-stat-card" style={{ border: '1px solid rgba(16,185,129,0.3)', background: 'linear-gradient(135deg, rgba(16,185,129,0.14), rgba(16,185,129,0.04))', borderRadius: '12px', padding: '6px 10px', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
              <div className="history-stat-title">
                <Trophy size={14} color="#10b981" />
                Winrate 7D
              </div>
              <div style={{ color: '#10b981', fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 }}>{analytics.winRate7}%</div>
            </div>
            <div className="history-stat-card" style={{ border: '1px solid rgba(34,211,238,0.3)', background: 'linear-gradient(135deg, rgba(34,211,238,0.14), rgba(34,211,238,0.04))', borderRadius: '12px', padding: '6px 10px', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
              <div className="history-stat-title">
                <CalendarDays size={14} color="#22d3ee" />
                Winrate 30D
              </div>
              <div style={{ color: '#22d3ee', fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 }}>{analytics.winRate30}%</div>
            </div>
            <div className="history-stat-card" style={{ border: '1px solid rgba(251,191,36,0.3)', background: 'linear-gradient(135deg, rgba(251,191,36,0.14), rgba(251,191,36,0.04))', borderRadius: '12px', padding: '6px 10px', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
              <div className="history-stat-title">
                <Flame size={14} color="#fbbf24" />
                Current Streak
              </div>
              <div style={{ color: '#fbbf24', fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 }}>
                {analytics.currentStreak.label} {analytics.currentStreak.count}
              </div>
            </div>
            <div className="history-stat-card" style={{ border: `1px solid ${analytics.avgDelta20 >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, background: `linear-gradient(135deg, ${analytics.avgDelta20 >= 0 ? 'rgba(16,185,129,0.14)' : 'rgba(239,68,68,0.14)'}, rgba(255,255,255,0.03))`, borderRadius: '12px', padding: '6px 10px', minHeight: '60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
              <div className="history-stat-title">
                <TrendingUp size={14} color={analytics.avgDelta20 >= 0 ? '#10b981' : '#ef4444'} />
                Avg ELO Delta (20)
              </div>
              <div style={{ color: analytics.avgDelta20 >= 0 ? '#10b981' : '#ef4444', fontFamily: 'var(--font-heading)', fontSize: '1.55rem', fontWeight: 700, lineHeight: 1 }}>
                {analytics.avgDelta20 > 0 ? '+' : ''}{analytics.avgDelta20}
              </div>
            </div>
          </div>

          <div className="card history-chart-card" style={{ padding: '10px 12px', marginBottom: '14px' }}>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'space-between', padding: '8px 10px', fontSize: '0.85rem' }}
              onClick={() => setShowChart((prev) => !prev)}
            >
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={16} color="#a78bfa" />
                ELO Trend
                {showChart ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                {showChart ? 'Hide' : 'Show'}
              </span>
            </button>

            {showChart && (
              <div style={{ marginTop: '10px', padding: '0 2px 2px' }}>
                {chart ?? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                    No chart data is available from the loaded matches.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card history-filter-card" style={{ marginBottom: '14px', padding: '12px', display: 'grid', gap: '10px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              <ListFilter size={15} color="#a78bfa" />
              Filters
            </div>

            <div className="history-filter-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'pvp', 'ai_ranked', 'ai_casual'] as const).map((mode) => {
                const meta = modeFilterMeta[mode];
                const Icon = meta.Icon;
                return (
                  <button
                    key={mode}
                    className={modeFilter === mode ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                    onClick={() => setModeFilter(mode)}
                  >
                    <Icon size={14} />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="history-filter-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'win', 'loss', 'draw'] as const).map((result) => {
                const meta = resultFilterMeta[result];
                const Icon = meta.Icon;
                return (
                  <button
                    key={result}
                    className={resultFilter === result ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                    onClick={() => setResultFilter(result)}
                  >
                    <Icon size={14} color={resultFilter === result ? 'currentColor' : meta.color} />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            <div className="history-filter-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', '7d', '30d', '90d', 'custom'] as const).map((preset) => {
                const meta = datePresetMeta[preset];
                const Icon = meta.Icon;
                return (
                  <button
                    key={preset}
                    className={datePreset === preset ? 'btn btn-primary' : 'btn btn-ghost'}
                    style={{ padding: '7px 12px', fontSize: '0.78rem' }}
                    onClick={() => {
                      setDatePreset(preset);
                      if (preset !== 'custom') {
                        setFromDate('');
                        setToDate('');
                      }
                    }}
                  >
                    <Icon size={14} />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {datePreset === 'custom' && (
              <div className="history-custom-date-row" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ display: 'grid', gap: '4px', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                  From
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="input"
                    style={{ minWidth: '160px' }}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px', color: 'var(--text-muted)', fontSize: '0.76rem' }}>
                  To
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    max={asDateInputValue(new Date())}
                    onChange={(e) => setToDate(e.target.value)}
                    className="input"
                    style={{ minWidth: '160px' }}
                  />
                </label>
              </div>
            )}

            <div className="history-search-wrap" style={{ position: 'relative', maxWidth: '320px' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                className="input"
                placeholder="Search opponent name..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
              />
            </div>
          </div>

          <div className="card history-summary-card" style={{ marginBottom: '16px', padding: '12px 18px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <span className="history-summary-item" style={{ color: '#10b981' }}><CircleCheck size={15} />Win: {summary.win}</span>
            <span className="history-summary-item" style={{ color: '#ef4444' }}><CircleX size={15} />Loss: {summary.loss}</span>
            <span className="history-summary-item" style={{ color: 'var(--text-muted)' }}><Flag size={15} />Draw: {summary.draw}</span>
            <span className="history-summary-item" style={{ color: 'var(--text-muted)', fontWeight: 600 }}><History size={15} />Loaded: {rows.length}</span>
            <span className="history-summary-item" style={{ color: 'var(--text-muted)', fontWeight: 600 }}><ListFilter size={15} />Filtered: {viewRows.length}</span>
          </div>

          <div className="card history-table-card" style={{ padding: '8px 0', overflow: 'auto' }}>
            <table className="table-premium history-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}><span className="history-table-heading"><CircleCheck size={14} />Result</span></th>
                  <th><span className="history-table-heading"><UserRound size={14} />Opponent</span></th>
                  <th><span className="history-table-heading"><Swords size={14} />Mode</span></th>
                  <th><span className="history-table-heading"><TrendingUp size={14} />ELO</span></th>
                  <th><span className="history-table-heading"><CalendarDays size={14} />Date</span></th>
                  <th style={{ paddingRight: '20px' }}>
                    <div style={{ display: 'grid', gap: '2px' }}>
                      <span className="history-table-heading"><Play size={14} />Replay</span>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.68rem', letterSpacing: '0.02em', textTransform: 'none' }}>Watch Replay</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!loading && viewRows.map((r) => {
                  const opponentId = meId ? getOpponentId(r, meId) : r.player2_id;
                  const opponentProfile = opponentProfiles[opponentId];

                  const result = meId ? getResult(r, meId) : 'draw';
                  const eloDelta = meId ? getMyEloDelta(r, meId) : 0;

                  const opponentEloAfter = !r.winner_id
                    ? (opponentId === r.player1_id ? r.winner_elo_after : r.loser_elo_after)
                    : (opponentId === r.winner_id ? r.winner_elo_after : r.loser_elo_after);

                  const mode = normalizeMatchType(r.match_type);
                  const badge = getModeBadge(mode);
                  const BadgeIcon = badge.Icon;
                  const isAI = mode === 'ai_ranked' || mode === 'ai_casual';

                  let rowBg = 'transparent';
                  let resultColor = 'var(--text-muted)';
                  let resultLabel = 'Draw';
                  if (result === 'win') {
                    rowBg = 'rgba(16, 185, 129, 0.06)';
                    resultColor = '#10b981';
                    resultLabel = 'Win';
                  } else if (result === 'loss') {
                    rowBg = 'rgba(239, 68, 68, 0.06)';
                    resultColor = '#ef4444';
                    resultLabel = 'Loss';
                  }
                  const resultMeta = resultFilterMeta[result];
                  const ResultIcon = resultMeta.Icon;

                  return (
                    <tr key={r.id} className="history-match-row" style={{ background: rowBg }}>
                      <td data-label="Result" style={{ paddingLeft: '20px', fontFamily: 'var(--font-heading)', fontWeight: 700, color: resultColor }}>
                        <span className="history-inline-icon">
                          <ResultIcon size={15} color={resultColor} />
                          {resultLabel}
                        </span>
                      </td>
                      <td data-label="Opponent">
                        <div
                          className={`history-opponent-cell${!isAI ? " history-opp-link" : ""}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: !isAI ? 'pointer' : 'default' }}
                          onClick={!isAI ? () => router.push(`/profile/${encodeURIComponent(opponentProfile?.username ?? opponentId)}`) : undefined}
                          title={!isAI ? `View ${(opponentProfile?.username ?? opponentId)}'s profile` : undefined}
                        >
                          <div className={!isAI ? "history-opp-avatar" : ""} style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-layer-2)', border: '1px solid transparent', transition: 'transform 0.15s, border-color 0.2s' }}>
                            {opponentProfile?.avatar_url ? (
                              <img src={opponentProfile.avatar_url} alt={opponentProfile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : isAI ? (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                                <Bot size={16} />
                              </div>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                                {(opponentProfile?.username ?? 'OP').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span className={!isAI ? "history-opp-name" : ""} style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, transition: 'color 0.2s' }}>
                              {opponentProfile?.username ?? `${opponentId.slice(0, 8)}...`}
                            </span>
                            <TierBadge elo={opponentEloAfter ?? 1000} />
                          </div>
                        </div>
                      </td>
                      <td data-label="Mode">
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.78rem', color: badge.color, background: badge.bg, padding: '4px 10px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <BadgeIcon size={13} />
                          {badge.label}
                        </span>
                      </td>
                      <td data-label="ELO">
                        <span
                          style={{
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 700,
                            color: eloDelta > 0 ? '#10b981' : eloDelta < 0 ? '#ef4444' : 'var(--text-muted)',
                          }}
                        >
                          {eloDelta > 0 ? `+${eloDelta}` : eloDelta}
                        </span>
                      </td>
                      <td data-label="Date" style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(r.played_at).toLocaleString()}
                      </td>
                      <td data-label="Replay" style={{ paddingRight: '20px' }}>
                        <button
                          className="btn btn-ghost history-replay-button"
                          style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          title="Watch replay of this match"
                          aria-label="Watch replay of this match"
                          onClick={() => openReplay(r)}
                        >
                          <Play size={14} />
                          Watch Replay
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      <span className="history-empty-state"><LoaderCircle className="history-spin" size={18} />Loading history...</span>
                    </td>
                  </tr>
                )}
                {!loading && viewRows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      <span className="history-empty-state"><Inbox size={18} />No matches found with current filter.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-ghost" disabled={loadingMore || !hasMore || loading} onClick={loadMore}>
              {loadingMore ? (
                <><LoaderCircle className="history-spin" size={15} />Loading...</>
              ) : hasMore ? (
                <><History size={15} />Load More</>
              ) : (
                <><Inbox size={15} />No More Matches</>
              )}
            </button>
          </div>
        </div>
      </div>

      {selectedMatch && (
        <div
          className="history-replay-overlay"
          onClick={closeReplay}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99,
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="card history-replay-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '980px', padding: '20px', borderColor: 'rgba(124,58,237,0.35)', maxHeight: '92vh', overflow: 'auto' }}
          >
            <div className="history-replay-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div className="history-replay-title" style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.15rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Play size={18} color="#a78bfa" />
                Match Replay & Detail
              </div>
              <button className="btn btn-ghost history-replay-close" style={{ padding: '6px 10px' }} onClick={closeReplay}>
                <X size={15} />
                Close
              </button>
            </div>

            <div className="history-replay-date" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '14px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={15} />
              {new Date(selectedMatch.played_at).toLocaleString()}
            </div>

            <div className="history-replay-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                {replayFrames.length > 0 ? (
                  <>
                    <div className="history-replay-board-wrap" style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                      <Board board={selectedBoard} onMove={NOOP_MOVE} disabled />
                    </div>

                    <div className="history-replay-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <Timer size={14} />
                        Move {safeReplayIndex + 1} / {replayFrames.length}
                        {typeof currentFrame?.turnCount === 'number' ? ` | Turn ${currentFrame.turnCount}` : ''}
                        {currentFrame?.actorId ? ` | ${currentFrame.actorId === meId ? 'You' : 'Opponent'} moved` : ''}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={14} />
                        {currentFrame?.playedAt ? new Date(currentFrame.playedAt).toLocaleTimeString() : ''}
                      </div>
                    </div>

                    <div className="history-replay-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        disabled={safeReplayIndex <= 0}
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayIndex((prev) => Math.max(prev - 1, 0));
                        }}
                      >
                        <SkipBack size={14} />
                        Prev
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        onClick={() => {
                          if (safeReplayIndex >= replayFrames.length - 1) setReplayIndex(0);
                          setReplayPlaying((p) => !p);
                        }}
                      >
                        {replayPlaying ? <Pause size={14} /> : <Play size={14} />}
                        {replayPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        disabled={safeReplayIndex >= replayFrames.length - 1}
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayIndex((prev) => Math.min(prev + 1, replayFrames.length - 1));
                        }}
                      >
                        <SkipForward size={14} />
                        Next
                      </button>
                      <button
                        className={replaySpeed === 1 ? 'btn btn-primary' : 'btn btn-ghost'}
                        style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                        onClick={() => setReplaySpeed(1)}
                      >
                        x1
                      </button>
                      <button
                        className={replaySpeed === 2 ? 'btn btn-primary' : 'btn btn-ghost'}
                        style={{ padding: '6px 10px', fontSize: '0.76rem' }}
                        onClick={() => setReplaySpeed(2)}
                      >
                        x2
                      </button>
                    </div>
                  </>
                ) : selectedBoardSnapshot ? (
                  <div className="history-replay-board-wrap" style={{ display: 'flex', justifyContent: 'center' }}>
                    <Board board={selectedBoard} onMove={NOOP_MOVE} disabled />
                  </div>
                ) : (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px' }}>
                    <span className="history-empty-state"><Inbox size={18} />Snapshot not available for this older match.</span>
                  </div>
                )}
              </div>

              <div className="history-replay-facts" style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
                <div className="card history-replay-fact-card" style={{ padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Flag size={16} color="#a78bfa" />
                    Match Facts
                  </div>
                  {selectedDetail && (
                    <div style={{ display: 'grid', gap: '6px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                      <div className="history-detail-row"><UserRound size={14} />Opponent: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.opponentName}</span></div>
                      <div className="history-detail-row">
                        {selectedDetail.result === 'win' ? <CircleCheck size={14} /> : selectedDetail.result === 'loss' ? <CircleX size={14} /> : <Flag size={14} />}
                        Result: <span style={{ color: selectedDetail.result === 'win' ? '#10b981' : selectedDetail.result === 'loss' ? '#ef4444' : '#94a3b8' }}>{selectedDetail.result.toUpperCase()}</span>
                      </div>
                      <div className="history-detail-row"><TrendingUp size={14} />ELO Delta: <span style={{ color: selectedDetail.eloDelta >= 0 ? '#10b981' : '#ef4444' }}>{selectedDetail.eloDelta > 0 ? '+' : ''}{selectedDetail.eloDelta}</span></div>
                      <div className="history-detail-row"><Flag size={14} />Finish Reason: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.finishReason}</span></div>
                      <div className="history-detail-row"><ListFilter size={14} />Total Turns: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.turns}</span></div>
                      <div className="history-detail-row"><Timer size={14} />Duration: <span style={{ color: 'var(--text-primary)' }}>{formatDuration(selectedDetail.duration)}</span></div>
                      <div className="history-detail-row"><CalendarDays size={14} />Started: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.startedAt ? new Date(selectedDetail.startedAt).toLocaleString() : '-'}</span></div>
                      <div className="history-detail-row"><Clock size={14} />Ended: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.endedAt ? new Date(selectedDetail.endedAt).toLocaleString() : '-'}</span></div>
                    </div>
                  )}
                </div>

                <div className="card history-replay-fact-card" style={{ padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    <Swords size={16} color="#10b981" />
                    Head to Head
                  </div>
                  {selectedDetail ? (
                    <div style={{ display: 'grid', gap: '6px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                      <div className="history-detail-row"><UsersRound size={14} />Total Matches: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.h2hCount}</span></div>
                      <div className="history-detail-row"><Trophy size={14} />W-L-D: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.headToHead.win}-{selectedDetail.headToHead.loss}-{selectedDetail.headToHead.draw}</span></div>
                      <div className="history-detail-row"><TrendingUp size={14} />Cumulative ELO Delta: <span style={{ color: selectedDetail.headToHead.eloDelta >= 0 ? '#10b981' : '#ef4444' }}>{selectedDetail.headToHead.eloDelta > 0 ? '+' : ''}{selectedDetail.headToHead.eloDelta}</span></div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}><span className="history-empty-state"><Inbox size={16} />No data.</span></div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        .history-stat-title {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-family: var(--font-heading);
          font-weight: 600;
        }

        .history-summary-item,
        .history-table-heading,
        .history-inline-icon,
        .history-empty-state,
        .history-detail-row {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .history-summary-item {
          font-family: var(--font-heading);
          font-weight: 700;
        }

        .history-table-heading {
          justify-content: flex-start;
        }

        .history-detail-row {
          flex-wrap: wrap;
        }

        .history-spin {
          animation: history-spin 1s linear infinite;
        }

        .history-opp-link:hover .history-opp-avatar {
          transform: scale(1.1);
          border-color: rgba(167, 139, 250, 0.4) !important;
        }

        .history-opp-link:hover .history-opp-name {
          color: #a78bfa !important;
        }

        @media (max-width: 768px) {
          .history-page {
            padding: calc(var(--navbar-height) + 14px) 12px 24px !important;
          }

          .history-shell {
            max-width: 100% !important;
          }

          .history-title {
            font-size: 1.45rem !important;
            margin-bottom: 12px !important;
            line-height: 1.1;
          }

          .history-title svg {
            width: 24px;
            height: 24px;
          }

          .history-stats-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 7px !important;
            padding: 7px !important;
            border-radius: 12px !important;
          }

          .history-stat-card {
            min-height: 58px !important;
            padding: 8px 9px !important;
            border-radius: 10px !important;
          }

          .history-stat-title {
            font-size: 0.6rem;
            gap: 5px;
            line-height: 1.1;
          }

          .history-stat-card > div:last-child {
            font-size: 1.35rem !important;
          }

          .history-chart-card,
          .history-filter-card,
          .history-summary-card {
            border-radius: 12px !important;
          }

          .history-filter-card {
            padding: 10px !important;
            gap: 9px !important;
          }

          .history-filter-row {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px !important;
          }

          .history-filter-row .btn {
            width: 100%;
            min-width: 0;
            justify-content: center;
            padding: 8px 7px !important;
            font-size: 0.74rem !important;
            white-space: nowrap;
          }

          .history-custom-date-row {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px !important;
          }

          .history-custom-date-row label {
            min-width: 0;
          }

          .history-custom-date-row input {
            min-width: 0 !important;
            width: 100%;
          }

          .history-search-wrap {
            max-width: none !important;
          }

          .history-summary-card {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px !important;
            padding: 10px !important;
            margin-bottom: 12px !important;
          }

          .history-summary-item {
            justify-content: center;
            min-height: 32px;
            border-radius: 9px;
            background: rgba(255, 255, 255, 0.03);
            font-size: 0.8rem;
          }

          .history-table-card {
            padding: 0 !important;
            overflow: visible !important;
            background: transparent !important;
            border: 0 !important;
          }

          .history-table,
          .history-table thead,
          .history-table tbody,
          .history-table tr,
          .history-table td {
            display: block;
            width: 100%;
          }

          .history-table thead {
            display: none;
          }

          .history-table tbody {
            display: grid;
            gap: 10px;
          }

          .history-match-row {
            padding: 4px 12px 12px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            background-color: rgba(255, 255, 255, 0.03);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            overflow: hidden;
          }

          .history-table tbody td {
            border: 0 !important;
            padding: 9px 0 !important;
          }

          .history-table tbody td[data-label] {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            min-height: 38px;
            border-top: 1px solid rgba(255, 255, 255, 0.06) !important;
          }

          .history-table tbody td[data-label]:first-child {
            border-top: 0 !important;
          }

          .history-table tbody td[data-label]::before {
            content: attr(data-label);
            flex-shrink: 0;
            color: var(--text-muted);
            font-family: var(--font-heading);
            font-size: 0.68rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          .history-table tbody td[data-label="Opponent"] {
            align-items: flex-start;
          }

          .history-table tbody td[data-label="Opponent"]::before {
            padding-top: 7px;
          }

          .history-opponent-cell {
            min-width: 0;
            justify-content: flex-end;
            text-align: right;
          }

          .history-opponent-cell > div:last-child {
            min-width: 0;
            align-items: flex-end;
          }

          .history-replay-button {
            min-height: 34px;
            padding: 7px 10px !important;
          }

          .history-replay-overlay {
            align-items: flex-start !important;
            padding: 8px !important;
            overflow-y: auto;
          }

          .history-replay-card {
            max-height: calc(100dvh - 16px) !important;
            padding: 12px !important;
            border-radius: 14px !important;
          }

          .history-replay-header {
            gap: 10px;
            margin-bottom: 10px !important;
          }

          .history-replay-title {
            min-width: 0;
            font-size: 1rem !important;
            line-height: 1.15;
          }

          .history-replay-close {
            flex-shrink: 0;
            min-height: 34px;
          }

          .history-replay-date {
            margin-bottom: 10px !important;
            font-size: 0.78rem !important;
            line-height: 1.3;
          }

          .history-replay-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }

          .history-replay-board-wrap {
            overflow-x: hidden;
            margin-bottom: 10px !important;
          }

          .history-replay-meta {
            justify-content: center !important;
            text-align: center;
            gap: 6px !important;
          }

          .history-replay-controls {
            display: grid !important;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px !important;
          }

          .history-replay-controls .btn {
            width: 100%;
            min-width: 0;
            justify-content: center;
            padding: 8px 6px !important;
          }

          .history-replay-fact-card {
            padding: 10px !important;
            border-radius: 12px !important;
          }
        }

        @media (max-width: 380px) {
          .history-stats-grid,
          .history-summary-card,
          .history-custom-date-row {
            grid-template-columns: 1fr !important;
          }

          .history-filter-row {
            grid-template-columns: 1fr !important;
          }

          .history-replay-controls {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @keyframes history-spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
