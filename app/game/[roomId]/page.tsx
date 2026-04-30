"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabaseClient } from '../../../lib/supabase';
import Board from '../../../components/Board';
import Timer from '../../../components/Timer';
import PlayerCard from '../../../components/PlayerCard';
import ResultModal from '../../../components/ResultModal';
import type { ResultOutcome } from '../../../components/ResultModal';
import GameBanner from '../../../components/notifications/GameBanner';
import ConnectionStatus from '../../../components/notifications/ConnectionStatus';
import RankUpOverlay from '../../../components/notifications/RankUpOverlay';
import { useNotification } from '../../../hooks/useNotification';
import { checkWinner4, isDraw } from '../../../lib/gameLogic';

/* Tier helper — matches TierBadge logic */
function getTierName(elo: number) {
  if (elo >= 1400) return 'Diamond';
  if (elo >= 1200) return 'Platinum';
  if (elo >= 1000) return 'Gold';
  if (elo >= 800) return 'Silver';
  return 'Bronze';
}

export default function GameRoom() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const router = useRouter();
  const { showToast, showBanner, banner, connectionStatus, setConnectionStatus } = useNotification();

  // Stable refs for notification functions to avoid re-render loops
  const showToastRef = useRef(showToast);
  const showBannerRef = useRef(showBanner);
  const setConnectionStatusRef = useRef(setConnectionStatus);
  useEffect(() => { showToastRef.current = showToast; }, [showToast]);
  useEffect(() => { showBannerRef.current = showBanner; }, [showBanner]);
  useEffect(() => { setConnectionStatusRef.current = setConnectionStatus; }, [setConnectionStatus]);

  const [room, setRoom] = useState<any>(null);
  const [board, setBoard] = useState<("X" | "O" | null)[]>(Array(25).fill(null));
  const [meId, setMeId] = useState<string | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | '?'>('?');
  const [turnTimerKey, setTurnTimerKey] = useState(0);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<{ p1: { username: string; elo: number; avatarUrl: string | null }; p2: { username: string; elo: number; avatarUrl: string | null } } | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const timerWarningShown = useRef(false);

  /* Result state */
  const [resultData, setResultData] = useState<{
    outcome: ResultOutcome;
    eloChange?: number;
    newElo?: number;
    opponentName?: string;
  } | null>(null);

  /* Rank up state */
  const [rankUp, setRankUp] = useState<{
    oldTier: string;
    newTier: string;
    newElo: number;
  } | null>(null);
  const [showResult, setShowResult] = useState(false);

  /* ── Init ──────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      const s = await supabaseClient.auth.getSession();
      if (!s.data.session) return router.push('/');
      const uid = s.data.session.user.id;
      setMeId(uid);
      const { data } = await supabaseClient.from('game_rooms').select('*').eq('id', roomId).single();
      if (!data) return router.push('/dashboard');
      setRoom(data);
      const bs = typeof data.board_state === 'string' ? JSON.parse(data.board_state) : data.board_state;
      setBoard(bs);
      setMySymbol(data.player1_id === uid ? 'X' : 'O');

      // Fetch player profiles for display
      const { data: p1Profile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', data.player1_id).single();
      const { data: p2Profile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', data.player2_id).single();
      setPlayerProfiles({
        p1: { username: p1Profile?.username ?? 'Player 1', elo: p1Profile?.elo_rating ?? 1000, avatarUrl: p1Profile?.avatar_url ?? null },
        p2: { username: p2Profile?.username ?? 'Player 2', elo: p2Profile?.elo_rating ?? 1000, avatarUrl: p2Profile?.avatar_url ?? null },
      });

      // Show starting banner
      const sym = data.player1_id === uid ? 'X' : 'O';
      showBannerRef.current({ type: 'info', message: `Game Started! You play as ${sym}`, icon: '🎮', duration: 2500 });
    })();
  }, [roomId, router]);

  /* ── Realtime channel ──────────────────────────── */
  useEffect(() => {
    if (!roomId || !meId) return;

    const channel = supabaseClient.channel(`game:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const newRow = payload.new || payload.record;
        if (!newRow) return;

        const prevTurn = room?.current_turn;
        setRoom(newRow);
        if (newRow.board_state) {
          const bs = typeof newRow.board_state === 'string' ? JSON.parse(newRow.board_state) : newRow.board_state;
          setBoard(bs);
        }
        setTurnTimerKey((k) => k + 1);
        timerWarningShown.current = false;

        // Turn change banners
        if (newRow.status === 'ongoing' && prevTurn !== newRow.current_turn) {
          if (newRow.current_turn === meId) {
            showBannerRef.current({ type: 'info', message: "Your Turn!", icon: '⚔️', pulse: true, duration: 2500 });
          } else {
            showBannerRef.current({ type: 'info', message: "Opponent's Turn", icon: '⏳', duration: 2000 });
          }
        }

        // Game finished
        if (newRow.status === 'finished') {
          handleGameFinished(newRow);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionStatusRef.current('connected');
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setConnectionStatusRef.current('disconnected');
      });

    return () => { supabaseClient.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, meId]);

  /* ── Handle game finished (fetch ELO data) ──── */
  const handleGameFinished = useCallback(async (newRow: any) => {
    if (lastStatusRef.current === 'finished') return;
    lastStatusRef.current = 'finished';

    const outcome: ResultOutcome = newRow.winner_id
      ? (newRow.winner_id === meId ? 'win' : 'lose')
      : 'draw';

    // Finalize (host only)
    if (meId && newRow.player1_id === meId) {
      try {
        await supabaseClient.rpc('finalize_game', { input_room_id: newRow.id });
      } catch { /* ignore */ }
    }

    // Fetch ELO changes (Option A)
    let eloChange: number | undefined;
    let newElo: number | undefined;
    let opponentName: string | undefined;
    let oldElo: number | undefined;

    try {
      // Small delay to let finalize_game complete
      await new Promise((r) => setTimeout(r, 800));
      const { data: history } = await supabaseClient
        .from('match_history')
        .select('*')
        .eq('room_id', newRow.id)
        .maybeSingle();

      if (history) {
        const isWinner = history.winner_id === meId;
        if (outcome === 'draw') {
          eloChange = 0;
          const { data: profile } = await supabaseClient.from('profiles').select('elo_rating').eq('id', meId!).single();
          newElo = profile?.elo_rating;
        } else if (isWinner) {
          eloChange = (history.winner_elo_after ?? 0) - (history.winner_elo_before ?? 0);
          newElo = history.winner_elo_after;
          oldElo = history.winner_elo_before;
        } else {
          eloChange = (history.loser_elo_after ?? 0) - (history.loser_elo_before ?? 0);
          newElo = history.loser_elo_after;
          oldElo = history.loser_elo_before;
        }
        // Opponent name
        const oppId = newRow.player1_id === meId ? newRow.player2_id : newRow.player1_id;
        const { data: oppProfile } = await supabaseClient.from('profiles').select('username').eq('id', oppId).single();
        opponentName = oppProfile?.username;
      }
    } catch { /* fall through with no ELO data */ }

    // Check rank up
    if (outcome === 'win' && oldElo !== undefined && newElo !== undefined) {
      const oldTier = getTierName(oldElo);
      const newTier = getTierName(newElo);
      if (oldTier !== newTier) {
        setRankUp({ oldTier, newTier, newElo });
        setResultData({ outcome, eloChange, newElo, opponentName });
        return; // RankUp overlay shows first, then result
      }
    }

    setResultData({ outcome, eloChange, newElo, opponentName });
    setShowResult(true);
  }, [meId]);

  /* ── Make a move ───────────────────────────────── */
  async function makeMove(i: number) {
    if (!room || room.current_turn !== meId) return;
    if (board[i] !== null) return;
    const symbol = room.player1_id === meId ? 'X' : 'O';
    const newBoard = [...board];
    newBoard[i] = symbol;
    setBoard(newBoard);

    const res = checkWinner4(newBoard as any);
    if (res.symbol) {
      await supabaseClient.from('game_rooms').update({ board_state: newBoard, status: 'finished', winner_id: meId }).eq('id', roomId);
      return;
    }
    if (isDraw(newBoard as any)) {
      await supabaseClient.from('game_rooms').update({ board_state: newBoard, status: 'finished', winner_id: null }).eq('id', roomId);
      return;
    }
    await supabaseClient.from('game_rooms').update({
      board_state: newBoard,
      current_turn: room.player1_id === meId ? room.player2_id : room.player1_id,
      last_move_at: new Date().toISOString(),
    }).eq('id', roomId);
  }

  /* ── Timer expire ──────────────────────────────── */
  const onExpire = useCallback(async () => {
    if (!room) return;
    showToastRef.current({ type: 'error', title: "Time's Up!", message: 'You lost this round.' });
    const loser = room.current_turn;
    const winner = loser === room.player1_id ? room.player2_id : room.player1_id;
    await supabaseClient.from('game_rooms').update({ status: 'finished', winner_id: winner }).eq('id', roomId);
  }, [room, roomId]);

  /* ── Timer warning callback ────────────────────── */
  const onTimerWarning = useCallback((secondsLeft: number) => {
    if (!timerWarningShown.current && secondsLeft <= 5) {
      timerWarningShown.current = true;
      showToastRef.current({ type: 'warning', title: '⚠ Time Running Out!', message: `Only ${secondsLeft} seconds left!`, duration: 3000 });
    }
  }, []);

  /* ── Rank up complete → show result ─────────────── */
  function onRankUpComplete() {
    setRankUp(null);
    setShowResult(true);
  }

  /* ── Loading ───────────────────────────────────── */
  if (!room) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <div className="animate-spin-slow" style={{ width: 40, height: 40, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%', margin: '0 auto 16px' }} />
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)' }}>Loading game...</span>
        </div>
      </div>
    );
  }

  const isMyTurn = room.current_turn === meId;

  return (
    <>
      <div className="animate-fade-in" style={{ padding: '24px', paddingTop: '32px', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', position: 'relative' }}>

          {/* Game Banner */}
          <GameBanner banner={banner} />

          {/* Turn Indicator */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: '20px',
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '1.1rem',
              color: isMyTurn ? '#a78bfa' : 'var(--text-muted)',
            }}
          >
            {room.status === 'ongoing'
              ? isMyTurn ? '⚔️ Your Turn' : "⏳ Opponent's Turn"
              : '🏁 Game Over'}
          </div>

          {/* Player Cards */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <PlayerCard username={playerProfiles?.p1.username ?? 'Player 1'} elo={playerProfiles?.p1.elo ?? 1000} symbol="X" you={room.player1_id === meId} active={room.current_turn === room.player1_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p1.avatarUrl} />
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--text-muted)' }}>VS</div>
            <PlayerCard username={playerProfiles?.p2.username ?? 'Player 2'} elo={playerProfiles?.p2.elo ?? 1000} symbol="O" you={room.player2_id === meId} active={room.current_turn === room.player2_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p2.avatarUrl} />
          </div>

          {/* Timer */}
          <div style={{ maxWidth: '400px', margin: '0 auto 20px' }}>
            <Timer key={turnTimerKey} seconds={30} onExpire={onExpire} onWarning={onTimerWarning} run={room.status === 'ongoing'} />
          </div>

          {/* Board */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <Board board={board as any} onMove={makeMove} disabled={room.status !== 'ongoing'} winningCells={[]} />
          </div>

          {/* Surrender / Dashboard button */}
          <div style={{ textAlign: 'center' }}>
            {room.status === 'ongoing' ? (
              !showSurrenderConfirm ? (
                <button
                  className="btn btn-danger"
                  onClick={() => setShowSurrenderConfirm(true)}
                  style={{ minWidth: '180px' }}
                >
                  🏳️ Surrender
                </button>
              ) : (
                <div
                  className="card"
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '20px 28px',
                    borderColor: 'rgba(239,68,68,0.3)',
                    boxShadow: '0 0 30px rgba(239,68,68,0.1)',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: '1rem',
                    color: '#ef4444',
                  }}>
                    ⚠ Surrender this match?
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    You will lose ELO points.
                  </span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      className="btn btn-danger"
                      onClick={async () => {
                        if (!room || !meId) return;
                        const winner = room.player1_id === meId ? room.player2_id : room.player1_id;
                        await supabaseClient.from('game_rooms').update({ status: 'finished', winner_id: winner }).eq('id', roomId);
                        setShowSurrenderConfirm(false);
                      }}
                      style={{ minWidth: '120px' }}
                    >
                      Yes, Surrender
                    </button>
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowSurrenderConfirm(false)}
                      style={{ minWidth: '90px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
                ← Return to Dashboard
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connection indicator */}
      <ConnectionStatus status={connectionStatus} />

      {/* Rank Up Overlay (shows before result) */}
      <RankUpOverlay
        open={!!rankUp}
        oldTier={rankUp?.oldTier ?? ''}
        newTier={rankUp?.newTier ?? ''}
        newElo={rankUp?.newElo ?? 0}
        onComplete={onRankUpComplete}
      />

      {/* Result Modal */}
      <ResultModal
        open={showResult && !!resultData}
        outcome={resultData?.outcome}
        eloChange={resultData?.eloChange}
        newElo={resultData?.newElo}
        opponentName={resultData?.opponentName}
        onPlayAgain={() => router.push('/matchmaking')}
        onDashboard={() => router.push('/dashboard')}
      />
    </>
  );
}
