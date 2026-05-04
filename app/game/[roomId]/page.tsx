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
import GameHUD from '../../../components/GameHUD';
import SkillCard from '../../../components/SkillCard';
import { useNotification } from '../../../hooks/useNotification';
import { checkWinner4, isDraw } from '../../../lib/gameLogic';
import {
  type SkillType, type PowerCell, type CurseCell, type PlayerCurse, type BoardCell,
  SKILL_META, CURSE_META,
  getRandomSkill, getRandomCurse, buildCurse,
  canUseSkill, getSkillTargets, getTimerSeconds,
  tickCurse, isOneStepFromWin, getRandomEmptyCell, safeShuffle,
} from '../../../lib/mechanics';
import useSound from 'use-sound';

import LiveChat from '../../../components/LiveChat';

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
  const [board, setBoard] = useState<BoardCell[]>(Array(25).fill(null));
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

  /* ── Mechanics state ─────────────────────────────── */
  const [skillTargetMode, setSkillTargetMode] = useState(false);
  const [activeSkillUse, setActiveSkillUse] = useState<SkillType | null>(null);
  const [skillTargetCells, setSkillTargetCells] = useState<number[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const [newSkillFlag, setNewSkillFlag] = useState(false);
  const [fumbleWarning, setFumbleWarning] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const turnSubmitLockRef = useRef(false);

  /* Sounds */
  const [playPlaceX] = useSound('/sounds/place-x.wav', { volume: 0.6 });
  const [playPlaceO] = useSound('/sounds/place-o.wav', { volume: 0.6 });
  const [playWin] = useSound('/sounds/win.wav', { volume: 0.8 });
  const [playLose] = useSound('/sounds/lose.wav', { volume: 0.8 });

  // Stable refs for sounds to use in callbacks
  const soundsRef = useRef({ playPlaceX, playPlaceO, playWin, playLose });
  useEffect(() => {
    soundsRef.current = { playPlaceX, playPlaceO, playWin, playLose };
  }, [playPlaceX, playPlaceO, playWin, playLose]);

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
        if (newRow.status !== 'ongoing' || newRow.current_turn !== meId) {
          turnSubmitLockRef.current = false;
          setIsSubmittingTurn(false);
        }

        // Turn change banners & opponent move sound
        if (newRow.status === 'ongoing' && prevTurn !== newRow.current_turn) {
          if (newRow.current_turn === meId) {
            // Opponent just moved, so play their sound
            if (newRow.player1_id === meId) soundsRef.current.playPlaceO(); // Opponent is O
            else soundsRef.current.playPlaceX(); // Opponent is X

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
  }, [roomId, meId]);

  /* ── Handle game finished (fetch ELO data) ──── */
  const handleGameFinished = useCallback(async (newRow: any) => {
    if (lastStatusRef.current === 'finished') return;
    lastStatusRef.current = 'finished';
    const isLobbyRoom = !!newRow.player1_ready && !!newRow.player2_ready;

    const outcome: ResultOutcome = newRow.winner_id
      ? (newRow.winner_id === meId ? 'win' : 'lose')
      : 'draw';

    if (outcome === 'win') soundsRef.current.playWin();
    else if (outcome === 'lose') soundsRef.current.playLose();

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

      // Opponent name
      const oppId = newRow.player1_id === meId ? newRow.player2_id : newRow.player1_id;
      const { data: oppProfile } = await supabaseClient.from('profiles').select('username').eq('id', oppId).single();
      opponentName = oppProfile?.username;

      if (!isLobbyRoom && history) {
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
      }
    } catch { /* fall through with no ELO data */ }

    // Check rank up
    if (!isLobbyRoom && outcome === 'win' && oldElo !== undefined && newElo !== undefined) {
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

  /* ── Helper: am I player1? ────────────────────── */
  const amP1 = room?.player1_id === meId;
  const mySkillKey = amP1 ? 'player1_skill' : 'player2_skill';
  const oppSkillKey = amP1 ? 'player2_skill' : 'player1_skill';
  const myCurseKey = amP1 ? 'player1_curse' : 'player2_curse';
  const oppCurseKey = amP1 ? 'player2_curse' : 'player1_curse';
  const mySkill: SkillType | null = room?.[mySkillKey] ?? null;
  const myCurse: PlayerCurse | null = room?.[myCurseKey] ? (typeof room[myCurseKey] === 'string' ? JSON.parse(room[myCurseKey]) : room[myCurseKey]) : null;
  const oppCurse: PlayerCurse | null = room?.[oppCurseKey] ? (typeof room[oppCurseKey] === 'string' ? JSON.parse(room[oppCurseKey]) : room[oppCurseKey]) : null;
  const powerCells: PowerCell[] = room?.power_cells ? (typeof room.power_cells === 'string' ? JSON.parse(room.power_cells) : room.power_cells) : [];
  const curseCells: CurseCell[] = room?.curse_cells ? (typeof room.curse_cells === 'string' ? JSON.parse(room.curse_cells) : room.curse_cells) : [];
  const turnCount: number = room?.turn_count ?? 0;
  const nextShuffleAt: number = room?.next_shuffle_at ?? 12;
  const effectiveNextShuffleAt: number = turnCount < 12 ? Math.max(nextShuffleAt, 12) : nextShuffleAt;
  const turnCurse: PlayerCurse | null = room?.current_turn === meId ? myCurse : oppCurse;

  /* ── Use Skill ───────────────────────────────────── */
  function handleUseSkill() {
    if (!room || room.current_turn !== meId || !mySkill || turnSubmitLockRef.current) return;
    const check = canUseSkill(mySkill, turnCount);
    if (!check.ok) { showToast({ type: 'error', title: 'Cannot Use Skill', message: check.reason! }); return; }
    // Enter target mode
    const targets = getSkillTargets(mySkill, board, mySymbol as 'X' | 'O', powerCells);
    if (targets.length === 0) { showToast({ type: 'warning', title: 'No Valid Targets', message: 'No cells available for this skill.' }); return; }
    setActiveSkillUse(mySkill);
    setSkillTargetCells(targets);
    setSkillTargetMode(true);
  }

  /* ── Apply Skill to target cell ──────────────────── */
  async function applySkillToCell(i: number) {
    if (!activeSkillUse || !room || room.current_turn !== meId || turnSubmitLockRef.current) return;
    turnSubmitLockRef.current = true;
    setIsSubmittingTurn(true);
    try {
      const newBoard = [...board] as BoardCell[];
      const symbol = amP1 ? 'X' : 'O';
      const update: any = { [mySkillKey]: null, last_move_at: new Date().toISOString() };

    if (activeSkillUse === 'BARRIER') {
      newBoard[i] = 'BARRIER';
      update.board_state = newBoard;
    } else if (activeSkillUse === 'OVERWRITE') {
      newBoard[i] = symbol;
      update.board_state = newBoard;
    } else if (activeSkillUse === 'BOMB') {
      newBoard[i] = null;
      update.board_state = newBoard;
    }

    // Using skill consumes your turn
    const newTurn = turnCount + 1;
    update.turn_count = newTurn;
    update.current_turn = amP1 ? room.player2_id : room.player1_id;
    if (turnCount < 12 && nextShuffleAt < 12) update.next_shuffle_at = 12;

    // Check win after OVERWRITE
    if (activeSkillUse === 'OVERWRITE') {
      const res = checkWinner4(newBoard as any);
      if (res.symbol) { update.status = 'finished'; update.winner_id = meId; }
    }

    // Shuffle check
    if (newTurn >= effectiveNextShuffleAt && !update.status) {
      const s = safeShuffle(newBoard, powerCells, curseCells);
      update.board_state = s.board;
      update.power_cells = JSON.stringify(s.power_cells);
      update.curse_cells = JSON.stringify(s.curse_cells);
      update.next_shuffle_at = effectiveNextShuffleAt + 12;
      setIsShuffling(true);
      setTimeout(() => setIsShuffling(false), 1200);
    }

    setBoard(update.board_state || newBoard);
    setSkillTargetMode(false); setActiveSkillUse(null); setSkillTargetCells([]);
    showToast({ type: 'success', title: `${SKILL_META[activeSkillUse].icon} ${SKILL_META[activeSkillUse].name} Used!`, message: SKILL_META[activeSkillUse].desc });
    await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
    } catch {
      turnSubmitLockRef.current = false;
      setIsSubmittingTurn(false);
      showToast({ type: 'error', title: 'Action Failed', message: 'Failed to submit skill move. Please try again.' });
    }
  }

  /* ── Make a move ───────────────────────────────── */
  async function makeMove(i: number) {
    if (!room || room.current_turn !== meId || turnSubmitLockRef.current) return;
    if (skillTargetMode) { applySkillToCell(i); return; }
    if (board[i] !== null) return;
    turnSubmitLockRef.current = true;
    setIsSubmittingTurn(true);
    try {
    const symbol: 'X' | 'O' = amP1 ? 'X' : 'O';
    let targetCell = i;

    // FUMBLE: randomize target (unless 1 step from winning)
    if (myCurse?.type === 'FUMBLE' && myCurse.turns_remaining > 0) {
      if (!isOneStepFromWin(board, symbol)) {
        const rnd = getRandomEmptyCell(board);
        if (rnd !== null && rnd !== i) { targetCell = rnd; setFumbleWarning(true); setTimeout(() => setFumbleWarning(false), 1500); }
      }
    }

    const newBoard = [...board] as BoardCell[];
    newBoard[targetCell] = symbol;
    setBoard(newBoard);
    if (symbol === 'X') playPlaceX(); else playPlaceO();

    // Build DB update
    const update: any = { board_state: newBoard, last_move_at: new Date().toISOString() };
    const newTurnCount = turnCount + 1;
    update.turn_count = newTurnCount;
    if (turnCount < 12 && nextShuffleAt < 12) update.next_shuffle_at = 12;

    // Power Cell check
    let newPowerCells = [...powerCells];
    const pc = newPowerCells.find(p => p.index === targetCell && !p.claimed);
    if (pc) {
      pc.claimed = true;
      update.power_cells = JSON.stringify(newPowerCells);
      if (!mySkill) {
        const skill = getRandomSkill();
        update[mySkillKey] = skill;
        setNewSkillFlag(true); setTimeout(() => setNewSkillFlag(false), 2000);
        showToast({ type: 'success', title: '✦ Power Cell Claimed!', message: `You got: ${SKILL_META[skill].icon} ${SKILL_META[skill].name}` });
      } else {
        showToast({ type: 'warning', title: 'Power Cell', message: 'You already have a skill!' });
      }
    }

    // Curse Cell check
    let newCurseCells = [...curseCells];
    const cc = newCurseCells.find(c => c.index === targetCell && !c.triggered);
    if (cc && !myCurse) {
      cc.triggered = true;
      update.curse_cells = JSON.stringify(newCurseCells);
      let curseType = getRandomCurse();
      // FUMBLE protection: don't activate if 1 step from winning
      if (curseType === 'FUMBLE' && isOneStepFromWin(newBoard, symbol)) {
        curseType = 'SLOW'; // fallback to SLOW
      }
      const curse = buildCurse(curseType);
      update[myCurseKey] = JSON.stringify(curse);
      showBanner({ type: 'error', message: `💀 CURSED! ${CURSE_META[curseType].name}: ${CURSE_META[curseType].desc}`, icon: '💀', duration: 3500 });
    }

    // Tick down my curse (if not just applied)
    if (myCurse && !cc) {
      const ticked = tickCurse(myCurse);
      update[myCurseKey] = ticked ? JSON.stringify(ticked) : null;
    }

    // Check win/draw
    const res = checkWinner4(newBoard as any);
    if (res.symbol) {
      update.status = 'finished'; update.winner_id = meId;
      await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
      return;
    }
    if (isDraw(newBoard as any)) {
      update.status = 'finished'; update.winner_id = null;
      await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
      return;
    }

    // Determine next turn
    const oppId = amP1 ? room.player2_id : room.player1_id;
    update.current_turn = oppId;

    // Shuffle check
    if (newTurnCount >= effectiveNextShuffleAt) {
      const s = safeShuffle(newBoard, update.power_cells ? JSON.parse(update.power_cells) : newPowerCells, update.curse_cells ? JSON.parse(update.curse_cells) : newCurseCells);
      update.board_state = s.board;
      update.power_cells = JSON.stringify(s.power_cells);
      update.curse_cells = JSON.stringify(s.curse_cells);
      update.next_shuffle_at = effectiveNextShuffleAt + 12;
      setIsShuffling(true);
      setTimeout(() => setIsShuffling(false), 1200);
      showToast({ type: 'info', title: '🌀 Board Shuffled!', message: 'All positions have been randomized!' });
    }

    await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
    } catch {
      turnSubmitLockRef.current = false;
      setIsSubmittingTurn(false);
      showToast({ type: 'error', title: 'Move Failed', message: 'Failed to submit move. Please try again.' });
    }
  }

  /* ── Board click dispatcher ────────────────────── */
  function handleBoardClick(i: number) {
    if (turnSubmitLockRef.current) return;
    if (skillTargetMode && skillTargetCells.includes(i)) {
      applySkillToCell(i);
    } else if (!skillTargetMode) {
      makeMove(i);
    }
  }

  /* ── Cancel skill targeting ────────────────────── */
  function cancelSkillTarget() {
    setSkillTargetMode(false); setActiveSkillUse(null); setSkillTargetCells([]);
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

  const myPlayerName =
  mySymbol === 'X'
    ? playerProfiles?.p1.username
    : mySymbol === 'O'
      ? playerProfiles?.p2.username
      : 'Player';

  return (
    <>
      <div className="animate-fade-in game-screen">
        <div className="game-shell">
          {/* Game Banner */}
          <GameBanner banner={banner} />

          <div className="game-grid">
            <aside className="game-side">
              {/* Turn Indicator */}
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '4px',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  color: isMyTurn ? '#a78bfa' : 'var(--text-muted)',
                }}
              >
                {room.status === 'ongoing'
                  ? isMyTurn ? 'Your Turn' : "Opponent's Turn"
                  : 'Game Over'}
              </div>

              {/* Player Cards */}
              <div className="game-player-stack">
                <PlayerCard username={playerProfiles?.p1.username ?? 'Player 1'} elo={playerProfiles?.p1.elo ?? 1000} symbol="X" you={room.player1_id === meId} active={room.current_turn === room.player1_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p1.avatarUrl} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>VS</div>
                <PlayerCard username={playerProfiles?.p2.username ?? 'Player 2'} elo={playerProfiles?.p2.elo ?? 1000} symbol="O" you={room.player2_id === meId} active={room.current_turn === room.player2_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p2.avatarUrl} />
              </div>

              {/* Game HUD - Turn counter & Shuffle countdown */}
              <GameHUD turnCount={turnCount} nextShuffleAt={effectiveNextShuffleAt} activeCurse={isMyTurn ? myCurse : null} />

              {/* Timer */}
              <div style={{ marginBottom: '2px' }}>
                <Timer
                  key={turnTimerKey}
                  seconds={getTimerSeconds(turnCurse)}
                  startedAt={room.last_move_at}
                  onExpire={onExpire}
                  onWarning={onTimerWarning}
                  run={room.status === 'ongoing'}
                />
              </div>

              {fumbleWarning && (
                <div className="animate-fumble-shake" style={{ textAlign: 'center', color: '#ef4444', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.9rem' }}>
                  FUMBLE! Your move was placed randomly.
                </div>
              )}

              {skillTargetMode && (
                <div style={{ textAlign: 'center' }}>
                  <span style={{ color: '#a78bfa', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '0.86rem' }}>
                    Select target for {SKILL_META[activeSkillUse!].icon} {SKILL_META[activeSkillUse!].name}
                  </span>
                  <button className="btn btn-ghost" onClick={cancelSkillTarget} style={{ marginLeft: '8px', padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                </div>
              )}

              {room.status === 'ongoing' && (
                <SkillCard
                  skill={mySkill}
                  onUseSkill={handleUseSkill}
                  disabled={!isMyTurn || skillTargetMode || isSubmittingTurn}
                  isNew={newSkillFlag}
                />
              )}

              <div className="game-bottom-actions" style={{ textAlign: 'center' }}>
                {room.status === 'ongoing' ? (
                  !showSurrenderConfirm ? (
                    <button
                      className="btn btn-danger"
                      onClick={() => setShowSurrenderConfirm(true)}
                      style={{ minWidth: '180px' }}
                    >
                      Surrender
                    </button>
                  ) : (
                    <div
                      className="card"
                      style={{
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '16px 20px',
                        borderColor: 'rgba(239,68,68,0.3)',
                        boxShadow: '0 0 24px rgba(239,68,68,0.1)',
                      }}
                    >
                      <span style={{
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        color: '#ef4444',
                      }}>
                        Surrender this match?
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                        {room?.player1_ready && room?.player2_ready ? 'This match will not affect ELO.' : 'You will lose ELO points.'}
                      </span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          className="btn btn-danger"
                          onClick={async () => {
                            if (!room || !meId) return;
                            const winner = room.player1_id === meId ? room.player2_id : room.player1_id;
                            await supabaseClient.from('game_rooms').update({ status: 'finished', winner_id: winner }).eq('id', roomId);
                            setShowSurrenderConfirm(false);
                          }}
                          style={{ minWidth: '112px' }}
                        >
                          Yes
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setShowSurrenderConfirm(false)}
                          style={{ minWidth: '86px' }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
                    Return to Dashboard
                  </button>
                )}
              </div>
            </aside>

            {/* Board */}
            <section className="game-board-wrap">
              <div className={fumbleWarning ? 'animate-fumble-shake' : ''} style={{ display: 'flex', justifyContent: 'center' }}>
                <Board
                  board={board as any}
                  onMove={handleBoardClick}
                  disabled={room.status !== 'ongoing' || !isMyTurn || isSubmittingTurn}
                  winningCells={[]}
                  powerCells={powerCells}
                  curseCells={curseCells}
                  blindedSymbol={myCurse?.type === 'BLIND' && myCurse.turns_remaining > 0 ? (amP1 ? 'O' : 'X') : null}
                  mySymbol={mySymbol === '?' ? undefined : mySymbol}
                  skillTargetCells={skillTargetMode ? skillTargetCells : []}
                  isShuffling={isShuffling}
                />
              </div>
            </section>
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
      <LiveChat roomId={roomId} meId={meId} playerName={myPlayerName} />
    </>
  );
}

