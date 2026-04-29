"use client";
import React, { useEffect, useState, useRef } from 'react';
import { supabaseClient } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';

export default function MatchmakingPage() {
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const [time, setTime] = useState(0);
  const intervalRef = useRef<any>(null);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await supabaseClient.auth.getSession();
      if (!s.data.session) return router.push('/');
      const uid = s.data.session.user.id;
      setMeId(uid);
      // add to queue
      await supabaseClient.from('profiles').select('elo_rating').eq('id', uid).single().then(async (r: any) => {
        const elo = r.data?.elo_rating ?? 1000;
        await supabaseClient.from('matchmaking_queue').insert([{ player_id: uid, elo_rating: elo }]);
        setJoined(true);
      });
    })();

    // simple timer
    intervalRef.current = setInterval(() => setTime(t => t + 1), 1000);
    return () => {
      clearInterval(intervalRef.current);
    }
  }, []);

  useEffect(() => {
    if (!joined || !meId) return;

    const getRange = () => {
      if (time > 60) return 100000;
      if (time > 30) return 400;
      return 200;
    };

    const tryMatch = async () => {
      const me = await supabaseClient.from('profiles').select('elo_rating').eq('id', meId).single();
      if (!me.data) return;
      const { data: opp } = await supabaseClient
        .from('matchmaking_queue')
        .select('*')
        .neq('player_id', meId)
        .order('joined_at', { ascending: true })
        .limit(1);

      if (opp && opp.length) {
        const other = opp[0];
        const diff = Math.abs(other.elo_rating - me.data.elo_rating);
        if (diff <= getRange()) {
          const room = await supabaseClient.from('game_rooms').insert([
            {
              player1_id: meId,
              player2_id: other.player_id,
              board_state: JSON.stringify(Array(25).fill(null)),
              current_turn: meId,
              status: 'ongoing'
            }
          ]).select('*').single();
          if (room.data) {
            await supabaseClient.from('matchmaking_queue').delete().or(`player_id.eq.${meId},player_id.eq.${other.player_id}`);
            router.push(`/game/${room.data.id}`);
          }
        }
      }
    };

    // periodic fallback (range expansion)
    const check = setInterval(tryMatch, 3000);

    // realtime triggers
    const queueChannel = supabaseClient
      .channel(`matchmaking-queue-${meId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matchmaking_queue' }, () => {
        tryMatch();
      })
      .subscribe();

    const roomChannel = supabaseClient
      .channel(`matchmaking-room-${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_rooms' }, (payload: any) => {
        const record = payload.new || payload.record;
        if (!record) return;
        if (record.player1_id === meId || record.player2_id === meId) {
          router.push(`/game/${record.id}`);
        }
      })
      .subscribe();

    return () => {
      clearInterval(check);
      supabaseClient.removeChannel(queueChannel);
      supabaseClient.removeChannel(roomChannel);
    };
  }, [joined, time, router, meId]);

  async function cancel() {
    const s = await supabaseClient.auth.getSession();
    if (!s.data.session) return router.push('/');
    const uid = s.data.session.user.id;
    await supabaseClient.from('matchmaking_queue').delete().eq('player_id', uid);
    router.push('/dashboard');
  }

  const rangeText = time > 60 ? 'Any ELO' : time > 30 ? '±400 ELO' : '±200 ELO';
  const pct = Math.min(100, (time / 60) * 100);

  return (
    <>
      <Navbar />
      <div
        className="page-container animate-fade-in"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: '460px',
            width: '90%',
            padding: '48px 36px',
            textAlign: 'center',
          }}
        >
          {/* Radar animation */}
          <div style={{ position: 'relative', width: 120, height: 120, margin: '0 auto 28px' }}>
            {/* Pulsing rings */}
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(124, 58, 237, 0.3)',
                  animation: `radar-ping 2s ease-out ${i * 0.6}s infinite`,
                }}
              />
            ))}
            {/* Center circle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.3))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                boxShadow: '0 0 30px rgba(124, 58, 237, 0.3)',
              }}
            >
              ⚔️
            </div>
          </div>

          {/* Title */}
          <h2
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '1.6rem',
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Finding Opponent
            <span style={{ display: 'inline-flex', gap: '2px', marginLeft: '4px' }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    animation: `dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                    color: 'var(--accent-violet-light)',
                  }}
                >
                  .
                </span>
              ))}
            </span>
          </h2>

          {/* Timer */}
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '2.5rem',
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            {time}s
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>
            Search Range: {rangeText}
          </div>

          {/* Progress bar */}
          <div
            style={{
              width: '100%',
              height: '6px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '28px',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #f59e0b)',
                borderRadius: '3px',
                transition: 'width 1s linear',
                boxShadow: '0 0 8px rgba(124, 58, 237, 0.4)',
              }}
            />
          </div>

          {/* Cancel */}
          <button
            className="btn btn-danger"
            onClick={cancel}
            style={{ width: '100%' }}
          >
            ✕ Cancel Search
          </button>
        </div>
      </div>
    </>
  );
}
