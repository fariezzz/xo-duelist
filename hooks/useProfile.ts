"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseClient } from '../lib/supabase';
import { getAuthRedirectUrl } from '../lib/auth-redirect';
import type { UserIdentity } from '@supabase/supabase-js';

export type ManagedProvider = 'google' | 'github' | 'discord';

export interface LinkedAccount {
  provider: string;
  identityId: string | null;
  identifier: string | null;
  avatarUrl: string | null;
}

export interface ProfileData {
  id: string;
  username: string;
  elo_rating: number;
  wins: number;
  losses: number;
  draws: number;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  updated_at: string | null;
  email: string;
  linkedAccounts: LinkedAccount[];
  rank: number | null;
  totalPlayers: number;
}

interface UsernameCheck {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same';
  message: string;
}

function mapEmailUpdateError(rawError: unknown): string {
  const message = rawError && typeof rawError === 'object' && 'message' in rawError
    ? String((rawError as { message?: unknown }).message ?? '')
    : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('already been registered') || normalized.includes('already registered')) {
    return 'That email is already in use by another account.';
  }
  if (normalized.includes('unable to validate email address') || normalized.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (normalized.includes('same as the old email') || normalized.includes('already your current email')) {
    return 'Please use a different email address from your current one.';
  }
  if (normalized.includes('for security purposes') || normalized.includes('rate limit')) {
    return 'Too many email change attempts. Please wait a few minutes and try again.';
  }
  if (normalized.includes('smtp') || normalized.includes('error sending confirmation email')) {
    return 'Could not send confirmation email right now. Please try again later.';
  }
  if (normalized.includes('redirect') && normalized.includes('not allowed')) {
    return 'Email confirmation redirect is not allowed. Contact support to update auth redirect settings.';
  }

  return message || 'Failed to update email';
}

function normalizeProvider(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readIdentityField(identityData: Record<string, unknown> | null, keys: string[]): string | null {
  if (!identityData) return null;
  for (const key of keys) {
    const value = identityData[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getProviderIdentifier(provider: string, identityData: Record<string, unknown> | null, userEmail: string | null): string | null {
  if (provider === 'google') {
    return readIdentityField(identityData, ['email']) ?? userEmail;
  }

  if (provider === 'github') {
    return readIdentityField(identityData, ['user_name', 'preferred_username', 'login', 'name', 'full_name']) ??
      readIdentityField(identityData, ['email']) ??
      userEmail;
  }

  if (provider === 'discord') {
    return readIdentityField(identityData, ['preferred_username', 'user_name', 'global_name', 'name', 'full_name']) ??
      readIdentityField(identityData, ['email']) ??
      userEmail;
  }

  if (provider === 'email') {
    return readIdentityField(identityData, ['email']) ?? userEmail;
  }

  return readIdentityField(identityData, ['email', 'user_name', 'preferred_username', 'name', 'full_name', 'sub']) ??
    userEmail;
}

function getProviderAvatarUrl(identityData: Record<string, unknown> | null): string | null {
  return readIdentityField(identityData, [
    'avatar_url',
    'picture',
    'photo_url',
    'image',
    'profile_image_url',
  ]);
}

function normalizeAvatarUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let normalized = value.trim();
  if (!normalized) return null;

  normalized = normalized.replace(/^"+|"+$/g, '');

  const lower = normalized.toLowerCase();
  if (lower === 'null' || lower === 'undefined' || lower === 'none' || lower === 'n/a') {
    return null;
  }

  if (!/^https?:\/\//i.test(normalized)) {
    return null;
  }

  // Google profile URLs may include duplicated trailing size params that can 400.
  if (/googleusercontent\.com/i.test(normalized)) {
    normalized = normalized.replace(/=([^=/?#]+)=([^=/?#]+)$/, '=$1');
  }

  return normalized;
}

function getLinkedAvatarFallback(linkedAccounts: LinkedAccount[]): string | null {
  for (const account of linkedAccounts) {
    const avatarUrl = normalizeAvatarUrl(account.avatarUrl);
    if (avatarUrl) return avatarUrl;
  }
  return null;
}

function getProviderOrder(provider: string): number {
  const priority = ['email', 'google', 'github', 'discord', 'apple'];
  const index = priority.indexOf(provider);
  return index === -1 ? priority.length : index;
}

function parseIdentityTimestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getIdentityRecencyScore(identity: UserIdentity): number {
  return Math.max(
    parseIdentityTimestamp(identity.last_sign_in_at),
    parseIdentityTimestamp(identity.updated_at),
    parseIdentityTimestamp(identity.created_at),
  );
}

function buildLinkedAccounts(user: {
  email?: string | null;
  identities?: UserIdentity[] | null;
  app_metadata?: { provider?: unknown; providers?: unknown } | null;
}, identityListFromApi: UserIdentity[] | null): LinkedAccount[] {
  type LinkedAccountCandidate = LinkedAccount & { recency: number };

  const userEmail = typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null;
  const identities = identityListFromApi ?? user.identities ?? [];
  const accountMap = new Map<string, LinkedAccountCandidate>();

  for (const identity of identities) {
    const provider = normalizeProvider(identity.provider);
    if (!provider) continue;

    const identityData = identity.identity_data && typeof identity.identity_data === 'object'
      ? identity.identity_data as Record<string, unknown>
      : null;
    const identityId = typeof identity.identity_id === 'string' && identity.identity_id.trim()
      ? identity.identity_id.trim()
      : null;
    const identifier = getProviderIdentifier(provider, identityData, userEmail);
    const avatarUrl = getProviderAvatarUrl(identityData);
    const recency = getIdentityRecencyScore(identity);
    const existing = accountMap.get(provider);
    const shouldReplace = !existing ||
      recency > existing.recency ||
      (!existing.identityId && !!identityId) ||
      (!existing.identifier && !!identifier);

    if (shouldReplace) {
      accountMap.set(provider, {
        provider,
        identityId,
        identifier,
        avatarUrl,
        recency,
      });
    }
  }

  const appProviders = new Set<string>();
  const rootProvider = normalizeProvider(user.app_metadata?.provider);
  if (rootProvider) appProviders.add(rootProvider);

  if (Array.isArray(user.app_metadata?.providers)) {
    for (const provider of user.app_metadata?.providers) {
      const normalized = normalizeProvider(provider);
      if (normalized) appProviders.add(normalized);
    }
  }

  for (const provider of appProviders) {
    if (!accountMap.has(provider)) {
      accountMap.set(provider, {
        provider,
        identityId: null,
        identifier: provider === 'google' || provider === 'email' ? userEmail : null,
        avatarUrl: null,
        recency: -1,
      });
    }
  }

  if (!accountMap.has('email') && userEmail) {
    accountMap.set('email', {
      provider: 'email',
      identityId: null,
      identifier: userEmail,
      avatarUrl: null,
      recency: -1,
    });
  }

  return Array.from(accountMap.values()).map(({ recency: _recency, ...account }) => account).sort((a, b) => {
    const orderDiff = getProviderOrder(a.provider) - getProviderOrder(b.provider);
    if (orderDiff !== 0) return orderDiff;
    return a.provider.localeCompare(b.provider);
  });
}

function mapIdentityActionError(rawError: unknown, action: 'link' | 'unlink'): string {
  const message = rawError && typeof rawError === 'object' && 'message' in rawError
    ? String((rawError as { message?: unknown }).message ?? '')
    : '';
  const normalized = message.toLowerCase();

  if (action === 'unlink' && normalized.includes('at least 2 identities')) {
    return 'You need at least one other sign-in method before disconnecting this account.';
  }
  if (normalized.includes('enable manual linking')) {
    return 'Manual account linking is disabled in Supabase Auth settings.';
  }
  if (normalized.includes('already linked') || normalized.includes('identity already exists')) {
    return 'That account is already linked to a user.';
  }
  if (normalized.includes('not found') || normalized.includes('identity does not exist')) {
    return 'The selected linked account was not found. Please refresh and try again.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (normalized.includes('provider') && normalized.includes('disabled')) {
    return 'This provider is disabled in authentication settings.';
  }

  if (action === 'link') {
    return message || 'Failed to connect account';
  }
  return message || 'Failed to disconnect account';
}

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usernameCheck, setUsernameCheck] = useState<UsernameCheck>({ status: 'idle', message: '' });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabaseClient.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

      const uid = sessionData.session.user.id;
      const [{ data: userData }, identitiesResult] = await Promise.all([
        supabaseClient.auth.getUser(),
        supabaseClient.auth.getUserIdentities(),
      ]);
      const authUser = userData.user ?? sessionData.session.user;
      const email = authUser.email ?? '';
      const identities = identitiesResult.data?.identities ?? authUser.identities ?? null;
      const linkedAccounts = buildLinkedAccounts(authUser, identities);

      const { data, error: profileError } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .single();

      if (profileError) throw profileError;

      // Get global rank
      const { count } = await supabaseClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gt('elo_rating', data.elo_rating);

      const { count: totalCount } = await supabaseClient
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      const profileAvatar = normalizeAvatarUrl(data.avatar_url);
      const linkedAvatarFallback = getLinkedAvatarFallback(linkedAccounts);
      const effectiveAvatarUrl = profileAvatar ?? linkedAvatarFallback;

      setProfile({
        ...data,
        avatar_url: effectiveAvatarUrl,
        email,
        linkedAccounts,
        rank: (count ?? 0) + 1,
        totalPlayers: totalCount ?? 0,
      });

      if (!profileAvatar && linkedAvatarFallback) {
        void supabaseClient
          .from('profiles')
          .update({ avatar_url: linkedAvatarFallback })
          .eq('id', uid);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Username Availability ────────────────────────
  const checkUsername = useCallback((username: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!username || username.length < 3) {
      setUsernameCheck({ status: 'invalid', message: 'Username must be at least 3 characters' });
      return;
    }
    if (username.length > 20) {
      setUsernameCheck({ status: 'invalid', message: 'Username must be 20 characters or fewer' });
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setUsernameCheck({ status: 'invalid', message: 'Only letters, numbers, and underscores allowed' });
      return;
    }
    if (profile && username === profile.username) {
      setUsernameCheck({ status: 'same', message: '' });
      return;
    }

    setUsernameCheck({ status: 'checking', message: 'Checking availability...' });

    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await supabaseClient
          .from('profiles')
          .select('username')
          .eq('username', username)
          .neq('id', profile?.id ?? '')
          .maybeSingle();

        if (data) {
          setUsernameCheck({ status: 'taken', message: 'Username already taken' });
        } else {
          setUsernameCheck({ status: 'available', message: 'Username is available!' });
        }
      } catch {
        setUsernameCheck({ status: 'idle', message: '' });
      }
    }, 500);
  }, [profile]);

  // ── Update Profile ───────────────────────────────
  const updateProfile = useCallback(async (updates: { username?: string; bio?: string }) => {
    if (!profile) throw new Error('No profile loaded');
    setSaving(true);
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      if (error) throw error;

      setProfile((prev) => prev ? { ...prev, ...updates } : prev);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to update profile' };
    } finally {
      setSaving(false);
    }
  }, [profile]);

  // ── Update Email ─────────────────────────────────
  const updateEmail = useCallback(async (newEmail: string) => {
    setSaving(true);
    try {
      const email = newEmail.trim().toLowerCase();
      const emailRedirectTo = getAuthRedirectUrl('/auth/callback');
      const { error } = await supabaseClient.auth.updateUser(
        { email },
        emailRedirectTo ? { emailRedirectTo } : undefined
      );
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mapEmailUpdateError(err) };
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Update Password ──────────────────────────────
  const linkProvider = useCallback(async (provider: ManagedProvider) => {
    setSaving(true);
    try {
      const redirectTo = getAuthRedirectUrl('/auth/callback');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('xo_post_auth_redirect', '/profile');
      }
      const { error } = await supabaseClient.auth.linkIdentity({
        provider,
        options: redirectTo ? { redirectTo } : undefined,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mapIdentityActionError(err, 'link') };
    } finally {
      setSaving(false);
    }
  }, []);

  const unlinkProvider = useCallback(async (provider: ManagedProvider) => {
    setSaving(true);
    try {
      const identitiesResult = await supabaseClient.auth.getUserIdentities();
      if (identitiesResult.error) throw identitiesResult.error;

      const identities = identitiesResult.data?.identities ?? [];
      if (identities.length <= 1) {
        throw new Error('You need at least one other sign-in method before disconnecting this account.');
      }

      const target = identities.find((identity) => normalizeProvider(identity.provider) === provider);
      if (!target) {
        throw new Error('This provider is not currently linked.');
      }

      const { error } = await supabaseClient.auth.unlinkIdentity(target);
      if (error) throw error;

      await fetchProfile();
      return { success: true };
    } catch (err: unknown) {
      return { success: false, error: mapIdentityActionError(err, 'unlink') };
    } finally {
      setSaving(false);
    }
  }, [fetchProfile]);

  const sendPasswordSetupLink = useCallback(async () => {
    if (!profile) throw new Error('No profile loaded');

    setSaving(true);
    try {
      if (!profile.email?.trim()) {
        throw new Error('This account does not have an email address.');
      }

      const redirectTo = getAuthRedirectUrl('/auth/callback');

      const { error } = await supabaseClient.auth.resetPasswordForEmail(
        profile.email.trim().toLowerCase(),
        redirectTo ? { redirectTo } : undefined
      );
      if (error) throw error;

      return { success: true };
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';
      const normalized = message.toLowerCase();

      if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
        return { success: false, error: 'Too many requests. Please wait a moment before trying again.' };
      }
      if (normalized.includes('invalid') && normalized.includes('redirect')) {
        return { success: false, error: 'Password setup redirect is not allowed in Supabase Auth settings.' };
      }

      return { success: false, error: message || 'Failed to send password setup email.' };
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const createPassword = useCallback(async (newPassword: string) => {
    if (!profile) throw new Error('No profile loaded');
    setSaving(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';
      const normalized = message.toLowerCase();

      if (normalized.includes('password') && normalized.includes('weak')) {
        return { success: false, error: 'Password is too weak. Use at least 8 characters with mixed types.' };
      }

      return { success: false, error: message || 'Failed to set password' };
    } finally {
      setSaving(false);
    }
  }, [profile]);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!profile) throw new Error('No profile loaded');
    setSaving(true);
    try {
      const current = currentPassword.trim();
      if (!current) {
        return { success: false, error: 'Current password is required.' };
      }
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
        current_password: current,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message ?? '')
        : '';
      const normalized = message.toLowerCase();

      if (normalized.includes('current password')) {
        return { success: false, error: 'Current password is incorrect.' };
      }
      if (normalized.includes('same password') || normalized.includes('same as')) {
        return { success: false, error: 'Use a different password from your current one.' };
      }
      if (normalized.includes('password') && normalized.includes('weak')) {
        return { success: false, error: 'Password is too weak. Use at least 8 characters with mixed types.' };
      }

      return { success: false, error: message || 'Failed to update password' };
    } finally {
      setSaving(false);
    }
  }, [profile]);

  // ── Upload Avatar ────────────────────────────────
  const uploadAvatar = useCallback(async (file: File, onProgress?: (pct: number) => void) => {
    if (!profile) throw new Error('No profile loaded');

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // Use flat path: userId-timestamp.ext (no subfolder for simpler RLS)
    const fileName = `${profile.id}-${Date.now()}.${ext}`;

    onProgress?.(10);

    // Delete old avatar if exists
    if (profile.avatar_url) {
      try {
        const url = new URL(profile.avatar_url);
        const pathParts = url.pathname.split('/avatars/');
        if (pathParts[1]) {
          await supabaseClient.storage.from('avatars').remove([decodeURIComponent(pathParts[1])]);
        }
      } catch { /* ignore */ }
    }

    onProgress?.(30);

    const { error: uploadError } = await supabaseClient.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('bucket')) {
        throw new Error('Storage bucket "avatars" not found. Please create it in Supabase Dashboard → Storage.');
      }
      throw uploadError;
    }

    onProgress?.(70);

    const { data: { publicUrl } } = supabaseClient.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const { error: updateError } = await supabaseClient
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', profile.id);

    if (updateError) throw updateError;

    onProgress?.(100);

    setProfile((prev) => prev ? { ...prev, avatar_url: publicUrl } : prev);
    return publicUrl;
  }, [profile]);

  // ── Remove Avatar ────────────────────────────────
  const removeAvatar = useCallback(async () => {
    if (!profile) throw new Error('No profile loaded');

    if (profile.avatar_url) {
      try {
        const oldPath = profile.avatar_url.split('/avatars/')[1];
        if (oldPath) {
          await supabaseClient.storage.from('avatars').remove([decodeURIComponent(oldPath)]);
        }
      } catch { /* ignore */ }
    }

    const { error } = await supabaseClient
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', profile.id);

    if (error) throw error;

    setProfile((prev) => prev ? { ...prev, avatar_url: null } : prev);
  }, [profile]);

  // ── Delete Account ───────────────────────────────
  const deleteAccount = useCallback(async () => {
    if (!profile) throw new Error('No profile loaded');
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      throw new Error('Session expired. Please sign in again and retry.');
    }

    const response = await fetch('/api/account/delete', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    let payload: { error?: string } | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      throw new Error(payload?.error ?? 'Failed to delete account');
    }

    // After auth.users is deleted, signOut may fail on some clients.
    // We still attempt local sign-out to clear session storage.
    await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }, [profile]);

  return {
    profile,
    loading,
    saving,
    error,
    usernameCheck,
    fetchProfile,
    checkUsername,
    updateProfile,
    updateEmail,
    linkProvider,
    unlinkProvider,
    sendPasswordSetupLink,
    createPassword,
    updatePassword,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
  };
}
