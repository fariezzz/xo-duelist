"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseClient } from "./supabase";

type PresenceListener = (onlineUserIds: Set<string>) => void;
export type PresenceActivity =
  | "online"
  | "in_queue"
  | "in_room"
  | "in_match"
  | "in_training";
type PresenceStateListener = (state: Map<string, PresenceActivity>) => void;

let presenceChannel: RealtimeChannel | null = null;
const listeners = new Set<PresenceListener>();
const stateListeners = new Set<PresenceStateListener>();
let onlineIds = new Set<string>();
let activityByUser = new Map<string, PresenceActivity>();
let initialized = false;
let trackedUserId: string | null = null;
let currentActivity: PresenceActivity = "online";
const PRESENCE_STALE_MS = 75 * 1000;

function notifyListeners() {
  const snapshot = new Set(onlineIds);
  for (const listener of listeners) {
    listener(snapshot);
  }

  const stateSnapshot = new Map(activityByUser);
  for (const listener of stateListeners) {
    listener(stateSnapshot);
  }
}

function parseActivity(value: unknown): PresenceActivity {
  if (
    value === "in_queue" ||
    value === "in_room" ||
    value === "in_match" ||
    value === "in_training" ||
    value === "online"
  ) {
    return value;
  }
  return "online";
}

function computeOnlineIdsFromChannelState() {
  if (!presenceChannel) return;
  const state = presenceChannel.presenceState();
  const next = new Set<string>();
  const nextActivityByUser = new Map<string, PresenceActivity>();
  const now = Date.now();
  for (const [key, metas] of Object.entries(state)) {
    if (Array.isArray(metas) && metas.length > 0) {
      const latestMeta = metas[metas.length - 1] as { activity?: unknown; ts?: unknown } | undefined;
      const tsValue = typeof latestMeta?.ts === "number" ? latestMeta.ts : Number(latestMeta?.ts ?? 0);
      const isFresh = Number.isFinite(tsValue) && now - tsValue <= PRESENCE_STALE_MS;
      if (!isFresh) continue;
      next.add(key);
      nextActivityByUser.set(key, parseActivity(latestMeta?.activity));
    }
  }
  onlineIds = next;
  activityByUser = nextActivityByUser;
  notifyListeners();
}

async function ensurePresenceChannel() {
  if (presenceChannel) return;

  const { data } = await supabaseClient.auth.getSession();
  const uid = data.session?.user.id ?? null;
  if (!uid) return;

  trackedUserId = uid;

  presenceChannel = supabaseClient.channel("xo-global-presence", {
    config: { presence: { key: uid } },
  });

  presenceChannel
    .on("presence", { event: "sync" }, () => {
      computeOnlineIdsFromChannelState();
    })
    .on("presence", { event: "join" }, () => {
      computeOnlineIdsFromChannelState();
    })
    .on("presence", { event: "leave" }, () => {
      computeOnlineIdsFromChannelState();
    })
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED" && trackedUserId) {
        await presenceChannel?.track({
          user_id: trackedUserId,
          activity: currentActivity,
          ts: Date.now(),
          path: typeof window !== "undefined" ? window.location.pathname : "/",
        });
      }
    });
}

export async function setRealtimePresenceActivity(activity: PresenceActivity) {
  currentActivity = activity;
  if (!presenceChannel || !trackedUserId) return;
  await presenceChannel.track({
    user_id: trackedUserId,
    activity,
    ts: Date.now(),
    path: typeof window !== "undefined" ? window.location.pathname : "/",
  });
}

export async function startRealtimePresence() {
  if (initialized) return;
  initialized = true;

  await ensurePresenceChannel();
  const staleSweepInterval = window.setInterval(() => {
    computeOnlineIdsFromChannelState();
  }, 10000);

  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    if (!presenceChannel || !trackedUserId) return;
    void presenceChannel.track({
      user_id: trackedUserId,
      activity: currentActivity,
      ts: Date.now(),
      path: window.location.pathname,
    });
  };

  const onBeforeUnload = () => {
    if (!presenceChannel) return;
    void presenceChannel.untrack();
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  window.addEventListener("beforeunload", onBeforeUnload);

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    const nextUid = session?.user.id ?? null;

    if (!nextUid) {
      if (presenceChannel) {
        supabaseClient.removeChannel(presenceChannel);
        presenceChannel = null;
      }
      trackedUserId = null;
      onlineIds = new Set();
      notifyListeners();
      return;
    }

    if (nextUid !== trackedUserId) {
      if (presenceChannel) {
        supabaseClient.removeChannel(presenceChannel);
        presenceChannel = null;
      }
      trackedUserId = null;
      onlineIds = new Set();
      notifyListeners();
      await ensurePresenceChannel();
    }
  });

  return () => {
    clearInterval(staleSweepInterval);
  };
}

export function subscribeRealtimeOnlineUsers(listener: PresenceListener): () => void {
  listeners.add(listener);
  listener(new Set(onlineIds));
  void ensurePresenceChannel();

  return () => {
    listeners.delete(listener);
  };
}

export function subscribeRealtimePresenceState(listener: PresenceStateListener): () => void {
  stateListeners.add(listener);
  listener(new Map(activityByUser));
  void ensurePresenceChannel();

  return () => {
    stateListeners.delete(listener);
  };
}

export function getRealtimeOnlineUserIds(): Set<string> {
  return new Set(onlineIds);
}
