"use client";
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { supabaseClient } from '../../lib/supabase';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import MatchFoundModal from '../../components/notifications/MatchFoundModal';
import useSound from 'use-sound';

export default function MatchmakingPage() {
  const router = useRouter();
  const [joined, setJoined] = useState(false);
  const [time, setTime] = useState(0);
  const intervalRef = useRef<any>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const matchingRef = useRef(false);
  const timeRef = useRef(0);
  const redirectedRef = useRef(false);

  const [playMatchFound] = useSound('/sounds/match-found.wav', { volume: 0.7 });

  // Match found modal state
  const [matchFound, setMatchFound] = useState<{
    gameId: string;
    myName: string;
    myElo: number;
    myAvatarUrl: string | null;
    oppName: string;
    oppElo: number;
    oppAvatarUrl: string | null;
  } | null>(null);

  // Keep timeRef in sync
  useEffect(() => { timeRef.current = time; }, [time]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const s = await supabaseClient.auth.getSession();
      if (!s.data.session) return router.push('/');
      const uid = s.data.session.user.id;
      if (cancelled) return;
      setMeId(uid);

      // Get ELO
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('elo_rating')
        .eq('id', uid)
        .single();
      const elo = profile?.elo_rating ?? 1000;

      // Clear any stale queue entry first, then insert
      await supabaseClient.from('matchmaking_queue').delete().eq('player_id', uid);
      const { error } = await supabaseClient
        .from('matchmaking_queue')
        .insert([{ player_id: uid, elo_rating: elo }]);

      if (error) {
        console.error('Failed to join queue:', error);
        return;
      }

      if (!cancelled) setJoined(true);
    })();

    intervalRef.current = setInterval(() => setTime(t => t + 1), 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [router]);

  const tryMatch = useCallback(async () => {
    if (!meId || matchingRef.current || redirectedRef.current) return;
    matchingRef.current = true;

    try {
      // Check if I'm still in the queue
      const { data: myEntry } = await supabaseClient
        .from('matchmaking_queue')
        .select('player_id')
        .eq('player_id', meId)
        .maybeSingle();

      if (!myEntry) {
        // I've been matched by the other player already — check for my game room
        const { data: rooms } = await supabaseClient
          .from('game_rooms')
          .select('*')
          .or(`player1_id.eq.${meId},player2_id.eq.${meId}`)
          .eq('status', 'ongoing')
          .order('created_at', { ascending: false })
          .limit(1);

        if (rooms && rooms.length > 0 && !redirectedRef.current) {
          await supabaseClient.from('matchmaking_queue').delete().eq('player_id', meId);
          redirectedRef.current = true;
          const r = rooms[0];
          const oppId = r.player1_id === meId ? r.player2_id : r.player1_id;
          const { data: myProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', meId).single();
          const { data: oppProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', oppId).single();
          setMatchFound({
            gameId: r.id,
            myName: myProfile?.username ?? 'You',
            myElo: myProfile?.elo_rating ?? 1000,
            myAvatarUrl: myProfile?.avatar_url ?? null,
            oppName: oppProfile?.username ?? 'Opponent',
            oppElo: oppProfile?.elo_rating ?? 1000,
            oppAvatarUrl: oppProfile?.avatar_url ?? null,
          });
        }
        return;
      }

      // Get my ELO
      const { data: meProfile } = await supabaseClient
        .from('profiles')
        .select('elo_rating')
        .eq('id', meId)
        .single();
      if (!meProfile) return;

      // Expand range based on wait time
      const t = timeRef.current;
      const range = t > 60 ? 100000 : t > 30 ? 400 : 200;

      // Find oldest opponent in queue within range
      const { data: opponents } = await supabaseClient
        .from('matchmaking_queue')
        .select('*')
        .neq('player_id', meId)
        .order('joined_at', { ascending: true })
        .limit(1);

      if (!opponents || opponents.length === 0) return;

      const opp = opponents[0];
      const diff = Math.abs(opp.elo_rating - meProfile.elo_rating);
      if (diff > range) return;

      // Use a deterministic tiebreaker: only the player with the lower UUID creates the room.
      // This prevents both players from creating duplicate rooms simultaneously.
      if (meId > opp.player_id) {
        // I lose the tiebreak — let the other player create the room.
        // I'll discover it via the realtime channel or next poll.
        return;
      }

      // I win the tiebreak — create the room
      // Randomize who plays X (player1) vs O (player2)
      const iGoFirst = Math.random() < 0.5;
      const p1 = iGoFirst ? meId : opp.player_id;
      const p2 = iGoFirst ? opp.player_id : meId;

      const roomCode = Array.from({ length: 6 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 36)]).join('');
      const { data: room, error: roomError } = await supabaseClient
        .from('game_rooms')
        .insert([{
          player1_id: p1,
          player2_id: p2,
          board_state: JSON.stringify(Array(25).fill(null)),
          current_turn: p1,
          status: 'ongoing',
          room_code: roomCode,
        }])
        .select('id')
        .single();

      if (roomError || !room) {
        console.error('Failed to create room:', roomError?.message, roomError?.details, roomError?.hint, roomError);
        return;
      }

      // Remove both players from queue (separate deletes for RLS compatibility)
      await supabaseClient.from('matchmaking_queue').delete().eq('player_id', meId);
      await supabaseClient.from('matchmaking_queue').delete().eq('player_id', opp.player_id);

      if (!redirectedRef.current) {
        redirectedRef.current = true;
        // Fetch profile data for the VS modal
        const { data: myProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', meId).single();
        const { data: oppProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', opp.player_id).single();
        setMatchFound({
          gameId: room.id,
          myName: myProfile?.username ?? 'You',
          myElo: myProfile?.elo_rating ?? 1000,
          myAvatarUrl: myProfile?.avatar_url ?? null,
          oppName: oppProfile?.username ?? 'Opponent',
          oppElo: oppProfile?.elo_rating ?? 1000,
          oppAvatarUrl: oppProfile?.avatar_url ?? null,
        });
      }
    } finally {
      matchingRef.current = false;
    }
  }, [meId, router]);

  // Realtime + polling effect (stable — no time dependency)
  useEffect(() => {
    if (!joined || !meId) return;

    // Initial attempt
    tryMatch();

    // Poll every 3 seconds
    const check = setInterval(tryMatch, 3000);

    // Realtime: when someone joins the queue, try to match
    const queueChannel = supabaseClient
      .channel(`mm-queue-${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matchmaking_queue' }, () => {
        tryMatch();
      })
      .subscribe();

    // Realtime: when a game room is created for me, redirect
    const roomChannel = supabaseClient
      .channel(`mm-room-${meId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_rooms' }, (payload: any) => {
        const record = payload.new || payload.record;
        if (!record) return;
        if ((record.player1_id === meId || record.player2_id === meId) && !redirectedRef.current) {
          supabaseClient.from('matchmaking_queue').delete().eq('player_id', meId).then(() => {});
          redirectedRef.current = true;
          // Fetch profiles for the VS modal
          const oppId = record.player1_id === meId ? record.player2_id : record.player1_id;
          (async () => {
            const { data: myP } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', meId).single();
            const { data: oppP } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', oppId).single();
            setMatchFound({
              gameId: record.id,
              myName: myP?.username ?? 'You',
              myElo: myP?.elo_rating ?? 1000,
              myAvatarUrl: myP?.avatar_url ?? null,
              oppName: oppP?.username ?? 'Opponent',
              oppElo: oppP?.elo_rating ?? 1000,
              oppAvatarUrl: oppP?.avatar_url ?? null,
            });
            playMatchFound();
          })();
        }
      })
      .subscribe();

    return () => {
      clearInterval(check);
      supabaseClient.removeChannel(queueChannel);
      supabaseClient.removeChannel(roomChannel);
    };
  }, [joined, meId, tryMatch]);

  async function cancel() {
    if (meId) {
      await supabaseClient.from('matchmaking_queue').delete().eq('player_id', meId);
    }
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
                <span key={i} style={{ animation: `dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite`, color: 'var(--accent-violet-light)' }}>.</span>
              ))}
            </span>
          </h2>

          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
            {time}s
          </div>

          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px', fontFamily: 'var(--font-heading)' }}>
            Search Range: {rangeText}
          </div>

          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden', marginBottom: '28px' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #f59e0b)', borderRadius: '3px', transition: 'width 1s linear', boxShadow: '0 0 8px rgba(124, 58, 237, 0.4)' }} />
          </div>

          <button className="btn btn-danger" onClick={cancel} style={{ width: '100%' }}>
            ✕ Cancel Search
          </button>
        </div>
      </div>

      {/* Match Found Modal */}
      <MatchFoundModal
        open={!!matchFound}
        myName={matchFound?.myName ?? ''}
        myElo={matchFound?.myElo ?? 0}
        myAvatarUrl={matchFound?.myAvatarUrl}
        oppName={matchFound?.oppName ?? ''}
        oppElo={matchFound?.oppElo ?? 0}
        oppAvatarUrl={matchFound?.oppAvatarUrl}
        onCountdownDone={() => {
          if (matchFound) router.push(`/game/${matchFound.gameId}`);
        }}
      />
    </>
  );
}
