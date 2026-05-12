"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  DoorOpen,
  Gamepad2,
  Globe,
  Link2,
  Lock,
  RefreshCw,
  Sparkles,
  Swords,
} from 'lucide-react';
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

export default function LobbyPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState<PublicRoom[]>([]);
  const [publicRoomsLoading, setPublicRoomsLoading] = useState(true);
  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session) { router.push('/'); return; }
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
      <div className="page-container animate-fade-in" style={{ paddingTop: 'calc(var(--navbar-height) + 24px)', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>

          {/* ── Hero Header ─────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 className="heading" style={{ fontSize: '1.8rem', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Swords size={24} strokeWidth={2.35} aria-hidden="true" /> Lobby
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                Create a room or join one — public rooms are visible below.
              </p>
            </div>
            {/* Live room count badge */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 16px', borderRadius: '20px', fontSize: '0.82rem',
              background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)',
              fontFamily: 'var(--font-heading)', fontWeight: 700, color: '#10b981',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: '#10b981',
                boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                animation: 'pulse-glow-green 2s ease-in-out infinite', display: 'inline-block',
              }} />
              {publicRooms.length} room{publicRooms.length !== 1 ? 's' : ''} open
            </div>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 18px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.88rem' }}>
              {error}
            </div>
          )}

          {/* ── Action Cards: Create + Join ────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '24px' }}>

            {/* Create Room */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              {/* Decorative gradient corner */}
              <div style={{
                position: 'absolute', top: 0, right: 0, width: '120px', height: '120px',
                background: 'radial-gradient(circle at top right, rgba(124,58,237,0.12), transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.12))',
                  border: '1px solid rgba(124,58,237,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4b5fd', flexShrink: 0,
                }}>
                  <Gamepad2 size={22} strokeWidth={2.35} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="heading" style={{ fontSize: '1.1rem', margin: 0 }}>Create Room</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>Private or public</p>
                </div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
                disabled={loading}
                style={{ width: '100%', marginTop: 'auto', padding: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
              >
                {loading ? 'Creating...' : (
                  <>
                    <Sparkles size={16} strokeWidth={2.35} aria-hidden="true" />
                    Create Room
                  </>
                )}
              </button>
            </div>

            {/* Join Room */}
            <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: 0, right: 0, width: '120px', height: '120px',
                background: 'radial-gradient(circle at top right, rgba(245,158,11,0.1), transparent 70%)',
                pointerEvents: 'none',
              }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                <div style={{
                  width: '42px', height: '42px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(239,68,68,0.08))',
                  border: '1px solid rgba(245,158,11,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fbbf24', flexShrink: 0,
                }}>
                  <Link2 size={22} strokeWidth={2.35} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="heading" style={{ fontSize: '1.1rem', margin: 0 }}>Join Room</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', margin: 0 }}>Enter 6-char code</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                <input
                  className="input"
                  placeholder="ABC123"
                  value={roomCode}
                  onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                  maxLength={6}
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                  style={{
                    textTransform: 'uppercase', letterSpacing: '0.3em', textAlign: 'center',
                    fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem',
                    flex: 1, padding: '10px 8px',
                  }}
                />
                <button
                  className="btn btn-secondary"
                  onClick={joinRoom}
                  disabled={loading || !roomCode}
                  style={{ padding: '10px 18px', fontWeight: 700, flexShrink: 0 }}
                >
                  {loading ? '...' : <ArrowRight size={18} strokeWidth={2.35} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </div>

          {/* ── Public Rooms ─────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 className="heading" style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={18} strokeWidth={2.35} aria-hidden="true" />
                Public Rooms
              </h2>
              <button
                className="btn btn-ghost"
                onClick={fetchPublicRooms}
                style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={14} strokeWidth={2.35} aria-hidden="true" />
                Refresh
              </button>
            </div>

            {publicRoomsLoading ? (
              <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                <div className="animate-spin-slow" style={{ width: 28, height: 28, border: '3px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%' }} />
              </div>
            ) : publicRooms.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '36px 24px' }}>
                <div style={{ width: 48, height: 48, margin: '0 auto 8px', opacity: 0.55, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '14px', background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                  <Globe size={28} strokeWidth={2.35} aria-hidden="true" />
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '4px', fontFamily: 'var(--font-heading)', fontWeight: 600 }}>No public rooms available</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', opacity: 0.6, margin: 0 }}>Create a public room and wait for challengers!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {publicRooms.map((room) => (
                  <div
                    key={room.id}
                    className="card card-hover"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 18px', gap: '14px',
                    }}
                  >
                    <div
                      className="lobby-host-link"
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, cursor: 'pointer' }}
                      onClick={() => router.push(`/profile/${encodeURIComponent(room.host_username)}`)}
                      title={`View ${room.host_username}'s profile`}
                    >
                      {/* Avatar */}
                      <div className="lobby-host-avatar" style={{
                        width: '38px', height: '38px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(245,158,11,0.2))',
                        border: '2px solid rgba(124,58,237,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.9rem', color: '#a78bfa', flexShrink: 0,
                        transition: 'transform 0.15s, border-color 0.2s',
                      }}>
                        {room.host_username?.[0]?.toUpperCase() || '?'}
                      </div>

                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="lobby-host-name" style={{
                            fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            transition: 'color 0.2s',
                          }}>
                            {room.host_username}
                          </span>
                          <span style={{
                            padding: '1px 7px', borderRadius: '6px', fontSize: '0.68rem',
                            background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.15)',
                            fontFamily: 'var(--font-heading)', fontWeight: 600, letterSpacing: '0.12em', color: '#a78bfa',
                          }}>
                            {room.room_code}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '2px' }}>
                          {timeAgo(room.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Waiting pulse */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      color: 'var(--color-success)', fontSize: '0.72rem',
                      fontFamily: 'var(--font-heading)', fontWeight: 600, flexShrink: 0,
                    }}>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', background: 'var(--color-success)',
                        boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                        animation: 'pulse-glow-green 2s ease-in-out infinite',
                      }} />
                      Open
                    </div>

                    <button
                      className="btn btn-success"
                      onClick={() => joinPublicRoom(room.id)}
                      disabled={!!joiningRoomId}
                      style={{ padding: '8px 18px', fontSize: '0.85rem', flexShrink: 0, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      {joiningRoomId === room.id ? '...' : (
                        <>
                          <Swords size={15} strokeWidth={2.35} aria-hidden="true" />
                          Join
                        </>
                      )}
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
                  color: 'var(--accent-gold-light)',
                  flexShrink: 0,
                }}>
                  <Lock size={26} strokeWidth={2.35} aria-hidden="true" />
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
                  color: 'var(--accent-violet-light)',
                  flexShrink: 0,
                }}>
                  <Globe size={26} strokeWidth={2.35} aria-hidden="true" />
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
              style={{ width: '100%', marginTop: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
            >
              <DoorOpen size={16} strokeWidth={2.35} aria-hidden="true" />
              Cancel
            </button>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .lobby-host-link:hover .lobby-host-avatar {
          transform: scale(1.08);
          border-color: rgba(167, 139, 250, 0.5) !important;
        }
        
        .lobby-host-link:hover .lobby-host-name {
          color: #a78bfa !important;
        }
      `}</style>
    </>
  );
}
