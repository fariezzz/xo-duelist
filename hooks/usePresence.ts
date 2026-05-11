"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";
import type { UserStatus } from "../lib/statusUtils";

type PresenceMeta = {
  user_id?: string;
  status?: UserStatus;
};

type PresenceSnapshot = Record<string, PresenceMeta[]>;
type PresenceListener = (state: PresenceSnapshot) => void;

let sharedChannel: RealtimeChannel | null = null;
let sharedUserId: string | null = null;
let sharedState: PresenceSnapshot = {};
const sharedListeners = new Set<PresenceListener>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

/** Heartbeat interval in ms — updates last_seen so server can detect stale users */
const HEARTBEAT_MS = 45_000; // 45 seconds

function extractOnlineIds(state: PresenceSnapshot) {
  const ids = new Set<string>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      if (typeof meta.user_id === "string" && meta.user_id.length > 0) {
        ids.add(meta.user_id);
      }
    }
  }
  return [...ids];
}

function notifyState(state: PresenceSnapshot) {
  sharedState = state;
  for (const listener of sharedListeners) {
    listener(state);
  }
}

async function heartbeatTick(userId: string) {
  try {
    await supabaseClient
      .from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", userId);
  } catch {
    // silently ignore heartbeat failures
  }
}

function startHeartbeat(userId: string) {
  stopHeartbeat();
  void heartbeatTick(userId);
  heartbeatInterval = setInterval(() => {
    void heartbeatTick(userId);
  }, HEARTBEAT_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Tear down the shared presence channel completely.
 * Must be called before creating a new one or on cleanup.
 */
function destroyPresenceChannel() {
  if (sharedChannel) {
    try {
      void sharedChannel.untrack();
    } catch {
      /* ignore */
    }
    supabaseClient.removeChannel(sharedChannel);
    sharedChannel = null;
  }
  sharedUserId = null;
}

async function ensurePresenceChannel(userId: string) {
  if (sharedChannel && sharedUserId === userId) return sharedChannel;
  destroyPresenceChannel();

  sharedUserId = userId;
  sharedChannel = supabaseClient.channel("global-presence", {
    config: { presence: { key: userId } },
  });

  const syncState = () => {
    if (!sharedChannel) return;
    const state = sharedChannel.presenceState() as PresenceSnapshot;
    notifyState(state);
  };

  sharedChannel
    .on("presence", { event: "sync" }, syncState)
    .on("presence", { event: "join" }, syncState)
    .on("presence", { event: "leave" }, syncState)
    .subscribe(async (status) => {
      // Guard: only act if this channel is still current
      if (status === "SUBSCRIBED" && sharedChannel && sharedUserId === userId) {
        await sharedChannel.track({ user_id: userId, status: "online" });
        await supabaseClient
          .from("profiles")
          .update({ status: "online", last_seen: new Date().toISOString() })
          .eq("id", userId);
        startHeartbeat(userId);
      }
    });

  return sharedChannel;
}

export function subscribePresenceState(listener: PresenceListener): () => void {
  sharedListeners.add(listener);
  listener(sharedState);
  return () => {
    sharedListeners.delete(listener);
  };
}

/**
 * Send an offline beacon via navigator.sendBeacon.
 *
 * Key detail: sendBeacon only works with CORS-safelisted content types
 * (text/plain, application/x-www-form-urlencoded, multipart/form-data).
 * Sending as application/json would trigger a preflight which sendBeacon
 * cannot handle, so the request would be silently dropped.
 *
 * We send as plain text and the edge function parses it with JSON.parse().
 */
function sendOfflineBeacon(userId: string) {
  // Strategy 1: Direct Supabase update — works when JS is still running
  // (e.g., from visibilitychange hidden timeout). Fire-and-forget.
  void supabaseClient
    .from("profiles")
    .update({ status: "offline", last_seen: new Date().toISOString() })
    .eq("id", userId)
    .then(() => {})
    .catch(() => {});

  // Strategy 2: sendBeacon — works during page unload/pagehide
  // when normal fetch would be cancelled by the browser
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base) return;

    // Append apikey as query param since sendBeacon can't set headers
    const url = `${base}/functions/v1/set-offline?apikey=${anonKey}`;
    const payload = JSON.stringify({ userId });

    // Send as plain string → Content-Type: text/plain (CORS-safe, no preflight)
    navigator.sendBeacon(url, payload);
  } catch {
    // ignore — best-effort
  }
}


export function usePresence() {
  const [userId, setUserId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  // Track auth state
  useEffect(() => {
    let mounted = true;
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUserId(data.session?.user.id ?? null);
    });

    const { data: auth } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      mounted = false;
      auth.subscription.unsubscribe();
    };
  }, []);

  // Main presence effect
  useEffect(() => {
    if (!userId) {
      // User signed out → tear down everything
      destroyPresenceChannel();
      stopHeartbeat();
      return;
    }

    const syncOnline = (state: PresenceSnapshot) => {
      setOnlineUserIds(extractOnlineIds(state));
    };
    const unsubscribe = subscribePresenceState(syncOnline);
    void ensurePresenceChannel(userId);

    // ── beforeunload + pagehide: fire-and-forget offline beacon ──
    // Mobile browsers don't reliably fire beforeunload, but DO fire pagehide.
    // We listen to both for maximum coverage (deduplication is harmless).
    const onBeforeUnload = () => {
      sendOfflineBeacon(userId);
    };

    const onPageHide = (e: PageTransitionEvent) => {
      // e.persisted = true means page may be restored from bfcache,
      // but we still send offline because the user is leaving now.
      sendOfflineBeacon(userId);
    };

    // ── visibilitychange: restore online when tab visible,
    //    send offline beacon after a grace period when hidden ──
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const HIDDEN_GRACE_MS = 10_000; // 10s grace to avoid flicker on quick tab switches

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab came back — cancel any pending offline and restore online
        if (hiddenTimer) {
          clearTimeout(hiddenTimer);
          hiddenTimer = null;
        }
        if (sharedUserId === userId) {
          void supabaseClient
            .from("profiles")
            .update({ status: "online", last_seen: new Date().toISOString() })
            .eq("id", userId);
          startHeartbeat(userId);
        }
      } else {
        // Tab went hidden — on mobile this is the primary "app backgrounded" signal.
        // Set offline after a grace period to avoid flicker on quick tab switches.
        if (hiddenTimer) clearTimeout(hiddenTimer);
        hiddenTimer = setTimeout(() => {
          hiddenTimer = null;
          stopHeartbeat();
          sendOfflineBeacon(userId);
        }, HIDDEN_GRACE_MS);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribe();
      if (hiddenTimer) clearTimeout(hiddenTimer);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopHeartbeat();
      destroyPresenceChannel();

      // Best-effort set offline in DB (may fail if already signed out)
      void supabaseClient
        .from("profiles")
        .update({ status: "offline", last_seen: new Date().toISOString() })
        .eq("id", userId);
    };
  }, [userId]);


  return useMemo(() => ({ onlineUserIds }), [onlineUserIds]);
}
