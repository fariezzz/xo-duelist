"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ────────────────────────────────────────────────
export type SupabaseHealthStatus = "checking" | "available" | "unavailable";

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const PING_TIMEOUT_MS = 8_000; // 8 seconds

/**
 * Ping the Supabase REST API once to determine availability.
 *
 * Returns "available" if the server is reachable (non-5xx),
 * "unavailable" if the server returns 5xx (paused / maintenance),
 * or "checking" if the request fails before receiving a response.
 */
export async function pingSupabase(): Promise<SupabaseHealthStatus> {
  // If the browser reports no network, don't treat it as server-down.
  // The existing ConnectionStatus / reconnecting indicator handles this.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "checking";
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!base || !anonKey) return "checking";

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

    // Only a real 5xx response means Supabase reached us but is unavailable.
    // Other statuses still prove the service is reachable.
    return res.status >= 500 ? "unavailable" : "available";
  } catch {
    clearTimeout(timeoutId);
    // Network errors, browser offline transitions, DNS failures, and timeouts
    // do not prove Supabase returned a 5xx response. Let reconnecting UX handle it.
    return "checking";
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
 * - Listens for online/offline browser events
 * - Returns the current health status + manual recheck function
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

    // Listen for browser online/offline events to react instantly
    const handleOnline = () => {
      // User came back online — recheck immediately
      void runCheck();
    };
    const handleOffline = () => {
      // User went offline — revert to "checking" so overlay doesn't show
      if (mountedRef.current) {
        setStatus("checking");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runCheck]);

  return { status, recheck: runCheck };
}
