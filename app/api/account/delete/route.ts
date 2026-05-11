import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function readBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const prefix = 'bearer ';
  if (!authorizationHeader.toLowerCase().startsWith(prefix)) return null;
  const token = authorizationHeader.slice(prefix.length).trim();
  return token || null;
}

export async function DELETE(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: 'Server auth configuration is incomplete.' },
      { status: 500 }
    );
  }

  const accessToken = readBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return NextResponse.json({ error: 'Missing or invalid authorization token.' }, { status: 401 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
  if (deleteError) {
    return NextResponse.json(
      { error: deleteError.message || 'Failed to delete auth user.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
