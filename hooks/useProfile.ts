"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseClient } from '../lib/supabase';

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
  rank: number | null;
  totalPlayers: number;
}

interface UsernameCheck {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'same';
  message: string;
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
      const email = sessionData.session.user.email ?? '';

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

      setProfile({
        ...data,
        email,
        rank: (count ?? 0) + 1,
        totalPlayers: totalCount ?? 0,
      });
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
      const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to update email' };
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Update Password ──────────────────────────────
  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!profile) throw new Error('No profile loaded');
    setSaving(true);
    try {
      // Verify current password
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: profile.email,
        password: currentPassword,
      });
      if (signInError) throw new Error('Current password is incorrect');

      // Update password
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message ?? 'Failed to update password' };
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

    // Delete profile row first
    await supabaseClient.from('profiles').delete().eq('id', profile.id);

    // Try admin delete — requires service role key
    const { supabaseAdmin } = await import('../lib/supabase');
    if (supabaseAdmin) {
      await supabaseAdmin.auth.admin.deleteUser(profile.id);
    }

    // Sign out regardless
    await supabaseClient.auth.signOut();
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
    updatePassword,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
  };
}
