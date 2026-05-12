"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────
export type SupabaseHealthStatus = "checking" | "available" | "unavailable";

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const PING_TIMEOUT_MS = 8_000; // 8 seconds

/**
 * Ping the Supabase REST API once to determine availability.
 */
export async function pingSupabase(): Promise<SupabaseHealthStatus> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!base || !anonKey) return "unavailable";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/rest/v1/`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    clearTimeout(timeoutId);

    // 2xx or 4xx = server is reachable
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      return "available";
    }
    // 5xx = paused / maintenance
    return "unavailable";
  } catch {
    clearTimeout(timeoutId);
    return "unavailable";
  }
}

/**
 * React hook that continuously monitors Supabase health.
 *
 * Runs entirely inside React's lifecycle (no module-level singletons),
 * so it survives HMR, page transitions, and module re-evaluations cleanly.
 *
 * - Performs an immediate check on mount
 * - Polls every 15 seconds
 * - Returns the current health status
 * - Also returns a manual `recheck()` function
 */
export function useSupabaseHealth() {
  const [status, setStatus] = useState<SupabaseHealthStatus>("checking");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const runCheck = useCallback(async () => {
    const result = await pingSupabase();
    if (mountedRef.current) {
      setStatus(result);
    }
    return result;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Run immediately on mount
    void runCheck();

    // Start continuous polling
    intervalRef.current = setInterval(() => {
      void runCheck();
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [runCheck]);

  return { status, recheck: runCheck };
}
