"use client";

import { useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ConnectionState } from "../context/NotificationContext";
import { supabaseClient } from "../lib/supabase";
import { parseUserStatus, type UserStatus } from "../lib/statusUtils";

export type PresenceMeta = {
  user_id?: string;
  status?: UserStatus;
};

export type PresenceSnapshot = Record<string, PresenceMeta[]>;
export type PresenceListener = (state: PresenceSnapshot, hasSynced: boolean) => void;
type PresenceConnectionSnapshot = { status: ConnectionState; pingMs: number | null };
type PresenceConnectionListener = (state: PresenceConnectionSnapshot) => void;

let sharedChannel: RealtimeChannel | null = null;
let sharedUserId: string | null = null;
let sharedState: PresenceSnapshot = {};
let sharedHasSynced = false;
let sharedTrackedStatus: UserStatus = "online";
let sharedConnectionStatus: ConnectionState = "connected";
let sharedPingMs: number | null = null;
const sharedListeners = new Set<PresenceListener>();
const sharedConnectionListeners = new Set<PresenceConnectionListener>();
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let pingInFlight = false;

/** Heartbeat interval in ms — updates last_seen so server can detect stale users */
const HEARTBEAT_MS = 45_000; // 45 seconds

export function getPresenceStatuses(state: PresenceSnapshot) {
  const statuses = new Map<string, UserStatus>();
  for (const metas of Object.values(state)) {
    for (const meta of metas) {
      if (typeof meta.user_id === "string" && meta.user_id.length > 0) {
        const status = parseUserStatus(meta.status ?? "online");
        if (status !== "offline") {
          statuses.set(meta.user_id, status);
        }
      }
    }
  }
  return statuses;
}

function extractOnlineIds(state: PresenceSnapshot) {
  return [...getPresenceStatuses(state).keys()];
}

function setSharedState(state: PresenceSnapshot, hasSynced: boolean) {
  sharedState = state;
  sharedHasSynced = hasSynced;
  for (const listener of sharedListeners) {
    listener(state, hasSynced);
  }
}

function notifyState(state: PresenceSnapshot) {
  setSharedState(state, true);
}

function isNavigatorOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function notifyConnectionState() {
  const snapshot = { status: sharedConnectionStatus, pingMs: sharedPingMs };
  for (const listener of sharedConnectionListeners) {
    listener(snapshot);
  }
}

function setSharedPingMs(pingMs: number | null) {
  if (sharedPingMs === pingMs) return;
  sharedPingMs = pingMs;
  notifyConnectionState();
}

async function measureConnectionPing() {
  if (isNavigatorOffline() || pingInFlight) return;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anonKey) return;

  pingInFlight = true;
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(`${base}/rest/v1/`, {
      method: "HEAD",
      cache: "no-store",
      signal: controller.signal,
      headers: { apikey: anonKey },
    });
    if (sharedConnectionStatus === "reconnecting") {
      setSharedPingMs(Math.max(1, Math.round(performance.now() - startedAt)));
    }
  } catch {
    if (sharedConnectionStatus === "reconnecting") {
      setSharedPingMs(null);
    }
  } finally {
    clearTimeout(timeoutId);
    pingInFlight = false;
  }
}

function startReconnectPing() {
  if (pingInterval) return;
  void measureConnectionPing();
  pingInterval = setInterval(() => {
    void measureConnectionPing();
  }, 3000);
}

function stopReconnectPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
  pingInFlight = false;
}

function setSharedConnectionStatus(status: ConnectionState) {
  const wasStatus = sharedConnectionStatus;
  const nextPingMs = status === "reconnecting" ? sharedPingMs : null;
  if (wasStatus === status && sharedPingMs === nextPingMs) return;

  sharedConnectionStatus = status;
  sharedPingMs = nextPingMs;
  notifyConnectionState();

  if (status === "reconnecting") {
    startReconnectPing();
  } else {
    stopReconnectPing();
  }
}

async function heartbeatTick(userId: string) {
  await syncActiveProfileStatus(userId);
}

async function syncActiveProfileStatus(userId: string) {
  try {
    const now = new Date().toISOString();
    const status = sharedTrackedStatus;
    const update =
      status === "offline"
        ? { last_seen: now }
        : { status, last_seen: now };

    await supabaseClient.from("profiles").update(update).eq("id", userId);
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

function clearReconnectTimer() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function schedulePresenceReconnect(userId: string) {
  clearReconnectTimer();
  setSharedConnectionStatus(isNavigatorOffline() ? "disconnected" : "reconnecting");
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (isNavigatorOffline()) {
      setSharedConnectionStatus("disconnected");
      return;
    }
    setSharedConnectionStatus("reconnecting");
    void ensurePresenceChannel(userId);
  }, 1500);
}

/**
 * Tear down the shared presence channel completely.
 * Must be called before creating a new one or on cleanup.
 */
function destroyPresenceChannel() {
  clearReconnectTimer();
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
  setSharedState({}, false);
}

async function refreshActivePresence(userId: string, options: { recreateChannel?: boolean } = {}) {
  if (options.recreateChannel) {
    destroyPresenceChannel();
    void ensurePresenceChannel(userId);
  } else {
    await trackPresenceStatus(sharedTrackedStatus, userId);
  }

  await syncActiveProfileStatus(userId);
  startHeartbeat(userId);
}

export async function trackPresenceStatus(status: UserStatus, explicitUserId?: string | null) {
  sharedTrackedStatus = status;
  const targetUserId = explicitUserId ?? sharedUserId;
  if (!sharedChannel || !targetUserId || sharedUserId !== targetUserId) return;

  try {
    await sharedChannel.track({ user_id: targetUserId, status });
    if (sharedHasSynced) {
      notifyState(sharedChannel.presenceState() as PresenceSnapshot);
    }
  } catch {
    // Presence metadata is best-effort; the database status remains authoritative.
  }
}

async function ensurePresenceChannel(userId: string) {
  if (sharedChannel && sharedUserId === userId) return sharedChannel;
  if (sharedUserId && sharedUserId !== userId) {
    sharedTrackedStatus = "online";
  }
  destroyPresenceChannel();

  sharedUserId = userId;
  setSharedConnectionStatus(isNavigatorOffline() ? "disconnected" : "reconnecting");
  const channel = supabaseClient.channel("global-presence", {
    config: { presence: { key: userId } },
  });
  sharedChannel = channel;

  const syncState = () => {
    if (sharedChannel !== channel || sharedUserId !== userId) return;
    const state = channel.presenceState() as PresenceSnapshot;
    notifyState(state);
  };

  channel
    .on("presence", { event: "sync" }, syncState)
    .on("presence", { event: "join" }, syncState)
    .on("presence", { event: "leave" }, syncState)
    .subscribe(async (status) => {
      if (sharedChannel !== channel || sharedUserId !== userId) return;

      // Guard: only act if this channel is still current
      if (status === "SUBSCRIBED") {
        clearReconnectTimer();
        setSharedConnectionStatus("connected");
        await trackPresenceStatus(sharedTrackedStatus, userId);
        await syncActiveProfileStatus(userId);
        startHeartbeat(userId);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        stopHeartbeat();
        sharedChannel = null;
        setSharedState({}, false);
        setSharedConnectionStatus(isNavigatorOffline() ? "disconnected" : "reconnecting");
        schedulePresenceReconnect(userId);
      }
    });

  return channel;
}

export function subscribePresenceState(listener: PresenceListener): () => void {
  sharedListeners.add(listener);
  listener(sharedState, sharedHasSynced);
  return () => {
    sharedListeners.delete(listener);
  };
}

export function subscribePresenceConnection(listener: PresenceConnectionListener): () => void {
  sharedConnectionListeners.add(listener);
  listener({ status: sharedConnectionStatus, pingMs: sharedPingMs });
  return () => {
    sharedConnectionListeners.delete(listener);
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
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!base || !anonKey) return;

    // Append apikey as query param since sendBeacon can't set headers
    const url = `${base}/functions/v1/set-offline?apikey=${anonKey}`;
    const payload = JSON.stringify({ userId });

    // Send as plain string → Content-Type: text/plain (CORS-safe, no preflight)
    const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, payload);
    if (!sent) {
      void fetch(url, {
        method: "POST",
        body: payload,
        keepalive: true,
        headers: { "Content-Type": "text/plain" },
      }).catch(() => {
        /* ignore */
      });
    }
  } catch {
    // ignore — best-effort
  }
}

export function usePresence() {
  const [userId, setUserId] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [connection, setConnection] = useState<PresenceConnectionSnapshot>({
    status: sharedConnectionStatus,
    pingMs: sharedPingMs,
  });

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

  useEffect(() => subscribePresenceConnection(setConnection), []);

  // Main presence effect
  useEffect(() => {
    if (!userId) {
      // User signed out → tear down everything
      destroyPresenceChannel();
      stopHeartbeat();
      sharedTrackedStatus = "online";
      setSharedConnectionStatus("connected");
      return;
    }

    const syncOnline = (state: PresenceSnapshot) => {
      setOnlineUserIds(extractOnlineIds(state));
    };
    const unsubscribe = subscribePresenceState(syncOnline);
    void ensurePresenceChannel(userId);

    // ── beforeunload: fire-and-forget offline beacon ──
    const onBeforeUnload = () => {
      sendOfflineBeacon(userId);
    };

    const onPageHide = (event: PageTransitionEvent) => {
      if (!event.persisted) {
        sendOfflineBeacon(userId);
      }
    };

    const onFreeze = () => {
      sendOfflineBeacon(userId);
    };

    const onOnline = () => {
      if (sharedUserId === userId) {
        setSharedConnectionStatus("reconnecting");
        void refreshActivePresence(userId, { recreateChannel: true });
      }
    };

    const onOffline = () => {
      setSharedConnectionStatus("disconnected");
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && sharedUserId === userId) {
        void refreshActivePresence(userId, { recreateChannel: true });
      }
    };

    const onFocus = () => {
      if (sharedUserId === userId) {
        void refreshActivePresence(userId);
      }
    };

    // ── visibilitychange: only restore online when tab becomes visible ──
    // We do NOT set offline on "hidden" — that causes constant flickering
    // when users switch tabs. Offline detection relies on:
    //   1. beforeunload beacon (tab/browser close)
    //   2. signOut explicit update
    //   3. heartbeat staleness (server-side cleanup_stale_presence)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && sharedUserId === userId) {
        // Tab came back from being hidden — refresh online status
        void refreshActivePresence(userId);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("freeze", onFreeze);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("freeze", onFreeze);
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

  return useMemo(
    () => ({
      onlineUserIds,
      connectionStatus: connection.status,
      connectionPingMs: connection.pingMs,
      hasSession: !!userId,
    }),
    [connection, onlineUserIds, userId]
  );
}
