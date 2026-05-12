"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  DoorOpen,
  Globe,
  Hourglass,
  Lock,
  LogOut,
  Radio,
  Rocket,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react';
import { supabaseClient } from '../../../lib/supabase';
import Navbar from '../../../components/Navbar';
import { useLobbyPresence, type LobbyPresenceEvent } from '../../../hooks/useLobbyPresence';
import VoiceChat from '../../../components/VoiceChat';



function toLobbyErrorMessage(err: unknown, fallback: string): string {
  const raw = String((err as any)?.message || fallback);
  const msg = raw.toLowerCase();

  if (msg.includes('room_finished')) return 'Previous match is already finished. Click Back to Lobby from the result screen to reset the room.';
  if (msg.includes('room_not_found_or_full')) return 'Room not found or already full.';
  if (msg.includes('room_not_found')) return 'Room not found.';
  if (msg.includes('players_not_ready')) return 'All players must be READY first.';
  if (msg.includes('not_participant')) return 'You are not a participant in this room.';
  if (msg.includes('not_host')) return 'Only host can start the game.';
  if (msg.includes('room_not_waiting')) return 'Room is not in waiting state.';

  return raw;
}

type LobbyProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function LobbyPlayerCard({
  role,
  name,
  avatarUrl,
  ready,
  empty,
}: {
  role: string;
  name: string;
  avatarUrl: string | null;
  ready: boolean;
  empty?: boolean;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: "12px",
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: "50%",
            overflow: "hidden",
            background: avatarUrl
              ? "transparent"
              : "linear-gradient(135deg, #7c3aed, #f59e0b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "white",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "0.9rem",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          ) : (
            getInitials(name)
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "3px",
            }}
          >
            {role}
          </div>

          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              color: empty ? "var(--text-muted)" : "var(--text-primary)",
              fontSize: "0.95rem",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: 170,
            }}
          >
            {name}
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: "0.78rem",
          color: empty ? "var(--text-muted)" : ready ? "#10b981" : "#cbd5e1",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {empty ? (
  <>
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#94a3b8",
        display: "inline-block",
      }}
    />
    Waiting
  </>
) : ready ? (
  <>
    <CheckCircle2 size={15} strokeWidth={2.35} aria-hidden="true" />
    Ready
  </>
) : (
  <>
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: "#ef4444",
        display: "inline-block",
        boxShadow: "0 0 10px rgba(239, 68, 68, 0.45)",
      }}
    />
    Not Ready
  </>
)}
      </div>
    </div>
  );
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
  const [meUsername, setMeUsername] = useState('');


  const [playerProfiles, setPlayerProfiles] = useState<{
    host: LobbyProfile | null;
    guest: LobbyProfile | null;
  }>({
    host: null,
    guest: null,
  });

  const roomCode = useMemo(() => room?.room_code || '', [room]);
  const isPublicRoom = !!room?.is_public;

  // Refs for latest values
  const roomRef = useRef(room);
  useEffect(() => { roomRef.current = room; }, [room]);



  const loadLobbyProfiles = useCallback(async (roomData: any) => {
    const ids = [roomData.player1_id, roomData.player2_id].filter(Boolean);

    if (ids.length === 0) {
      setPlayerProfiles({ host: null, guest: null });
      return;
    }

    const { data } = await supabaseClient
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", ids);

    const rows = (data ?? []) as LobbyProfile[];

    setPlayerProfiles({
      host: rows.find((p) => p.id === roomData.player1_id) ?? null,
      guest: rows.find((p) => p.id === roomData.player2_id) ?? null,
    });
  }, []);

  // ── Presence event handler (runs on OTHER player's client) ────
  const handlePresenceEvent = useCallback(async (event: LobbyPresenceEvent) => {
    const currentRoom = roomRef.current;
    if (!currentRoom) return;

    if (event.type === 'player_joined') {
      console.log(`${event.player.username} joined the room`);
      return;
    }

    if (event.type === 'guest_left') {
      // Guest disconnected → remove guest from room, reset ready states
      await supabaseClient
        .from('game_rooms')
        .update({
          player2_id: null,
          player1_ready: false,
          player2_ready: false,
          status: 'waiting',
        })
        .eq('id', roomId)
        .eq('status', 'waiting');

      console.log('Opponent left the room');
    }

    if (event.type === 'host_left') {
      // Host disconnected → cancel the room
      await supabaseClient
        .from('game_rooms')
        .update({ status: 'cancelled' })
        .eq('id', roomId)
        .in('status', ['waiting']);

      console.log('Host left the room');
      setTimeout(() => router.push('/lobby'), 2000);
    }
  }, [roomId, router]);

  // Determine host/guest for presence
  const isHost = !!meId && room?.player1_id === meId;

  // ── Presence hook — the ONLY disconnect detection mechanism ────
  const { disconnect } = useLobbyPresence({
    roomId: room?.status === 'waiting' ? roomId : '',
    userId: meId ?? '',
    username: meUsername,
    isHost,
    onEvent: handlePresenceEvent,
  });

  // ── Main data fetch + postgres realtime subscription ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const { data: sessionData } = await supabaseClient.auth.getSession();
        if (!sessionData.session) { router.push('/'); return; }
        const myId = sessionData.session.user.id;
        setMeId(myId);

        // Fetch username for presence tracking
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('username')
          .eq('id', myId)
          .maybeSingle();
        if (profile?.username) setMeUsername(profile.username);

        const { data, error } = await supabaseClient.from('game_rooms').select('*').eq('id', roomId).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Lobby not found — it may have expired.');

        // Check if room is cancelled/finished already
        if (data.status === 'cancelled') {
          if (!cancelled) setRoomCancelled(true);
          return;
        }

        if (!cancelled) {
          setRoom(data);
          void loadLobbyProfiles(data);
        }
      } catch (err: any) {
        if (!cancelled) setError(toLobbyErrorMessage(err, 'Failed to load lobby'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Subscribe to DB changes for this room (ready state, status, etc.)
    const channel = supabaseClient
      .channel(`lobby-db-${roomId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, (payload: any) => {
        const updated = payload.new || payload.record;
        if (!updated) return;
        setRoom(updated);
        void loadLobbyProfiles(updated);

        if (updated.status === 'ongoing' && updated.player2_id) {
          disconnect();
          // Clear the intro-seen flag so the cinematic plays on every new match
          try { sessionStorage.removeItem(`bi-seen-${updated.id}`); } catch { /* ignore */ }
          router.replace(`/game/${updated.id}?intro=1`);
        }
        if (updated.status === 'cancelled') {
          disconnect();
          setRoomCancelled(true);
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'game_rooms', filter: `id=eq.${roomId}` }, () => {
        disconnect();
        setRoomCancelled(true);
      })
      .subscribe();

    return () => { cancelled = true; supabaseClient.removeChannel(channel); };
  }, [roomId, router, loadLobbyProfiles, disconnect]);

  // ── Actions ───────────────────────────────────────────────────

  async function cancelRoom() {
    try {
      if (!room?.id) return;
      setShowConfirm(null);
      disconnect(); // triggers leave event on opponent
      const { error } = await supabaseClient.rpc('cancel_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      setRoomCancelled(true);
    } catch (err: any) { setError(toLobbyErrorMessage(err, 'Failed to cancel room')); }
  }

  async function exitRoom() {
    try {
      if (!room?.id) return;
      setShowConfirm(null);
      disconnect(); // triggers leave event on host
      const { error } = await supabaseClient.rpc('leave_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      setLeftRoom(true);
    } catch (err: any) { setError(toLobbyErrorMessage(err, 'Failed to leave room')); }
  }

  async function toggleReady() {
    try {
      if (!room?.id) return;
      setReadyLoading(true);
      if (!meId) throw new Error('Session not found');
      const amHost = room.player1_id === meId;
      const currentReady = amHost ? room.player1_ready : room.player2_ready;
      const { error } = await supabaseClient.rpc('set_lobby_ready', { input_room_id: room.id, input_ready: !currentReady });
      if (error) throw error;
    } catch (err: any) { setError(toLobbyErrorMessage(err, 'Failed to update ready')); }
    finally { setReadyLoading(false); }
  }

  async function startRoom() {
    try {
      if (!room?.id || !meId || room.player1_id !== meId) return;
      setStartLoading(true);
      const { error } = await supabaseClient.rpc('start_lobby_room', { input_room_id: room.id });
      if (error) throw error;
      // Game started → redirect handled by realtime UPDATE subscription (includes ?intro=1)
    } catch (err: any) {
      setError(toLobbyErrorMessage(err, 'Failed to start game'));
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
      <div className="page-container animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', borderColor: 'rgba(239,68,68,0.2)' }}>
          <div style={{ width: 58, height: 58, margin: '0 auto 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '18px', color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Ban size={32} strokeWidth={2.35} aria-hidden="true" />
          </div>
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
              Back to Lobby
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%' }}
            >
              Home
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (leftRoom) return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }}>
        <div className="card" style={{ maxWidth: '420px', width: '100%', textAlign: 'center', borderColor: 'rgba(245,158,11,0.2)' }}>
          <div style={{ width: 58, height: 58, margin: '0 auto 16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '18px', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <LogOut size={32} strokeWidth={2.35} aria-hidden="true" />
          </div>
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
              Back to Lobby
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              style={{ width: '100%' }}
            >
              Home
            </button>
          </div>
        </div>
      </div>
    </>
  );

  if (error && !room) return (
    <>
      <Navbar />
      <div className="page-container" style={{ paddingTop: 'calc(var(--navbar-height) + 32px)', paddingRight: '32px', paddingBottom: '32px', paddingLeft: '32px' }}>
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto', borderColor: 'rgba(239,68,68,0.3)' }}>
          <p style={{ color: '#ef4444' }}>{error}</p>
        </div>
      </div>
    </>
  );

  if (!room) return null;

  const opponentId = isHost ? room.player2_id : room.player1_id;
  const hostReady = !!room.player1_ready;
  const guestReady = !!room.player2_ready;
  const myReady = isHost ? hostReady : guestReady;
  const canStart = isHost && hostReady && guestReady && room.player2_id;

  const hostName =
    playerProfiles.host?.username ??
    (room.player1_id === meId ? "You" : "Host");

  const guestName = room.player2_id
    ? playerProfiles.guest?.username ?? (room.player2_id === meId ? "You" : "Guest")
    : "Waiting for player";

  return (
    <>
      <Navbar />
      <div className="page-container animate-fade-in" style={{ paddingTop: 'calc(var(--navbar-height) + 24px)', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }}>
        <div style={{ maxWidth: '820px', margin: '0 auto' }}>

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 className="heading" style={{ fontSize: '1.6rem', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Hourglass size={22} strokeWidth={2.35} aria-hidden="true" />
                Waiting Room
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                {isPublicRoom ? 'Visible in lobby — anyone can join.' : 'Share the code to invite a friend.'}
              </p>
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '5px 14px', borderRadius: '20px', fontSize: '0.75rem',
              fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              ...(isPublicRoom
                ? { background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }
                : { background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24' }
              ),
            }}>
              {isPublicRoom ? (
                <>
                  <Globe size={14} strokeWidth={2.35} aria-hidden="true" />
                  Public
                </>
              ) : (
                <>
                  <Lock size={14} strokeWidth={2.35} aria-hidden="true" />
                  Private
                </>
              )}
            </span>
          </div>

          {error && (
            <div style={{ marginBottom: '16px', padding: '12px 18px', borderRadius: '12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: '0.88rem' }}>
              {error}
            </div>
          )}

          {/* ── Two-Column Layout ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '16px', alignItems: 'start' }}>

            {/* LEFT — Room Info */}
            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>

              {/* Room Code / Public Info header bar */}
              {!isPublicRoom ? (
                <div style={{
                  padding: '16px 20px',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(245,158,11,0.05))',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Room Code</div>
                    <div style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.5rem', letterSpacing: '0.3em',
                      color: '#a78bfa', textShadow: '0 0 20px rgba(124,58,237,0.3)',
                    }}>{roomCode}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={copyCode} style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {copied ? (
                      <>
                        <Check size={14} strokeWidth={2.35} aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={14} strokeWidth={2.35} aria-hidden="true" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div style={{
                  padding: '14px 20px',
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(16,185,129,0.04))',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: 'var(--text-muted)',
                }}>
                  <Radio size={16} strokeWidth={2.35} aria-hidden="true" />
                  Visible in the lobby — anyone can join
                </div>
              )}

              {/* Status chips */}
              <div style={{ padding: '16px 20px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  {[
                    { label: 'Status', value: room.status, color: room.status === 'waiting' ? '#fbbf24' : '#10b981', joined: false },
                    { label: 'Opponent', value: room.player2_id ? 'Joined' : 'Waiting...', color: room.player2_id ? '#10b981' : '#94a3b8', joined: !!room.player2_id },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{item.label}</div>
                      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.9rem', color: item.color, textTransform: 'capitalize', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                        {item.joined && <Check size={14} strokeWidth={2.35} aria-hidden="true" />}
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Players — VS style */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  <LobbyPlayerCard
                    role="Host"
                    name={hostName}
                    avatarUrl={playerProfiles.host?.avatar_url ?? null}
                    ready={hostReady}
                  />

                  {/* VS divider */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 0',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(124,58,237,0.3), transparent)' }} />
                    <span style={{
                      fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: '0.7rem', letterSpacing: '0.15em',
                      color: 'rgba(167,139,250,0.5)', textTransform: 'uppercase',
                    }}>VS</span>
                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(to right, transparent, rgba(245,158,11,0.3), transparent)' }} />
                  </div>

                  <LobbyPlayerCard
                    role="Guest"
                    name={guestName}
                    avatarUrl={playerProfiles.guest?.avatar_url ?? null}
                    ready={guestReady}
                    empty={!room.player2_id}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT — Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              {/* Voice Chat */}
              {opponentId && (
                <div style={{ marginBottom: '12px' }}>
                  <VoiceChat
                    roomId={roomId}
                    meId={meId!}
                    player1Id={room.player1_id}
                    player2Id={room.player2_id}
                    opponentId={opponentId}
                    compact
                    popoverPosition="down"
                  />
                </div>
              )}

              {/* Ready toggle — big prominent button */}
              <button
                className={`btn ${myReady ? 'btn-ghost' : 'btn-success'}`}
                onClick={toggleReady}
                disabled={readyLoading}
                style={{
                  width: '100%', padding: '18px', fontSize: '1rem',
                  borderRadius: '14px', fontWeight: 800,
                  ...(myReady ? {} : { boxShadow: '0 4px 20px rgba(16,185,129,0.25)' }),
                }}
              >
                {readyLoading ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <span className="animate-spin-slow" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                    Updating...
                  </span>
                ) : myReady ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Square size={17} strokeWidth={2.35} aria-hidden="true" />
                    Set Not Ready
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <CheckCircle2 size={17} strokeWidth={2.35} aria-hidden="true" />
                    Set Ready
                  </span>
                )}
              </button>

              {/* Start Game — only host */}
              {isHost && (
                <button
                  className="btn btn-primary btn-lg"
                  onClick={startRoom}
                  disabled={!canStart || startLoading}
                  style={{
                    width: '100%', padding: '18px', fontSize: '1rem', borderRadius: '14px',
                    fontWeight: 800, letterSpacing: '0.02em',
                    ...(canStart ? { boxShadow: '0 4px 24px rgba(124,58,237,0.35)', animation: 'pulse-glow 2s ease-in-out infinite' } : {}),
                  }}
                >
                  {startLoading ? 'Starting...' : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                      <Rocket size={17} strokeWidth={2.35} aria-hidden="true" />
                      Start Game
                    </span>
                  )}
                </button>
              )}

              {/* Ready status summary card */}
              <div style={{
                padding: '14px 16px', borderRadius: '12px',
                background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>Ready Status</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    { label: hostName, ready: hostReady, you: isHost },
                    { label: room.player2_id ? guestName : '—', ready: guestReady, you: !isHost && !!room.player2_id },
                  ].map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {p.label}
                        {p.you && <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(124,58,237,0.15)', color: '#a78bfa', fontWeight: 700 }}>YOU</span>}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.78rem',
                        color: p.ready ? '#10b981' : '#ef4444',
                        display: 'flex', alignItems: 'center', gap: '4px',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.ready ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                        {p.ready ? 'Ready' : 'Not Ready'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '2px 0' }} />

              {/* Exit / Cancel */}
              {isHost ? (
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowConfirm('cancel')}
                  style={{
                    width: '100%', padding: '12px', fontSize: '0.88rem', borderRadius: '12px',
                    color: '#ef4444', borderColor: 'rgba(239,68,68,0.2)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                    <X size={15} strokeWidth={2.35} aria-hidden="true" />
                    Cancel Room
                  </span>
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowConfirm('exit')}
                  style={{
                    width: '100%', padding: '12px', fontSize: '0.88rem', borderRadius: '12px',
                    color: '#f59e0b', borderColor: 'rgba(245,158,11,0.2)',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                    <DoorOpen size={15} strokeWidth={2.35} aria-hidden="true" />
                    Exit Room
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 680px) {
          div[style*="gridTemplateColumns: '1fr 300px'"],
          div[style*="grid-template-columns"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>


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
            <div style={{
              width: 54,
              height: 54,
              margin: '0 auto 12px',
              borderRadius: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: showConfirm === 'cancel' ? '#f59e0b' : '#fbbf24',
              background: showConfirm === 'cancel' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.22)',
            }}>
              {showConfirm === 'cancel' ? (
                <TriangleAlert size={30} strokeWidth={2.35} aria-hidden="true" />
              ) : (
                <LogOut size={30} strokeWidth={2.35} aria-hidden="true" />
              )}
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

