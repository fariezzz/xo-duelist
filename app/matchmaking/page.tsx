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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

      // Rejoin safeguard: if an ongoing match already exists, jump back into it.
      const { data: activeRooms } = await supabaseClient
        .from('game_rooms')
        .select('id')
        .or(`player1_id.eq.${uid},player2_id.eq.${uid}`)
        .eq('status', 'ongoing')
        .order('created_at', { ascending: false })
        .limit(1);
      if (activeRooms && activeRooms.length > 0) {
        redirectedRef.current = true;
        router.replace(`/game/${activeRooms[0].id}`);
        return;
      }

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
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, [router]);

  const tryMatch = useCallback(async () => {
    if (!meId || matchingRef.current || redirectedRef.current) return;
    matchingRef.current = true;

    try {
      // Expand range based on wait time
      const t = timeRef.current;
      const range = t > 60 ? 100000 : t > 30 ? 400 : 200;

      // Match decision is atomic in DB transaction to avoid cross-pairing races.
      const { data: matchRows, error: matchErr } = await supabaseClient
        .rpc('find_match_atomic', { input_range: range });
      if (matchErr) {
        console.error('find_match_atomic failed:', matchErr);
        return;
      }
      const match = Array.isArray(matchRows) ? matchRows[0] : null;
      if (!match?.room_id) return;

      const p1 = match.player1_id as string;
      const p2 = match.player2_id as string;
      if (p1 !== meId && p2 !== meId) return;
      const oppId = p1 === meId ? p2 : p1;

      if (!redirectedRef.current) {
        redirectedRef.current = true;
        await supabaseClient.from('matchmaking_queue').delete().eq('player_id', meId);
        const { data: myProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', meId).single();
        const { data: oppProfile } = await supabaseClient.from('profiles').select('username, elo_rating, avatar_url').eq('id', oppId).single();
        setMatchFound({
          gameId: match.room_id,
          myName: myProfile?.username ?? 'You',
          myElo: myProfile?.elo_rating ?? 1000,
          myAvatarUrl: myProfile?.avatar_url ?? null,
          oppName: oppProfile?.username ?? 'Opponent',
          oppElo: oppProfile?.elo_rating ?? 1000,
          oppAvatarUrl: oppProfile?.avatar_url ?? null,
        });
        playMatchFound();
      }
    } finally {
      matchingRef.current = false;
    }
  }, [meId, playMatchFound]);

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

    return () => {
      clearInterval(check);
      supabaseClient.removeChannel(queueChannel);
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
