"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';

function normalizeRoomCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
}

interface PublicRoom {
  id: string;
  room_code: string;
  player1_id: string;
  host_username: string;
  created_at: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

const LOBBY_ROOM_STORAGE_KEY = 'xo-duelist-lobby-room';
const GRACE_PERIOD_MS = 60_000;

export default function LobbyPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(true);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [pendingRejoin, setPendingRejoin] = useState<{ roomId: string; role: string; timeLeft: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session) { router.push('/'); return; }

      // Check for a room we recently left (grace period)
      try {
        const raw = localStorage.getItem(LOBBY_ROOM_STORAGE_KEY);
        if (raw) {
          const presence = JSON.parse(raw);
          if (presence?.leftAt && presence?.roomId) {
            const elapsed = Date.now() - presence.leftAt;
            if (elapsed < GRACE_PERIOD_MS) {
              // Verify the room still exists
              const { data: roomData } = await supabaseClient
                .from('game_rooms')
                .select('id, status')
                .eq('id', presence.roomId)
                .eq('status', 'waiting')
                .maybeSingle();
              if (roomData) {
                setPendingRejoin({
                  roomId: presence.roomId,
                  role: presence.role || 'host',
                  timeLeft: Math.ceil((GRACE_PERIOD_MS - elapsed) / 1000),
                });
              } else {
                localStorage.removeItem(LOBBY_ROOM_STORAGE_KEY);
              }
            } else {
              localStorage.removeItem(LOBBY_ROOM_STORAGE_KEY);
            }
          }
        }
      } catch { /* ignore */ }
    })();
  }, [router]);

  const fetchPublicRooms = useCallback(async () => {
    try {
      const { data, error } = await supabaseClient.rpc('list_public_rooms');
      if (error) throw error;
      setPublicRooms(Array.isArray(data) ? data : []);
    } catch {
      // silently fail — list is optional
    } finally {
      setPublicRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPublicRooms();

    // Subscribe to realtime updates for public rooms
    const channel = supabaseClient
      .channel('public-rooms-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rooms' },
        () => {
          fetchPublicRooms();
        }
      )
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [fetchPublicRooms]);

  async function createRoom(isPublic: boolean) {
    try {
      setLoading(true);
      setError(null);
      setShowCreateModal(false);
      const { data, error } = await supabaseClient.rpc('create_lobby_room', { input_is_public: isPublic });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.id) throw new Error('Failed to create lobby room');
      router.push(`/lobby/${room.id}`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    const code = normalizeRoomCode(roomCode);
    if (!code) { setError('Enter a room code first'); return; }
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabaseClient.rpc('join_lobby_room', { input_code: code });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.id) throw new Error('Failed to join room');
      router.push(`/lobby/${room.id}`);
    } catch (err: any) {
      const msg = String(err?.message || 'Failed to join room');
      setError(msg.toLowerCase().includes('room_not_found_or_full') ? 'Room not found or full' : msg);
    } finally {
      setLoading(false);
    }
  }

  async function joinPublicRoom(roomId: string) {
    try {
      setJoiningRoomId(roomId);
      setError(null);
      const { data, error } = await supabaseClient.rpc('join_public_room', { input_room_id: roomId });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      if (!room?.id) throw new Error('Failed to join room');
      router.push(`/lobby/${room.id}`);
    } catch (err: any) {
      const msg = String(err?.message || 'Failed to join room');
      setError(msg.toLowerCase().includes('room_not_found_or_full') ? 'Room not found or already full' : msg);
    } finally {
      setJoiningRoomId(null);
    }
  }

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px', paddingTop: 'calc(var(--navbar-height) + 32px)' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '8px' }}>🏠 Lobby Room</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.95rem' }}>
            Create a room or join one. Private rooms use a code, public rooms are visible to everyone.
          </p>

          {error && (
            <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: '20px', padding: '14px 20px', color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          {/* Rejoin banner — shown when user has a room within grace period */}
          {pendingRejoin && (
            <div className="card animate-fade-in" style={{
              marginBottom: '20px',
              padding: '18px 22px',
              borderColor: 'rgba(124,58,237,0.3)',
              background: 'rgba(124,58,237,0.05)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>🔄</span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', marginBottom: '2px' }}>
                      Active Room Found
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                      You have an active room. Rejoin before it expires (~{pendingRejoin.timeLeft}s left)
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      localStorage.removeItem(LOBBY_ROOM_STORAGE_KEY);
                      router.push(`/lobby/${pendingRejoin.roomId}`);
                    }}
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    🔗 Rejoin Room
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      localStorage.removeItem(LOBBY_ROOM_STORAGE_KEY);
                      setPendingRejoin(null);
                    }}
                    style={{ padding: '10px 14px', fontSize: '0.85rem' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Create Room */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎮</div>
              <h2 className="heading" style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Create Room</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', flex: 1 }}>
                Choose private (code) or public (lobby list) room.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Creating...' : '✨ Create Room'}
              </button>
            </div>

            {/* Join Room */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🔗</div>
              <h2 className="heading" style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Join Room</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', flex: 1 }}>
                Enter the 6-character room code.
              </p>
              <input
                className="input"
                placeholder="ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.35em', textAlign: 'center', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '12px' }}
              />
              <button
                className="btn btn-secondary"
                onClick={joinRoom}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Joining...' : '🚪 Join Lobby'}
              </button>
            </div>
          </div>

          {/* ── Public Rooms List ─────────────────────────── */}
          <div style={{ marginTop: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 className="heading" style={{ fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🌐 Public Rooms
              </h2>
              <button
                className="btn btn-ghost"
                onClick={fetchPublicRooms}
                style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              >
                🔄 Refresh
              </button>
            </div>

            {publicRoomsLoading ? (
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                <div className="animate-spin-slow" style={{ width: 28, height: 28, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%' }} />
              </div>
            ) : publicRooms.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '12px', opacity: 0.6 }}>🏜️</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '4px' }}>No public rooms available</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', opacity: 0.7 }}>Create one and wait for an opponent!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {publicRooms.map((room) => (
                  <div
                    key={room.id}
                    className="card card-hover"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '16px 20px',
                      gap: '16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
                      {/* Avatar circle */}
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))',
                        border: '2px solid rgba(124,58,237,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-heading)',
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: '#a78bfa',
                        flexShrink: 0,
                      }}>
                        {room.host_username?.[0]?.toUpperCase() || '?'}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-heading)',
                          fontWeight: 700,
                          fontSize: '1rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {room.host_username}
                        </div>
                        <div style={{
                          color: 'var(--text-muted)',
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '2px',
                        }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'rgba(124,58,237,0.1)',
                            border: '1px solid rgba(124,58,237,0.15)',
                            fontSize: '0.72rem',
                            fontFamily: 'var(--font-heading)',
                            fontWeight: 600,
                            letterSpacing: '0.15em',
                            color: '#a78bfa',
                          }}>
                            {room.room_code}
                          </span>
                          <span>·</span>
                          <span>{timeAgo(room.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Waiting pulse indicator */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: 'var(--color-success)',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}>
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--color-success)',
                        boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                        animation: 'pulse-glow-green 2s ease-in-out infinite',
                      }} />
                      Waiting
                    </div>

                    <button
                      className="btn btn-success"
                      onClick={() => joinPublicRoom(room.id)}
                      disabled={!!joiningRoomId}
                      style={{ padding: '10px 20px', fontSize: '0.9rem', flexShrink: 0 }}
                    >
                      {joiningRoomId === room.id ? 'Joining...' : '⚔️ Join'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Room Modal ───────────────────────────── */}
      {showCreateModal && (
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
          onClick={() => setShowCreateModal(false)}
        >
          {/* Backdrop */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }} />

          {/* Modal */}
          <div
            className="animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '480px',
              background: 'var(--bg-layer-2)',
              border: '1px solid var(--card-border)',
              borderRadius: '20px',
              padding: '32px',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 60px rgba(124,58,237,0.08)',
            }}
          >
            <h2 className="heading" style={{ fontSize: '1.5rem', marginBottom: '6px', textAlign: 'center' }}>
              Choose Room Type
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', textAlign: 'center', marginBottom: '24px' }}>
              How would you like opponents to find your room?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Private Room */}
              <button
                className="card card-hover"
                onClick={() => createRoom(false)}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: '1px solid rgba(245,158,11,0.2)',
                  background: 'rgba(245,158,11,0.03)',
                  width: '100%',
                }}
              >
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))',
                  border: '1px solid rgba(245,158,11,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
                }}>
                  🔒
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px', color: 'var(--accent-gold-light)' }}>
                    Private Room
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.4 }}>
                    Generate a room code and share it with your friend to join.
                  </div>
                </div>
              </button>

              {/* Public Room */}
              <button
                className="card card-hover"
                onClick={() => createRoom(true)}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  padding: '20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: '1px solid rgba(124,58,237,0.2)',
                  background: 'rgba(124,58,237,0.03)',
                  width: '100%',
                }}
              >
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(124,58,237,0.05))',
                  border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  flexShrink: 0,
                }}>
                  🌐
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px', color: 'var(--accent-violet-light)' }}>
                    Public Room
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.4 }}>
                    Your room will be visible in the lobby for anyone to join.
                  </div>
                </div>
              </button>
            </div>

            <button
              className="btn btn-ghost"
              onClick={() => setShowCreateModal(false)}
              style={{ width: '100%', marginTop: '16px' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
