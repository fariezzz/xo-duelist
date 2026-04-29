"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseClient } from '../../lib/supabase';
import Navbar from '../../components/Navbar';

function normalizeRoomCode(value: string) {
  return value.replace(/\s+/g, '').toUpperCase().slice(0, 6);
}

export default function LobbyPage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!data.session) router.push('/');
    })();
  }, [router]);

  async function createRoom() {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabaseClient.rpc('create_lobby_room');
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

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ padding: '32px 24px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h1 className="heading" style={{ fontSize: '2rem', marginBottom: '8px' }}>🏠 Lobby Room</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '28px', fontSize: '0.95rem' }}>
            Create a private room or join one with a code.
          </p>

          {error && (
            <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)', marginBottom: '20px', padding: '14px 20px', color: '#ef4444', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Create Room */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: '2rem', marginBottom: '12px' }}>🎮</div>
              <h2 className="heading" style={{ fontSize: '1.3rem', marginBottom: '8px' }}>Create Room</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', flex: 1 }}>
                Generate a room code and share it with your opponent.
              </p>
              <button
                className="btn btn-primary"
                onClick={createRoom}
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
        </div>
      </div>
    </>
  );
}
