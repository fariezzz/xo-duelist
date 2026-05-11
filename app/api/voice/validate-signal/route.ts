import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

type VoiceSignalKind = 'offer' | 'answer' | 'ice-candidate';

type VoiceSignalPayload = {
  roomId: string;
  from: string;
  to: string;
  signal: VoiceSignalKind;
};

type RoomRecord = {
  status: string | null;
  player1_id: string | null;
  player2_id: string | null;
};

function readBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const prefix = 'bearer ';
  if (!authorizationHeader.toLowerCase().startsWith(prefix)) return null;
  const token = authorizationHeader.slice(prefix.length).trim();
  return token || null;
}

function isVoiceSignalKind(value: unknown): value is VoiceSignalKind {
  return value === 'offer' || value === 'answer' || value === 'ice-candidate';
}

function parsePayload(value: unknown): VoiceSignalPayload | null {
  if (!value || typeof value !== 'object') return null;

  const payload = value as Record<string, unknown>;
  if (
    typeof payload.roomId !== 'string' ||
    typeof payload.from !== 'string' ||
    typeof payload.to !== 'string' ||
    !isVoiceSignalKind(payload.signal) ||
    payload.from === payload.to
  ) {
    return null;
  }

  return {
    roomId: payload.roomId,
    from: payload.from,
    to: payload.to,
    signal: payload.signal,
  };
}

function validateSignal(callerId: string, room: RoomRecord, payload: VoiceSignalPayload) {
  const roomIsVoiceReady = room.status === 'waiting' || room.status === 'ongoing';
  if (!roomIsVoiceReady || !room.player1_id || !room.player2_id) return false;
  if (callerId !== payload.from) return false;

  const fromPlayer1 = payload.from === room.player1_id && payload.to === room.player2_id;
  const fromPlayer2 = payload.from === room.player2_id && payload.to === room.player1_id;
  if (!fromPlayer1 && !fromPlayer2) return false;

  if (payload.signal === 'offer') return fromPlayer1;
  if (payload.signal === 'answer') return fromPlayer2;
  return true;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { valid: false, error: 'Server auth configuration is incomplete.' },
      { status: 500 }
    );
  }

  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return NextResponse.json({ valid: false, error: 'Missing authorization token.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return NextResponse.json({ valid: false, error: 'Invalid voice signal payload.' }, { status: 400 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ valid: false, error: 'Not authenticated.' }, { status: 401 });
  }

  const { data: userRoom, error: userRoomError } = await userClient
    .from('game_rooms')
    .select('status, player1_id, player2_id')
    .eq('id', payload.roomId)
    .maybeSingle<RoomRecord>();

  let room = userRoom;
  let roomError = userRoomError;

  if (roomError && serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const adminResult = await adminClient
      .from('game_rooms')
      .select('status, player1_id, player2_id')
      .eq('id', payload.roomId)
      .maybeSingle<RoomRecord>();

    room = adminResult.data;
    roomError = adminResult.error;
  }

  if (roomError) {
    return NextResponse.json({
      valid: false,
      error: 'Failed to validate room.',
    });
  }

  if (!room) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: validateSignal(userData.user.id, room, payload),
  });
}
