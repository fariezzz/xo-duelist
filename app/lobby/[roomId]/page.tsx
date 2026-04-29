"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';

export default function LobbyRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roomCode = useMemo(() => room?.room_code || '', [room]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (!sessionData.session) { router.push('/'); return; }
        setMeId(sessionData.session.user.id);
        const { data, error } = await supabaseClient.from('game_rooms').select('*').eq('id', roomId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Lobby not found');
        if (!cancelled) setRoom(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load lobby');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const channel = supabaseClient
      .channel(`lobby-room-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const updated = payload.new || payload.record;
        if (!updated) return;
        setRoom(updated);
        if (updated.status === 'ongoing' && updated.player2_id) {
          router.replace(`/game/${updated.id}`);
        }
      })
      .subscribe();
    return () => { cancelled = true; supabaseClient.removeChannel(channel); };
  }, [roomId, router]);

  async function cancelRoom() {
    try {
      if (!room?.id) return;
      const { error } = await supabaseClient.rpc('cancel_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) { setError(err?.message || 'Failed to cancel room'); }
  }

  async function toggleReady() {
    try {
      if (!room?.id) return;
      setReadyLoading(true);
      if (!meId) throw new Error('Session not found');
      const isHost = room.player1_id === meId;
      const currentReady = isHost ? room.player1_ready : room.player2_ready;
      const { error } = await supabaseClient.rpc('set_lobby_ready', { input_room_id: room.id, input_ready: !currentReady });
      if (error) throw error;
    } catch (err: any) { setError(err?.message || 'Failed to update ready'); }
    finally { setReadyLoading(false); }
  }

  async function startRoom() {
    try {
      if (!room?.id || !meId || room.player1_id !== meId) return;
      setStartLoading(true);
      const { error } = await supabaseClient.rpc('start_lobby_room', { input_room_id: room.id });
      if (error) throw error;
    } catch (err: any) {
      const msg = String(err?.message || 'Failed to start game');
      setError(msg.toLowerCase().includes('players_not_ready') ? 'All players must be READY first' : msg);
    } finally { setStartLoading(false); }
  }

  async function copyCode() {
    if (!roomCode) return;
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return (
    <>
      <Navbar />
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="animate-spin-slow" style={{ width: 40, height: 40, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%' }} />
      </div>
    </>
  );

  if (error && !room) return (
    <>
      <Navbar />
      <div className="page-container" style={{ padding: '32px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto', borderColor: 'rgba(239,68,68,0.3)' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    </>
  );

  if (!room) return null;

  const isHost = !!meId && room.player1_id === meId;
  const hostReady = !!room.player1_ready;
  const guestReady = !!room.player2_ready;
  const myReady = isHost ? hostReady : guestReady;
  const canStart = isHost && hostReady && guestReady && room.player2_id;

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳ Waiting Room</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.95rem' }}>
            Share the room code. When both players are ready, the host starts the game.
          </p>

          {error && (
            <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: '20px', padding: '14px 20px', color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <div className="card" style={{ marginBottom: '20px' }}>
            {/* Room Code */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Room Code</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  padding: '12px 20px',
                  borderRadius: '12px',
                  border: '1px solid rgba(124,58,237,0.3)',
                  background: 'rgba(0,0,0,0.3)',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  letterSpacing: '0.35em',
                  color: '#a78bfa',
                  textShadow: '0 0 20px rgba(124,58,237,0.3)',
                }}>
                  {roomCode}
                </div>
                <button className="btn btn-ghost" onClick={copyCode} style={{ padding: '12px 16px' }}>
                  {copied ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            </div>

            {/* Status Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Status', value: room.status },
                { label: 'Opponent', value: room.player2_id ? 'Joined ✓' : 'Waiting...' },
                { label: 'Host', value: hostReady ? '✅ READY' : '⬜ Not Ready' },
                { label: 'Guest', value: room.player2_id ? (guestReady ? '✅ READY' : '⬜ Not Ready') : '—' },
              ].map((item, i) => (
                <div key={i} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{item.label}</div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: '0.95rem' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className={`btn ${myReady ? 'btn-ghost' : 'btn-success'}`}
                onClick={toggleReady}
                disabled={readyLoading}
                style={{ width: '100%' }}
              >
                {readyLoading ? 'Updating...' : myReady ? '⬜ Set Not Ready' : '✅ Set Ready'}
              </button>

              {isHost && (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={startRoom}
                  disabled={!canStart || startLoading}
                  style={{ width: '100%' }}
                >
                  {startLoading ? 'Starting...' : '🚀 Start Game'}
                </button>
              )}
            </div>
          </div>

          {/* Bottom actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-ghost" onClick={() => router.push('/dashboard')} style={{ flex: 1 }}>← Dashboard</button>
            {isHost && <button className="btn btn-danger" onClick={cancelRoom} style={{ flex: 1 }}>Cancel Room</button>}
          </div>
        </div>
      </div>
    </>
  );
}
