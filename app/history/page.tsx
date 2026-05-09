"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function normalizeMatchType(t: MatchType | null): 'pvp' | 'ai_ranked' | 'ai_casual' {
  if (t === 'ai_casual') return 'ai_casual';
  if (t === 'ai_ranked' || t === 'ai') return 'ai_ranked';
  return 'pvp';
}

function getModeBadge(mode: 'pvp' | 'ai_ranked' | 'ai_casual') {
  if (mode === 'ai_casual') {
    return { label: 'AI Casual', color: '#94a3b8', bg: 'rgba(148,163,184,0.16)' };
  }
  if (mode === 'ai_ranked') {
    return { label: 'AI Ranked', color: '#a78bfa', bg: 'rgba(124,58,237,0.18)' };
  }
  return { label: 'PVP', color: '#10b981', bg: 'rgba(16,185,129,0.16)' };
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
    const height = 130;
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
      <div className="card" style={{ padding: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>ELO Trend</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>From loaded matches</span>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '8px' }}>
          <span>Min: {min}</span>
          <span>Max: {max}</span>
        </div>
      </div>
    );
  }, [eloTrend]);

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '1040px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '16px' }}>Match History</h1>

          <div className="card" style={{ marginBottom: '14px', padding: '12px 16px', display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Winrate 7D</div>
              <div style={{ color: '#10b981', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>{analytics.winRate7}%</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Winrate 30D</div>
              <div style={{ color: '#22d3ee', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>{analytics.winRate30}%</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Current Streak</div>
              <div style={{ color: '#fbbf24', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>
                {analytics.currentStreak.label} {analytics.currentStreak.count}
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem' }}>Avg ELO Delta (20)</div>
              <div style={{ color: analytics.avgDelta20 >= 0 ? '#10b981' : '#ef4444', fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700 }}>
                {analytics.avgDelta20 > 0 ? '+' : ''}{analytics.avgDelta20}
              </div>
            </div>
          </div>

          {chart}

          <div className="card" style={{ marginBottom: '14px', padding: '12px', display: 'grid', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'pvp', 'ai_ranked', 'ai_casual'] as const).map((mode) => (
                <button
                  key={mode}
                  className={modeFilter === mode ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                  onClick={() => setModeFilter(mode)}
                >
                  {mode === 'all' ? 'All Modes' : mode === 'pvp' ? 'PVP' : mode === 'ai_ranked' ? 'AI Ranked' : 'AI Casual'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', 'win', 'loss', 'draw'] as const).map((result) => (
                <button
                  key={result}
                  className={resultFilter === result ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ padding: '7px 12px', fontSize: '0.8rem' }}
                  onClick={() => setResultFilter(result)}
                >
                  {result === 'all' ? 'All Results' : result[0].toUpperCase() + result.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['all', '7d', '30d', '90d', 'custom'] as const).map((preset) => (
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
                  {preset === 'all' ? 'All Time' : preset === 'custom' ? 'Custom Date' : `Last ${preset.toUpperCase()}`}
                </button>
              ))}
            </div>

            {datePreset === 'custom' && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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

            <input
              className="input"
              placeholder="Search opponent name..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ maxWidth: '320px' }}
            />
          </div>

          <div className="card" style={{ marginBottom: '16px', padding: '12px 18px', display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <span style={{ color: '#10b981', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Win: {summary.win}</span>
            <span style={{ color: '#ef4444', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Loss: {summary.loss}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 700 }}>Draw: {summary.draw}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>Loaded: {rows.length}</span>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>Filtered: {viewRows.length}</span>
          </div>

          <div className="card" style={{ padding: '8px 0', overflow: 'auto' }}>
            <table className="table-premium">
              <thead>
                <tr>
                  <th style={{ paddingLeft: '20px' }}>Result</th>
                  <th>Opponent</th>
                  <th>Mode</th>
                  <th>ELO</th>
                  <th>Date</th>
                  <th style={{ paddingRight: '20px' }}>Replay</th>
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

                  return (
                    <tr key={r.id} style={{ background: rowBg }}>
                      <td style={{ paddingLeft: '20px', fontFamily: 'var(--font-heading)', fontWeight: 700, color: resultColor }}>
                        {resultLabel}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-layer-2)' }}>
                            {opponentProfile?.avatar_url ? (
                              <img src={opponentProfile.avatar_url} alt={opponentProfile.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.74rem', fontWeight: 700 }}>
                                {(opponentProfile?.username ?? 'OP').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600 }}>
                              {opponentProfile?.username ?? `${opponentId.slice(0, 8)}...`}
                            </span>
                            <TierBadge elo={opponentEloAfter ?? 1000} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.78rem', color: badge.color, background: badge.bg, padding: '4px 10px', borderRadius: '999px' }}>
                          {badge.label}
                        </span>
                      </td>
                      <td>
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
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(r.played_at).toLocaleString()}
                      </td>
                      <td style={{ paddingRight: '20px' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                          onClick={() => openReplay(r)}
                        >
                          Replay
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {loading && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      Loading history...
                    </td>
                  </tr>
                )}
                {!loading && viewRows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                      No matches found with current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
            <button className="btn btn-ghost" disabled={loadingMore || !hasMore || loading} onClick={loadMore}>
              {loadingMore ? 'Loading...' : hasMore ? 'Load More' : 'No More Matches'}
            </button>
          </div>
        </div>
      </div>

      {selectedMatch && (
        <div
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
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '980px', padding: '20px', borderColor: 'rgba(124,58,237,0.35)', maxHeight: '92vh', overflow: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.15rem' }}>
                Match Replay & Detail
              </div>
              <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={closeReplay}>
                Close
              </button>
            </div>

            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '14px' }}>
              {new Date(selectedMatch.played_at).toLocaleString()}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              <div>
                {replayFrames.length > 0 ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                      <Board board={selectedBoard} onMove={NOOP_MOVE} disabled />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        Move {safeReplayIndex + 1} / {replayFrames.length}
                        {typeof currentFrame?.turnCount === 'number' ? ` | Turn ${currentFrame.turnCount}` : ''}
                        {currentFrame?.actorId ? ` | ${currentFrame.actorId === meId ? 'You' : 'Opponent'} moved` : ''}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {currentFrame?.playedAt ? new Date(currentFrame.playedAt).toLocaleTimeString() : ''}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        disabled={safeReplayIndex <= 0}
                        onClick={() => {
                          setReplayPlaying(false);
                          setReplayIndex((prev) => Math.max(prev - 1, 0));
                        }}
                      >
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
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <Board board={selectedBoard} onMove={NOOP_MOVE} disabled />
                  </div>
                ) : (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '18px' }}>
                    Snapshot not available for this older match.
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: '10px', alignContent: 'start' }}>
                <div className="card" style={{ padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '8px' }}>Match Facts</div>
                  {selectedDetail && (
                    <div style={{ display: 'grid', gap: '6px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                      <div>Opponent: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.opponentName}</span></div>
                      <div>Result: <span style={{ color: selectedDetail.result === 'win' ? '#10b981' : selectedDetail.result === 'loss' ? '#ef4444' : '#94a3b8' }}>{selectedDetail.result.toUpperCase()}</span></div>
                      <div>ELO Delta: <span style={{ color: selectedDetail.eloDelta >= 0 ? '#10b981' : '#ef4444' }}>{selectedDetail.eloDelta > 0 ? '+' : ''}{selectedDetail.eloDelta}</span></div>
                      <div>Finish Reason: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.finishReason}</span></div>
                      <div>Total Turns: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.turns}</span></div>
                      <div>Duration: <span style={{ color: 'var(--text-primary)' }}>{formatDuration(selectedDetail.duration)}</span></div>
                      <div>Started: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.startedAt ? new Date(selectedDetail.startedAt).toLocaleString() : '-'}</span></div>
                      <div>Ended: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.endedAt ? new Date(selectedDetail.endedAt).toLocaleString() : '-'}</span></div>
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: '12px' }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, marginBottom: '8px' }}>Head to Head</div>
                  {selectedDetail ? (
                    <div style={{ display: 'grid', gap: '6px', color: 'var(--text-muted)', fontSize: '0.86rem' }}>
                      <div>Total Matches: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.h2hCount}</span></div>
                      <div>W-L-D: <span style={{ color: 'var(--text-primary)' }}>{selectedDetail.headToHead.win}-{selectedDetail.headToHead.loss}-{selectedDetail.headToHead.draw}</span></div>
                      <div>Cumulative ELO Delta: <span style={{ color: selectedDetail.headToHead.eloDelta >= 0 ? '#10b981' : '#ef4444' }}>{selectedDetail.headToHead.eloDelta > 0 ? '+' : ''}{selectedDetail.headToHead.eloDelta}</span></div>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.86rem' }}>No data.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
