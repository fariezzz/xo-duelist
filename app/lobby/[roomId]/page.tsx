"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabaseClient } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';
import LiveChat from '../../../components/LiveChat';

const HEARTBEAT_INTERVAL_MS = 10_000; // Send heartbeat every 10s
const GRACE_PERIOD_MS = 60_000; // 1 minute grace period on tab close
const LOBBY_ROOM_STORAGE_KEY = 'xo-duelist-lobby-room';

/** Save room presence info to localStorage (survives tab close for grace period) */
function saveLobbyPresence(roomId: string, role: 'host' | 'guest') {
  try {
    localStorage.setItem(LOBBY_ROOM_STORAGE_KEY, JSON.stringify({
      roomId,
      role,
      leftAt: null, // will be set by pagehide/beforeunload
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

/** Mark the lobby presence as "left" with a timestamp for grace period tracking */
function markLobbyLeft() {
  try {
    const raw = localStorage.getItem(LOBBY_ROOM_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    data.leftAt = Date.now();
    localStorage.setItem(LOBBY_ROOM_STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

/** Clear lobby presence entirely (room was cancelled/left/started) */
function clearLobbyPresence() {
  try {
    localStorage.removeItem(LOBBY_ROOM_STORAGE_KEY);
  } catch { /* ignore */ }
}

/** Get saved lobby presence */
function getLobbyPresence(): { roomId: string; role: string; leftAt: number | null; timestamp: number } | null {
  try {
    const raw = localStorage.getItem(LOBBY_ROOM_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function LobbyRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params?.roomId as string;
  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomCancelled, setRoomCancelled] = useState(false);
  const [leftRoom, setLeftRoom] = useState(false);
  const [showConfirm, setShowConfirm] = useState<'cancel' | 'exit' | null>(null);
  const [readyLoading, setReadyLoading] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const roomCode = useMemo(() => room?.room_code || '', [room]);
  const isPublicRoom = !!room?.is_public;

  // Refs for latest values (used in event handlers without re-registering)
  const roomRef = useRef(room);
  const meIdRef = useRef(meId);
  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => { meIdRef.current = meId; }, [meId]);

  // ── Heartbeat: keep room alive while tab is open ──────────────
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendHeartbeat = useCallback(async () => {
    if (!roomId) return;
    try {
      await supabaseClient.rpc('lobby_heartbeat', { input_room_id: roomId });
    } catch { /* non-critical */ }
  }, [roomId]);

  useEffect(() => {
    // Start heartbeat once we have room data
    if (!room || room.status !== 'waiting') return;

    // Immediately send one heartbeat
    sendHeartbeat();

    heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [room?.id, room?.status, sendHeartbeat]);

  // ── Cleanup stale rooms periodically (client-side trigger) ────
  useEffect(() => {
    // Run cleanup once on mount & every 30s to catch stale rooms
    const runCleanup = async () => {
      try {
        await supabaseClient.rpc('cleanup_stale_lobby_rooms', { input_timeout_seconds: 60 });
      } catch { /* non-critical */ }
    };

    runCleanup();
    const cleanupInterval = setInterval(runCleanup, 30_000);
    return () => clearInterval(cleanupInterval);
  }, []);

  // ── On tab close/refresh: mark presence as "left" with timestamp ──
  useEffect(() => {
    const onLeaving = () => {
      // Mark the time we left so we can check grace period on return
      markLobbyLeft();
    };

    window.addEventListener('beforeunload', onLeaving);
    window.addEventListener('pagehide', onLeaving);
    return () => {
      window.removeEventListener('beforeunload', onLeaving);
      window.removeEventListener('pagehide', onLeaving);
    };
  }, []);

  // ── On visibility change: resume heartbeat when tab becomes visible ──
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && roomRef.current?.status === 'waiting') {
        // Immediately send a heartbeat when tab becomes visible again
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [sendHeartbeat]);

  // ── Main data fetch + realtime subscription ───────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (!sessionData.session) { router.push('/'); return; }
        const myId = sessionData.session.user.id;
        setMeId(myId);

        const { data, error } = await supabaseClient.from('game_rooms').select('*').eq('id', roomId).maybeSingle();
        if (error) throw error;
        if (!data) {
          // Room doesn't exist — check if it was within grace period
          const presence = getLobbyPresence();
          if (presence?.roomId === roomId) {
            clearLobbyPresence();
          }
          throw new Error('Lobby not found — it may have expired.');
        }

        if (!cancelled) {
          setRoom(data);

          // Determine role and save presence
          const isHost = data.player1_id === myId;
          saveLobbyPresence(roomId, isHost ? 'host' : 'guest');

          // Check if we're reconnecting after a tab close
          const presence = getLobbyPresence();
          if (presence?.leftAt) {
            const elapsed = Date.now() - presence.leftAt;
            if (elapsed < GRACE_PERIOD_MS) {
              setReconnected(true);
              setTimeout(() => setReconnected(false), 3000);
            }
          }
          // Clear leftAt since we're back
          saveLobbyPresence(roomId, isHost ? 'host' : 'guest');
        }
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
          clearLobbyPresence();
          router.replace(`/game/${updated.id}`);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, () => {
        // Room was deleted (host cancelled or heartbeat expired) — show cancelled UI
        clearLobbyPresence();
        setRoomCancelled(true);
      })
      .subscribe();

    return () => { cancelled = true; supabaseClient.removeChannel(channel); };
  }, [roomId, router]);

  async function cancelRoom() {
    try {
      if (!room?.id) return;
      setShowConfirm(null);
      const { error } = await supabaseClient.rpc('cancel_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      clearLobbyPresence();
      setRoomCancelled(true);
    } catch (err: any) { setError(err?.message || 'Failed to cancel room'); }
  }

  async function exitRoom() {
    try {
      if (!room?.id) return;
      setShowConfirm(null);
      const { error } = await supabaseClient.rpc('leave_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      clearLobbyPresence();
      setLeftRoom(true);
    } catch (err: any) { setError(err?.message || 'Failed to leave room'); }
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
      clearLobbyPresence();
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

  if (roomCancelled) return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚫</div>
          <h2 className="heading" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Room Cancelled</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '24px', lineHeight: 1.5 }}>
            {meId && room?.player1_id === meId
              ? 'You have cancelled this room.'
              : 'The host has cancelled this room or it has expired.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={() => router.push('/lobby')}
              style={{ width: '100%' }}
            >
              🏠 Back to Lobby
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%' }}
            >
              📊 Dashboard
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (leftRoom) return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚶</div>
          <h2 className="heading" style={{ fontSize: '1.5rem', marginBottom: '8px' }}>Left Room</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', marginBottom: '24px', lineHeight: 1.5 }}>
            You have left the room. You can join another room or create a new one.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              className="btn btn-primary"
              onClick={() => router.push('/lobby')}
              style={{ width: '100%' }}
            >
              🏠 Back to Lobby
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%' }}
            >
              📊 Dashboard
            </button>
          </div>
        </div>
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
            {isPublicRoom
              ? 'Your room is visible in the lobby. When both players are ready, the host starts the game.'
              : 'Share the room code. When both players are ready, the host starts the game.'}
          </p>

          {/* Reconnection notice */}
          {reconnected && (
            <div className="animate-fade-in" style={{
              marginBottom: '16px',
              padding: '12px 18px',
              borderRadius: '12px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.88rem',
              color: 'var(--color-success)',
            }}>
              <span style={{ fontSize: '1.1rem' }}>🔄</span>
              <span>Reconnected to room successfully!</span>
            </div>
          )}

          {error && (
            <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: '20px', padding: '14px 20px', color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <div className="card" style={{ marginBottom: '20px' }}>
            {/* Room Type Badge */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 14px',
                borderRadius: '20px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                ...(isPublicRoom
                  ? {
                      background: 'rgba(124,58,237,0.12)',
                      border: '1px solid rgba(124,58,237,0.25)',
                      color: '#a78bfa',
                    }
                  : {
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.25)',
                      color: '#fbbf24',
                    }
                ),
              }}>
                {isPublicRoom ? '🌐 Public Room' : '🔒 Private Room'}
              </span>
            </div>

            {/* Room Code — only for private rooms */}
            {!isPublicRoom && (
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
            )}

            {/* Public room info banner */}
            {isPublicRoom && (
              <div style={{
                marginBottom: '20px',
                padding: '14px 18px',
                borderRadius: '12px',
                background: 'rgba(124,58,237,0.06)',
                border: '1px solid rgba(124,58,237,0.12)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <span style={{ fontSize: '1.2rem' }}>📡</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                  This room is visible in the lobby — anyone can join.
                </span>
              </div>
            )}

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
            {isHost ? (
              <button className="btn btn-danger" onClick={() => setShowConfirm('cancel')} style={{ flex: 1 }}>Cancel Room</button>
            ) : (
              <button className="btn btn-danger" onClick={() => setShowConfirm('exit')} style={{ flex: 1 }}>🚶 Exit Room</button>
            )}
          </div>
        </div>
      </div>

      {/* ── Confirm Dialog ──────────────────────────────── */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setShowConfirm(null)}
        >
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }} />
          <div
            className="animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '400px',
              background: 'var(--bg-layer-2)',
              border: '1px solid var(--card-border)',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>
              {showConfirm === 'cancel' ? '⚠️' : '🚶'}
            </div>
            <h2 className="heading" style={{ fontSize: '1.3rem', marginBottom: '8px' }}>
              {showConfirm === 'cancel' ? 'Cancel Room?' : 'Leave Room?'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginBottom: '24px', lineHeight: 1.5 }}>
              {showConfirm === 'cancel'
                ? 'Are you sure you want to cancel this room? All players will be removed.'
                : 'Are you sure you want to leave this room? You can rejoin later if the room is still available.'}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowConfirm(null)}
                style={{ flex: 1 }}
              >
                Go Back
              </button>
              <button
                className="btn btn-danger"
                onClick={showConfirm === 'cancel' ? cancelRoom : exitRoom}
                style={{ flex: 1 }}
              >
                {showConfirm === 'cancel' ? 'Yes, Cancel' : 'Yes, Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
