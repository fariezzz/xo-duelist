"use client";
import React, { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabaseClient } from '../../../lib/supabase';
import Board from '../../../components/Board';
import Timer from '../../../components/Timer';
import PlayerCard from '../../../components/PlayerCard';
import ResultModal from '../../../components/ResultModal';
import { checkWinner4, isDraw } from '../../../lib/gameLogic';

export default function GameRoom() {
  const params = useParams();
  const roomId = params?.roomId as string;
  const router = useRouter();
  const [room, setRoom] = useState<any>(null);
  const [board, setBoard] = useState<("X" | "O" | null)[]>(Array(25).fill(null));
  const [meId, setMeId] = useState<string | null>(null);
  const [mySymbol, setMySymbol] = useState<'X' | 'O' | '?'>('?');
  const [turnTimerKey, setTurnTimerKey] = useState(0);
  const [result, setResult] = useState<{ title: string; message: string } | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await supabaseClient.auth.getSession();
      if (!s.data.session) return router.push('/');
      setMeId(s.data.session.user.id);
      const { data } = await supabaseClient.from('game_rooms').select('*').eq('id', roomId).single();
      if (!data) return router.push('/dashboard');
      setRoom(data);
      setBoard(data.board_state);
      setMySymbol(data.player1_id === s.data.session.user.id ? 'X' : 'O');
    })();
  }, [roomId, router]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabaseClient.channel(`public:game_rooms:id=eq.${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const newRow = payload.new || payload.record;
        if (!newRow) return;
        setRoom(newRow);
        if (newRow.board_state) setBoard(newRow.board_state);
        setTurnTimerKey((k) => k + 1);
        if (newRow.status === 'finished') {
          if (newRow.winner_id) {
            const title = newRow.winner_id === meId ? 'You Win' : 'You Lose';
            setResult({ title, message: 'Game finished' });
          } else {
            setResult({ title: 'Draw', message: 'No winner' });
          }
        }
        if (lastStatusRef.current !== 'finished' && newRow.status === 'finished') {
          lastStatusRef.current = 'finished';
          // Call DB RPC once (host only) to persist match history + ELO
          if (meId && newRow.player1_id === meId) {
            (async () => {
              try {
                await supabaseClient.rpc('finalize_game', { input_room_id: newRow.id });
              } catch {
                // ignore finalize errors to avoid blocking UI
              }
            })();
          }
        } else if (!lastStatusRef.current) {
          lastStatusRef.current = newRow.status;
        }
      }).subscribe();

    return () => { supabaseClient.removeChannel(channel); };
  }, [roomId, meId]);

  async function makeMove(i: number) {
    if (!room || room.current_turn !== meId) return;
    if (board[i] !== null) return;
    const symbol = room.player1_id === meId ? 'X' : 'O';
    const newBoard = [...board];
    newBoard[i] = symbol;
    setBoard(newBoard);

    // check winner locally
    const res = checkWinner4(newBoard as any);
    if (res.symbol) {
      await supabaseClient.from('game_rooms').update({ board_state: newBoard, status: 'finished', winner_id: meId }).eq('id', roomId);
      return;
    }
    if (isDraw(newBoard as any)) {
      await supabaseClient.from('game_rooms').update({ board_state: newBoard, status: 'finished', winner_id: null }).eq('id', roomId);
      return;
    }

    // update turn and board
    await supabaseClient.from('game_rooms').update({ board_state: newBoard, current_turn: room.player1_id === meId ? room.player2_id : room.player1_id, last_move_at: new Date().toISOString() }).eq('id', roomId);
  }

  async function onExpire() {
    // current player loses
    if (!room) return;
    const loser = room.current_turn;
    const winner = loser === room.player1_id ? room.player2_id : room.player1_id;
    await supabaseClient.from('game_rooms').update({ status: 'finished', winner_id: winner }).eq('id', roomId);
  }

  if (!room) {
    return (
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
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
      <div className="page-container animate-fade-in" style={{ padding: '24px', paddingTop: '32px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>

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
              ? isMyTurn
                ? '⚔️ Your Turn'
                : '⏳ Opponent\'s Turn'
              : '🏁 Game Over'}
          </div>

          {/* Player Cards */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              marginBottom: '20px',
              flexWrap: 'wrap',
            }}
          >
            <PlayerCard
              username={room.player1_username ?? 'Player1'}
              elo={room.player1_elo ?? 1000}
              symbol="X"
              you={room.player1_id === meId}
              active={room.current_turn === room.player1_id && room.status === 'ongoing'}
            />

            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '1.5rem',
                color: 'var(--text-muted)',
              }}
            >
              VS
            </div>

            <PlayerCard
              username={room.player2_username ?? 'Player2'}
              elo={room.player2_elo ?? 1000}
              symbol="O"
              you={room.player2_id === meId}
              active={room.current_turn === room.player2_id && room.status === 'ongoing'}
            />
          </div>

          {/* Timer */}
          <div style={{ maxWidth: '400px', margin: '0 auto 20px' }}>
            <Timer key={turnTimerKey} seconds={15} onExpire={onExpire} run={room.status === 'ongoing'} />
          </div>

          {/* Board */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <Board board={board as any} onMove={makeMove} disabled={room.status !== 'ongoing'} winningCells={[]} />
          </div>

          {/* Return button */}
          <div style={{ textAlign: 'center' }}>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
            >
              ← Return to Dashboard
            </button>
          </div>
        </div>
      </div>

      <ResultModal
        open={!!result}
        title={result?.title}
        message={result?.message}
        onClose={() => { setResult(null); router.push('/dashboard'); }}
      />
    </>
  );
}
