import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── Storage key for the "remember me" preference ─────────────
const REMEMBER_KEY = 'xo_remember_me';

/**
 * Set whether the session should persist across browser restarts.
 * - true  → tokens stored in localStorage  (survives browser close)
 * - false → tokens stored in sessionStorage (cleared on close)
 */
export function setRememberMe(value: boolean) {
  if (typeof window === 'undefined') return;
  // Always store the flag itself in localStorage so we can read it on next load
  localStorage.setItem(REMEMBER_KEY, JSON.stringify(value));

  if (!value) {
    // Move any existing Supabase tokens from localStorage → sessionStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = localStorage.getItem(key);
        if (val) sessionStorage.setItem(key, val);
        localStorage.removeItem(key);
        i--; // adjust index after removal
      }
    }
  } else {
    // Move any existing Supabase tokens from sessionStorage → localStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const val = sessionStorage.getItem(key);
        if (val) localStorage.setItem(key, val);
        sessionStorage.removeItem(key);
        i--;
      }
    }
  }
}

/** Read the current "remember me" preference. Defaults to true. */
export function getRememberMe(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(REMEMBER_KEY);
  if (stored === null) return true; // default: remember
  try {
    return JSON.parse(stored) === true;
  } catch {
    return true;
  }
}

/**
 * Custom storage adapter that delegates to localStorage or sessionStorage
 * based on the "remember me" flag.
 */
const smartStorage: Storage = typeof window !== 'undefined'
  ? {
      get length() {
        return getRememberMe() ? localStorage.length : sessionStorage.length;
      },
      clear() {
        localStorage.clear();
        sessionStorage.clear();
      },
      getItem(key: string) {
        // Check both storages — token might be in either after toggling
        return localStorage.getItem(key) ?? sessionStorage.getItem(key);
      },
      key(index: number) {
        return getRememberMe()
          ? localStorage.key(index)
          : sessionStorage.key(index);
      },
      removeItem(key: string) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      },
      setItem(key: string, value: string) {
        const target = getRememberMe() ? localStorage : sessionStorage;
        // Clean the other storage to avoid stale copies
        const other = getRememberMe() ? sessionStorage : localStorage;
        other.removeItem(key);
        target.setItem(key, value);
      },
    }
  : (undefined as unknown as Storage);

// ── Supabase Clients ─────────────────────────────────────────
export const supabaseClient: SupabaseClient = createClient(url, anonKey, {
  auth: {
    ...(typeof window !== 'undefined' ? { storage: smartStorage } : {}),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const supabaseAdmin: SupabaseClient | null = serviceRole
  ? createClient(url, serviceRole)
  : null;

export default supabaseClient;
