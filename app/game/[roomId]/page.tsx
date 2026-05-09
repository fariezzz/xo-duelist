"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { supabaseClient } from '../../../lib/supabase';
import Board from '../../../components/Board';
import Timer from '../../../components/Timer';
import PlayerCard from '../../../components/PlayerCard';
import ResultModal from '../../../components/ResultModal';
import type { ResultOutcome } from '../../../components/ResultModal';
import GameBanner from '../../../components/notifications/GameBanner';
import ConnectionStatus from '../../../components/notifications/ConnectionStatus';
import MatchFoundModal from '../../../components/notifications/MatchFoundModal';
import RankUpOverlay from '../../../components/notifications/RankUpOverlay';
import GameHUD from '../../../components/GameHUD';
import SkillCard from '../../../components/SkillCard';
import { useNotification } from '../../../hooks/useNotification';
import { useScopedSessionLock } from '../../../hooks/useScopedSessionLock';
import { checkWinner4, isDraw } from '../../../lib/gameLogic';
import {
  type SkillType, type PowerCell, type CurseCell, type PlayerCurse, type BoardCell,
  SKILL_META, CURSE_META,
  getRandomSkill, getRandomCurse, buildCurse,
  canUseSkill, getSkillTargets, getTimerSeconds,
  tickCurse, isOneStepFromWin, getRandomEmptyCell, safeShuffle,
} from '../../../lib/mechanics';
import useSound from 'use-sound';
import { computeAIMove, getRandomPersona, decideAISkill } from '../../../lib/aiPlayer';

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
  const searchParams = useSearchParams();
  const aiOrigin = searchParams.get('origin'); // 'dashboard' or 'matchmaking'
  const { showToast, showBanner, banner, connectionStatus, setConnectionStatus } = useNotification();
  const lock = useScopedSessionLock('arena');

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
  const [aiMatchFound, setAiMatchFound] = useState<{
    gameId: string;
    myName: string;
    myElo: number;
    myAvatarUrl: string | null;
    oppName: string;
    oppElo: number;
  } | null>(null);
  const [playMatchFound] = useSound('/sounds/match-found.mp3', { volume: 0.7 });
  const lastStatusRef = useRef<string | null>(null);
  const timerWarningShown = useRef(false);
  const lastShuffleAtRef = useRef<number>(12);

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
  const [isLobbyGameSession, setIsLobbyGameSession] = useState(false);

  /* ── Mechanics state ─────────────────────────────── */
  const [skillTargetMode, setSkillTargetMode] = useState(false);
  const [activeSkillUse, setActiveSkillUse] = useState<SkillType | null>(null);
  const [skillTargetCells, setSkillTargetCells] = useState<number[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const [newSkillFlag, setNewSkillFlag] = useState(false);
  const [fumbleWarning, setFumbleWarning] = useState(false);
  const [isSubmittingTurn, setIsSubmittingTurn] = useState(false);
  const turnSubmitLockRef = useRef(false);
  const aiMoveLockRef = useRef(false);
  const [aiThinking, setAiThinking] = useState(false);

  /* Sounds */
  const [playPlaceX] = useSound('/sounds/place-x.mp3', { volume: 0.6 });
  const [playPlaceO] = useSound('/sounds/place-o.mp3', { volume: 0.6 });
  const [playWin] = useSound('/sounds/win.mp3', { volume: 0.8 });
  const [playLose] = useSound('/sounds/lose.mp3', { volume: 0.8 });
  const [playDraw] = useSound('/sounds/draw.mp3', { volume: 0.6 });

  const [playSkillBarrier] = useSound('/sounds/skill-barrier.mp3', { volume: 0.7 });
  const [playSkillOverwrite] = useSound('/sounds/skill-overwrite.mp3', { volume: 0.7 });
  const [playSkillBomb] = useSound('/sounds/skill-bomb.mp3', { volume: 0.75 });

  const [playCurseBlind] = useSound('/sounds/curse-blind.mp3', { volume: 0.65 });
  const [playCurseSlow] = useSound('/sounds/curse-slow.mp3', { volume: 0.65 });
  const [playCurseFumble] = useSound('/sounds/curse-fumble.mp3', { volume: 0.65 });

  const [playPowerCell] = useSound('/sounds/power-cell.mp3', { volume: 0.65 });
  const [playShuffle] = useSound('/sounds/shuffle.mp3', { volume: 0.7 });
  const [playFumble] = useSound('/sounds/fumble.mp3', { volume: 0.65 });

  // Stable refs for sounds to use in callbacks
  const soundsRef = useRef({
    playPlaceX, playPlaceO, playWin, playLose, playDraw,
    playSkillBarrier, playSkillOverwrite, playSkillBomb,
    playCurseBlind, playCurseSlow, playCurseFumble,
    playPowerCell, playShuffle, playFumble
  });

  useEffect(() => {
    soundsRef.current = {
      playPlaceX, playPlaceO, playWin, playLose, playDraw,
      playSkillBarrier, playSkillOverwrite, playSkillBomb,
      playCurseBlind, playCurseSlow, playCurseFumble,
      playPowerCell, playShuffle, playFumble
    };
  }, [
    playPlaceX, playPlaceO, playWin, playLose, playDraw,
    playSkillBarrier, playSkillOverwrite, playSkillBomb,
    playCurseBlind, playCurseSlow, playCurseFumble,
    playPowerCell, playShuffle, playFumble
  ]);

  const playSkillSound = useCallback((skill: string) => {
    if (skill === 'BARRIER') soundsRef.current.playSkillBarrier();
    else if (skill === 'OVERWRITE') soundsRef.current.playSkillOverwrite();
    else if (skill === 'BOMB') soundsRef.current.playSkillBomb();
  }, []);

  const playCurseSound = useCallback((curse: string) => {
    if (curse === 'BLIND') soundsRef.current.playCurseBlind();
    else if (curse === 'SLOW') soundsRef.current.playCurseSlow();
    else if (curse === 'FUMBLE') soundsRef.current.playCurseFumble();
  }, []);

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
      if (data.player1_ready && data.player2_ready) {
        setIsLobbyGameSession(true);
      }
      const bs = typeof data.board_state === 'string' ? JSON.parse(data.board_state) : data.board_state;
      setBoard(bs);
      setMySymbol(data.player1_id === uid ? 'X' : 'O');
      lastShuffleAtRef.current = data.next_shuffle_at ?? 12;

      // Fetch player profiles for display
      const { data: p1Profile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', data.player1_id).single();
      if (data.is_vs_ai) {
        // AI opponent: display with provided persona name or fallback, and player's ELO
        const persona = searchParams.get('persona') || getRandomPersona();
        setPlayerProfiles({
          p1: { username: p1Profile?.username ?? 'Player 1', elo: p1Profile?.elo_rating ?? 1000, avatarUrl: p1Profile?.avatar_url ?? null },
          p2: { username: persona, elo: p1Profile?.elo_rating ?? 1000, avatarUrl: null },
        });
      } else {
        const { data: p2Profile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', data.player2_id).single();
        setPlayerProfiles({
          p1: { username: p1Profile?.username ?? 'Player 1', elo: p1Profile?.elo_rating ?? 1000, avatarUrl: p1Profile?.avatar_url ?? null },
          p2: { username: p2Profile?.username ?? 'Player 2', elo: p2Profile?.elo_rating ?? 1000, avatarUrl: p2Profile?.avatar_url ?? null },
        });
      }

      // Show starting banner
      const sym = data.player1_id === uid ? 'X' : 'O';
      const aiLabel = data.is_vs_ai ? ' (VS AI)' : '';
      showBannerRef.current({ type: 'info', message: `Game Started! You play as ${sym}${aiLabel}`, icon: '🎮', duration: 2500 });
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
        if (newRow.player1_ready && newRow.player2_ready) {
          setIsLobbyGameSession(true);
        }
        if (newRow.board_state) {
          const bs = typeof newRow.board_state === 'string' ? JSON.parse(newRow.board_state) : newRow.board_state;
          setBoard(bs);
        }
        
        if (newRow.next_shuffle_at > lastShuffleAtRef.current) {
          lastShuffleAtRef.current = newRow.next_shuffle_at;
          setIsShuffling(true);
          soundsRef.current.playShuffle();
          setTimeout(() => setIsShuffling(false), 1200);
          showToastRef.current({ type: 'info', title: '🌀 Board Shuffled!', message: 'All positions have been randomized!' });
        }

        setTurnTimerKey((k) => k + 1);
        timerWarningShown.current = false;
        if (newRow.status !== 'ongoing' || newRow.current_turn !== meId) {
          turnSubmitLockRef.current = false;
          setIsSubmittingTurn(false);
          setSkillTargetMode(false);
          setActiveSkillUse(null);
          setSkillTargetCells([]);
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

  /* ── AI Auto-Move ────────────────────────────── */
  useEffect(() => {
    if (!room || !meId) return;
    if (!room.is_vs_ai) return;
    if (room.status !== 'ongoing') return;
    if (room.current_turn === meId) return;
    if (aiMoveLockRef.current) return;

    aiMoveLockRef.current = true;
    setAiThinking(true);

    const delay = 700 + Math.random() * 900; // 700-1600ms
    const timer = setTimeout(async () => {
      try {
        const { data: fr } = await supabaseClient
          .from('game_rooms')
          .select('*')
          .eq('id', roomId)
          .single();
        if (!fr || fr.status !== 'ongoing' || fr.current_turn === meId) return;

        const currentBoard: BoardCell[] = typeof fr.board_state === 'string'
          ? JSON.parse(fr.board_state) : fr.board_state;

        // AI is always the non-human player
        const aiIsP1 = fr.player1_id !== meId;
        const aiSymbol: 'X' | 'O' = aiIsP1 ? 'X' : 'O';
        const playerSymbol: 'X' | 'O' = aiIsP1 ? 'O' : 'X';
        const aiSkillKey = aiIsP1 ? 'player1_skill' : 'player2_skill';
        const aiCurseKey = aiIsP1 ? 'player1_curse' : 'player2_curse';
        const aiSkill: SkillType | null = fr[aiSkillKey] ?? null;
        const aiCurseRaw = fr[aiCurseKey];
        const aiCurse: PlayerCurse | null = aiCurseRaw
          ? (typeof aiCurseRaw === 'string' ? JSON.parse(aiCurseRaw) : aiCurseRaw)
          : null;

        const pc: PowerCell[] = typeof fr.power_cells === 'string'
          ? JSON.parse(fr.power_cells) : (fr.power_cells || []);
        const cc: CurseCell[] = typeof fr.curse_cells === 'string'
          ? JSON.parse(fr.curse_cells) : (fr.curse_cells || []);
        const tc = fr.turn_count ?? 0;
        const nsa = fr.next_shuffle_at ?? 12;
        const effNsa = tc < 12 ? Math.max(nsa, 12) : nsa;

        const update: any = {
          last_move_at: new Date().toISOString(),
          current_turn: meId,
        };
        const newTc = tc + 1;
        update.turn_count = newTc;
        if (tc < 12 && nsa < 12) update.next_shuffle_at = 12;

        // ── Try skill first ──
        const skillDecision = decideAISkill(aiSkill, currentBoard, aiSymbol, pc, tc);

        if (skillDecision.useSkill) {
          const { skill: usedSkill, target: skillTarget } = skillDecision;
          const newBoard = [...currentBoard] as BoardCell[];

          if (usedSkill === 'BARRIER') {
            newBoard[skillTarget] = 'BARRIER';
          } else if (usedSkill === 'OVERWRITE') {
            newBoard[skillTarget] = aiSymbol;
          } else if (usedSkill === 'BOMB') {
            newBoard[skillTarget] = null;
          }

          update.board_state = newBoard;
          update[aiSkillKey] = null; // consume skill

          // Win check after OVERWRITE
          if (usedSkill === 'OVERWRITE') {
            const res = checkWinner4(newBoard as any);
            if (res.symbol === aiSymbol) {
              update.status = 'finished';
              update.winner_id = fr.current_turn; // AI's id
              update.finish_reason = 'skill_overwrite_win';
              update.ended_at = update.last_move_at;
            }
          }

          // Shuffle check
          if (!update.status && newTc >= effNsa) {
            const s = safeShuffle(newBoard, pc, cc);
            update.board_state = s.board;
            update.power_cells = JSON.stringify(s.power_cells);
            update.curse_cells = JSON.stringify(s.curse_cells);
            update.next_shuffle_at = effNsa + 12;
          }

          // Tick AI curse
          if (aiCurse) {
            const ticked = tickCurse(aiCurse);
            update[aiCurseKey] = ticked ? JSON.stringify(ticked) : null;
          }

          await supabaseClient.from('game_rooms').update(update).eq('id', roomId);

          // Show banner to human
          const meta = SKILL_META[usedSkill];
          showBannerRef.current({
            type: 'warning',
            message: `🤖 AI used ${meta.icon} ${meta.name}!`,
            icon: '🤖',
            duration: 3000,
          });
          return;
        }

        // ── Normal move ──
        let targetCell = computeAIMove(currentBoard as any, aiSymbol);
        if (targetCell === null) return;

        // FUMBLE: randomize target (unless AI is 1 step from winning)
        if (aiCurse?.type === 'FUMBLE' && aiCurse.turns_remaining > 0) {
          if (!isOneStepFromWin(currentBoard, aiSymbol)) {
            const rnd = getRandomEmptyCell(currentBoard);
            if (rnd !== null && rnd !== targetCell) targetCell = rnd;
          }
        }

        const newBoard = [...currentBoard] as BoardCell[];
        newBoard[targetCell] = aiSymbol;
        update.board_state = newBoard;

        // Power Cell check
        const newPc = [...pc];
        const hitPc = newPc.find(p => p.index === targetCell && !p.claimed);
        if (hitPc) {
          hitPc.claimed = true;
          update.power_cells = JSON.stringify(newPc);
          if (!aiSkill) {
            const skill = getRandomSkill();
            update[aiSkillKey] = skill;
            // Show power cell banner to human
            showBannerRef.current({
              type: 'info',
              message: `🤖 AI claimed a Power Cell! (${SKILL_META[skill].icon} ${SKILL_META[skill].name})`,
              icon: '✦',
              duration: 2500,
            });
          }
        }

        // Curse Cell check
        const newCc = [...cc];
        const hitCc = newCc.find(c => c.index === targetCell && !c.triggered);
        if (hitCc && !aiCurse) {
          hitCc.triggered = true;
          update.curse_cells = JSON.stringify(newCc);
          let curseType = getRandomCurse();
          if (curseType === 'FUMBLE' && isOneStepFromWin(newBoard, aiSymbol)) {
            curseType = 'SLOW';
          }
          const curse = buildCurse(curseType);
          update[aiCurseKey] = JSON.stringify(curse);
          showBannerRef.current({
            type: 'info',
            message: `🤖 AI got cursed! ${CURSE_META[curseType].name}`,
            icon: '💀',
            duration: 2500,
          });
        }

        // Tick AI curse (if not just applied)
        if (aiCurse && !hitCc) {
          const ticked = tickCurse(aiCurse);
          update[aiCurseKey] = ticked ? JSON.stringify(ticked) : null;
        }

        // Check win/draw
        const res = checkWinner4(newBoard as any);
        if (res.symbol === aiSymbol) {
          update.status = 'finished';
          update.winner_id = fr.current_turn; // AI's id
          update.finish_reason = 'line_win';
          update.ended_at = update.last_move_at;
        } else if (isDraw(newBoard as any)) {
          update.status = 'finished';
          update.winner_id = null;
          update.finish_reason = 'draw_board_full';
          update.ended_at = update.last_move_at;
        }

        // Shuffle check
        if (!update.status && newTc >= effNsa) {
          const finalBoard = update.board_state || newBoard;
          const finalPc = update.power_cells ? JSON.parse(update.power_cells) : newPc;
          const finalCc = update.curse_cells ? JSON.parse(update.curse_cells) : newCc;
          const s = safeShuffle(finalBoard, finalPc, finalCc);
          update.board_state = s.board;
          update.power_cells = JSON.stringify(s.power_cells);
          update.curse_cells = JSON.stringify(s.curse_cells);
          update.next_shuffle_at = effNsa + 12;
        }

        await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
      } catch (err) {
        console.error('AI move failed:', err);
      } finally {
        aiMoveLockRef.current = false;
        setAiThinking(false);
      }
    }, delay);

    return () => {
      clearTimeout(timer);
      aiMoveLockRef.current = false;
      setAiThinking(false);
    };
  }, [room?.current_turn, room?.status, room?.is_vs_ai, meId, roomId]);

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
    else if (outcome === 'draw') soundsRef.current.playDraw();

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
      if (newRow.is_vs_ai) {
        opponentName = 'AI Duelist';
      } else {
        const oppId = newRow.player1_id === meId ? newRow.player2_id : newRow.player1_id;
        const { data: oppProfile } = await supabaseClient.from('profiles').select('username').eq('id', oppId).single();
        opponentName = oppProfile?.username;
      }

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
  const myCurseKey = amP1 ? 'player1_curse' : 'player2_curse';
  const oppCurseKey = amP1 ? 'player2_curse' : 'player1_curse';
  const myTimeoutKey = amP1 ? 'player1_timeouts' : 'player2_timeouts';
  const oppTimeoutKey = amP1 ? 'player2_timeouts' : 'player1_timeouts';
  const mySkill: SkillType | null = room?.[mySkillKey] ?? null;
  const myCurse: PlayerCurse | null = room?.[myCurseKey] ? (typeof room[myCurseKey] === 'string' ? JSON.parse(room[myCurseKey]) : room[myCurseKey]) : null;
  const oppCurse: PlayerCurse | null = room?.[oppCurseKey] ? (typeof room[oppCurseKey] === 'string' ? JSON.parse(room[oppCurseKey]) : room[oppCurseKey]) : null;
  const myTimeouts: number = Number(room?.[myTimeoutKey] ?? 0);
  const oppTimeouts: number = Number(room?.[oppTimeoutKey] ?? 0);
  const powerCells: PowerCell[] = room?.power_cells ? (typeof room.power_cells === 'string' ? JSON.parse(room.power_cells) : room.power_cells) : [];
  const curseCells: CurseCell[] = room?.curse_cells ? (typeof room.curse_cells === 'string' ? JSON.parse(room.curse_cells) : room.curse_cells) : [];
  const turnCount: number = room?.turn_count ?? 0;
  const nextShuffleAt: number = room?.next_shuffle_at ?? 12;
  const effectiveNextShuffleAt: number = turnCount < 12 ? Math.max(nextShuffleAt, 12) : nextShuffleAt;
  const turnCurse: PlayerCurse | null = room?.current_turn === meId ? myCurse : oppCurse;

  /* ── Use Skill ───────────────────────────────────── */
  function handleUseSkill() {
    if (lock.status !== 'active' || !room || room.current_turn !== meId || !mySkill || turnSubmitLockRef.current) return;
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
    if (lock.status !== 'active' || !activeSkillUse || !room || room.current_turn !== meId || turnSubmitLockRef.current) return;
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
        if (res.symbol) {
          update.status = 'finished';
          update.winner_id = meId;
          update.finish_reason = 'skill_overwrite_win';
          update.ended_at = update.last_move_at;
        }
      }

      // Shuffle check
      if (newTurn >= effectiveNextShuffleAt && !update.status) {
        const s = safeShuffle(newBoard, powerCells, curseCells);
        update.board_state = s.board;
        update.power_cells = JSON.stringify(s.power_cells);
        update.curse_cells = JSON.stringify(s.curse_cells);
        update.next_shuffle_at = effectiveNextShuffleAt + 12;
        lastShuffleAtRef.current = update.next_shuffle_at;
        setIsShuffling(true);
        setTimeout(() => setIsShuffling(false), 1200);
      }

      setBoard(update.board_state || newBoard);
      setSkillTargetMode(false); setActiveSkillUse(null); setSkillTargetCells([]);
      playSkillSound(activeSkillUse);
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
    if (lock.status !== 'active' || !room || room.current_turn !== meId || turnSubmitLockRef.current) return;
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
          if (rnd !== null && rnd !== i) {
            targetCell = rnd;
            setFumbleWarning(true);
            soundsRef.current.playFumble();
            setTimeout(() => setFumbleWarning(false), 1500);
          }
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
      const newPowerCells = [...powerCells];
      const pc = newPowerCells.find(p => p.index === targetCell && !p.claimed);
      if (pc) {
        pc.claimed = true;
        update.power_cells = JSON.stringify(newPowerCells);
        if (!mySkill) {
          const skill = getRandomSkill();
          update[mySkillKey] = skill;
          setNewSkillFlag(true); setTimeout(() => setNewSkillFlag(false), 2000);
          soundsRef.current.playPowerCell();
          showToast({ type: 'success', title: '✦ Power Cell Claimed!', message: `You got: ${SKILL_META[skill].icon} ${SKILL_META[skill].name}` });
        } else {
          showToast({ type: 'warning', title: 'Power Cell', message: 'You already have a skill!' });
        }
      }

      // Curse Cell check
      const newCurseCells = [...curseCells];
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
        playCurseSound(curseType);
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
        update.status = 'finished';
        update.winner_id = meId;
        update.finish_reason = 'line_win';
        update.ended_at = update.last_move_at;
        await supabaseClient.from('game_rooms').update(update).eq('id', roomId);
        return;
      }
      if (isDraw(newBoard as any)) {
        update.status = 'finished';
        update.winner_id = null;
        update.finish_reason = 'draw_board_full';
        update.ended_at = update.last_move_at;
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
        lastShuffleAtRef.current = update.next_shuffle_at;
        setIsShuffling(true);
        soundsRef.current.playShuffle();
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
    if (lock.status !== 'active' || turnSubmitLockRef.current) return;
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
    if (!room || lock.status !== 'active') return;
    try {
      const { data: latestRoom } = await supabaseClient
        .from('game_rooms')
        .select('*')
        .eq('id', roomId)
        .single();

      if (!latestRoom || latestRoom.status !== 'ongoing' || !latestRoom.current_turn) return;

      const timedOutPlayerId: string = latestRoom.current_turn;
      const timedOutIsP1 = timedOutPlayerId === latestRoom.player1_id;
      const timeoutKey = timedOutIsP1 ? 'player1_timeouts' : 'player2_timeouts';
      const curseKey = timedOutIsP1 ? 'player1_curse' : 'player2_curse';
      const nextTurnPlayerId = timedOutIsP1 ? latestRoom.player2_id : latestRoom.player1_id;
      if (!nextTurnPlayerId) return;

      const currentTimeouts = Number(latestRoom[timeoutKey] ?? 0);
      const nextTimeouts = currentTimeouts + 1;
      const nowIso = new Date().toISOString();

      if (nextTimeouts >= 2) {
        const { data: updatedFinish } = await supabaseClient
          .from('game_rooms')
          .update({
            [timeoutKey]: nextTimeouts,
            status: 'finished',
            winner_id: nextTurnPlayerId,
            last_move_at: nowIso,
            ended_at: nowIso,
            finish_reason: 'timeout_second_strike',
          })
          .eq('id', roomId)
          .eq('status', 'ongoing')
          .eq('current_turn', timedOutPlayerId)
          .select('id')
          .maybeSingle();

        if (!updatedFinish) return;

        if (timedOutPlayerId === meId) {
          showToastRef.current({ type: 'error', title: "Time's Up!", message: 'Timeout kedua. Kamu langsung kalah.' });
        } else {
          showToastRef.current({ type: 'success', title: 'Opponent Timed Out', message: 'Lawan timeout kedua dan langsung kalah.' });
        }
        return;
      }

      const tc = latestRoom.turn_count ?? 0;
      const nsa = latestRoom.next_shuffle_at ?? 12;
      const effectiveNsa = tc < 12 ? Math.max(nsa, 12) : nsa;
      const newTurnCount = tc + 1;

      const update: Record<string, unknown> = {
        [timeoutKey]: nextTimeouts,
        current_turn: nextTurnPlayerId,
        last_move_at: nowIso,
        turn_count: newTurnCount,
      };
      if (tc < 12 && nsa < 12) update.next_shuffle_at = 12;

      const timedOutCurseRaw = latestRoom[curseKey];
      const timedOutCurse: PlayerCurse | null = timedOutCurseRaw
        ? (typeof timedOutCurseRaw === 'string' ? JSON.parse(timedOutCurseRaw) : timedOutCurseRaw)
        : null;
      if (timedOutCurse) {
        const ticked = tickCurse(timedOutCurse);
        update[curseKey] = ticked ? JSON.stringify(ticked) : null;
      }

      if (newTurnCount >= effectiveNsa) {
        const latestBoard: BoardCell[] = typeof latestRoom.board_state === 'string'
          ? JSON.parse(latestRoom.board_state) : latestRoom.board_state;
        const latestPowerCells: PowerCell[] = typeof latestRoom.power_cells === 'string'
          ? JSON.parse(latestRoom.power_cells) : (latestRoom.power_cells || []);
        const latestCurseCells: CurseCell[] = typeof latestRoom.curse_cells === 'string'
          ? JSON.parse(latestRoom.curse_cells) : (latestRoom.curse_cells || []);
        const s = safeShuffle(latestBoard, latestPowerCells, latestCurseCells);
        update.board_state = s.board;
        update.power_cells = JSON.stringify(s.power_cells);
        update.curse_cells = JSON.stringify(s.curse_cells);
        update.next_shuffle_at = effectiveNsa + 12;
      }

      const { data: updatedTurn } = await supabaseClient
        .from('game_rooms')
        .update(update)
        .eq('id', roomId)
        .eq('status', 'ongoing')
        .eq('current_turn', timedOutPlayerId)
        .select('id')
        .maybeSingle();

      if (!updatedTurn) return;

      if (timedOutPlayerId === meId) {
        showToastRef.current({ type: 'warning', title: "Time's Up!", message: 'Timeout pertama. Giliran kamu dilewati (1/2).' });
      } else {
        showToastRef.current({ type: 'info', title: 'Opponent Timed Out', message: 'Lawan timeout pertama. Gilirannya dilewati (1/2).' });
      }
    } catch {
      showToastRef.current({ type: 'error', title: 'Timer Error', message: 'Failed to process timeout result.' });
    }
  }, [lock.status, meId, room, roomId]);

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
  const isLobbyGame = isLobbyGameSession || Boolean(room.player1_ready && room.player2_ready);

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
          {lock.status === 'conflict' && (
            <div
              className="card"
              style={{
                marginBottom: '10px',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                boxShadow: '0 0 24px rgba(245, 158, 11, 0.16)',
              }}
            >
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#f59e0b', marginBottom: '6px' }}>
                Sesi ini sedang read-only
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '10px' }}>
                Akun ini aktif di tab/browser lain. Ambil alih sesi untuk mulai bermain dari tab ini.
              </div>
              <button
                className="btn btn-primary"
                disabled={lock.isTakingOver}
                onClick={async () => {
                  await lock.takeOver();
                }}
              >
                {lock.isTakingOver ? 'Taking over...' : 'Take Over Session'}
              </button>
            </div>
          )}

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
                  ? isMyTurn
                    ? 'Your Turn'
                    : (room.is_vs_ai && aiThinking ? '🤖 AI is thinking...' : "Opponent's Turn")
                  : 'Game Over'}
              </div>

              {/* Player Cards */}
              <div className="game-player-stack">
                <PlayerCard username={playerProfiles?.p1.username ?? 'Player 1'} elo={playerProfiles?.p1.elo ?? 1000} symbol="X" you={room.player1_id === meId} active={room.current_turn === room.player1_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p1.avatarUrl} />
                <div style={{ textAlign: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>VS</div>
                <PlayerCard username={playerProfiles?.p2.username ?? 'Player 2'} elo={playerProfiles?.p2.elo ?? 1000} symbol="O" you={room.player2_id === meId} active={room.current_turn === room.player2_id && room.status === 'ongoing'} avatarUrl={playerProfiles?.p2.avatarUrl} />
                {/* AI Skill Ready badge */}
                {room.is_vs_ai && (() => {
                  const oppSkillKey = amP1 ? 'player2_skill' : 'player1_skill';
                  const oppSkill: SkillType | null = room[oppSkillKey] ?? null;
                  if (!oppSkill) return null;
                  return (
                    <div style={{ textAlign: 'center', marginTop: '4px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 10px',
                        borderRadius: '4px',
                        background: 'rgba(124,58,237,0.12)',
                        color: '#a78bfa',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 600,
                      }}>
                        🤖 {SKILL_META[oppSkill].icon} Skill Ready
                      </span>
                    </div>
                  );
                })()}
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '10px',
                  marginBottom: '6px',
                  fontFamily: 'var(--font-heading)',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span style={{ color: myTimeouts >= 1 ? '#f59e0b' : 'var(--text-muted)' }}>
                  You timeout: {myTimeouts}/2
                </span>
                <span style={{ color: oppTimeouts >= 1 ? '#f59e0b' : 'var(--text-muted)' }}>
                  {room.is_vs_ai ? 'AI' : 'Opponent'} timeout: {oppTimeouts}/2
                </span>
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
                  disabled={lock.status !== 'active' || !isMyTurn || skillTargetMode || isSubmittingTurn}
                  isNew={newSkillFlag}
                />
              )}

              <div className="game-bottom-actions" style={{ textAlign: 'center' }}>
                {room.status === 'ongoing' ?
                  <button
                    className="btn btn-danger"
                    disabled={lock.status !== 'active'}
                    onClick={() => setShowSurrenderConfirm(true)}
                    style={{ minWidth: '180px' }}
                  >
                    Surrender
                  </button>
                  : null
                }
              </div>
            </aside>

            {/* Board */}
            <section className="game-board-wrap">
              <div className={fumbleWarning ? 'animate-fumble-shake' : ''} style={{ display: 'flex', justifyContent: 'center' }}>
                <Board
                  board={board as any}
                  onMove={handleBoardClick}
                  disabled={lock.status !== 'active' || room.status !== 'ongoing' || !isMyTurn || isSubmittingTurn}
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

      {showSurrenderConfirm && room.status === 'ongoing' && (
        <div
          onClick={() => setShowSurrenderConfirm(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 96,
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              borderColor: 'rgba(239,68,68,0.3)',
              boxShadow: '0 0 30px rgba(239,68,68,0.14)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: '#ef4444',
                marginBottom: '8px',
              }}
            >
              Surrender this match?
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginBottom: '16px' }}>
              {room?.player1_ready && room?.player2_ready ? 'This match will not affect ELO.' : 'You will lose ELO points.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button
                className="btn btn-danger"
                disabled={lock.status !== 'active'}
                onClick={async () => {
                  if (!room || !meId) return;
                  const winner = room.player1_id === meId ? room.player2_id : room.player1_id;
                  const nowIso = new Date().toISOString();
                  await supabaseClient
                    .from('game_rooms')
                    .update({
                      status: 'finished',
                      winner_id: winner,
                      last_move_at: nowIso,
                      ended_at: nowIso,
                      finish_reason: 'surrender',
                    })
                    .eq('id', roomId);
                  setShowSurrenderConfirm(false);
                }}
                style={{ minWidth: '120px' }}
              >
                Yes, Surrender
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowSurrenderConfirm(false)}
                style={{ minWidth: '110px' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
        isVsAi={!!room?.is_vs_ai}
        aiEloMode={room?.is_vs_ai ? (room?.ai_elo_mode as "none" | "reduced" ?? (aiOrigin === 'dashboard' ? 'none' : 'reduced')) : undefined}
        onPlayAgain={
          isLobbyGame
            ? undefined
            : (
              // AI from matchmaking fallback: no Play Again, just dashboard
              (room?.is_vs_ai && aiOrigin === 'matchmaking') ? undefined
                : async () => {
                  if (room?.is_vs_ai && aiOrigin === 'dashboard') {
                    try {
                      const { data, error } = await supabaseClient.rpc('create_ai_match', {
                        input_difficulty: 'adaptive',
                        input_origin: 'dashboard',
                      });
                      if (error) throw error;
                      const row = Array.isArray(data) ? data[0] : data;
                      if (!row?.room_id) throw new Error('No room created');

                      const session = await supabaseClient.auth.getSession();
                      const uid = session.data.session?.user.id;
                      const { data: myProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', uid!).single();
                      const persona = getRandomPersona();
                      setAiMatchFound({
                        gameId: row.room_id,
                        myName: myProfile?.username ?? 'You',
                        myElo: myProfile?.elo_rating ?? 1000,
                        myAvatarUrl: myProfile?.avatar_url ?? null,
                        oppName: persona,
                        oppElo: myProfile?.elo_rating ?? 1000,
                      });
                      playMatchFound();
                    } catch { router.push('/dashboard'); }
                  } else {
                    router.push('/matchmaking');
                  }
                }
            )
        }
        onDashboard={async () => {
          if (isLobbyGame) {
            try {
              const emptyBoard = Array(25).fill(null);
              await supabaseClient
                .from('game_rooms')
                .update({
                  status: 'waiting',
                  winner_id: null,
                  board_state: emptyBoard,
                  current_turn: room.player1_id,
                  last_move_at: new Date().toISOString(),
                  turn_count: 0,
                  next_shuffle_at: 12,
                  power_cells: [],
                  curse_cells: [],
                  player1_skill: null,
                  player2_skill: null,
                  player1_curse: null,
                  player2_curse: null,
                  move_log: [],
                  started_at: null,
                  ended_at: null,
                  finish_reason: null,
                  player1_timeouts: 0,
                  player2_timeouts: 0,
                  player1_ready: false,
                  player2_ready: false,
                })
                .eq('id', roomId);
            } catch {
              showToastRef.current({
                type: 'error',
                title: 'Back to Lobby Failed',
                message: 'Failed to reset room state. Please try again.',
              });
              return;
            }
            router.push(`/lobby/${roomId}`);
            return;
          }
          router.push('/dashboard');
        }}
        dashboardLabel={isLobbyGame ? 'Back to Lobby' : undefined}
      />
      {!room?.is_vs_ai && <LiveChat roomId={roomId} meId={meId} playerName={myPlayerName} />}

      {/* AI Match Found Modal for Play Again */}
      <MatchFoundModal
        open={!!aiMatchFound}
        myName={aiMatchFound?.myName ?? ''}
        myElo={aiMatchFound?.myElo ?? 0}
        myAvatarUrl={aiMatchFound?.myAvatarUrl}
        oppName={aiMatchFound?.oppName ?? ''}
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
    </>
  );
}


