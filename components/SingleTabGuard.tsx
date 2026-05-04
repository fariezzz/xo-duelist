"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "../lib/supabase";

const HEARTBEAT_MS = 2000;
const STALE_MS = 7000;
const TAB_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type TabLock = {
  tabId: string;
  lastSeen: number;
};

function lockKey(userId: string) {
  return `xo_active_tab:${userId}`;
}

function parseLock(raw: string | null): TabLock | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TabLock>;
    if (!parsed.tabId || typeof parsed.lastSeen !== "number") return null;
    return { tabId: parsed.tabId, lastSeen: parsed.lastSeen };
  } catch {
    return null;
  }
}

export default function SingleTabGuard() {
  const tabIdRef = useRef<string | null>(TAB_INSTANCE_ID);
  const [userId, setUserId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);

  function isFresh(lock: TabLock) {
    return Date.now() - lock.lastSeen < STALE_MS;
  }

  const tryAcquire = useCallback((uid: string) => {
    const tabId = tabIdRef.current;
    if (!tabId) return false;
    const key = lockKey(uid);
    const existing = parseLock(localStorage.getItem(key));
    if (!existing || existing.tabId === tabId || !isFresh(existing)) {
      const mine: TabLock = { tabId, lastSeen: Date.now() };
      localStorage.setItem(key, JSON.stringify(mine));
      return true;
    }
    return false;
  }, []);

  const releaseIfOwned = useCallback((uid: string) => {
    const tabId = tabIdRef.current;
    if (!tabId) return;
    const key = lockKey(uid);
    const existing = parseLock(localStorage.getItem(key));
    if (existing?.tabId === tabId) {
      localStorage.removeItem(key);
    }
  }, []);

  const enforceClose = useCallback(() => {
    if (blockedRef.current) return;
    blockedRef.current = true;
    setBlocked(true);

    // Best-effort forced close (works only in some browser contexts).
    window.open("", "_self");
    window.close();

    // Fallback: navigate away so this tab cannot interact with the game.
    setTimeout(() => {
      if (!document.hidden) window.location.replace("about:blank");
    }, 120);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!mounted) return;
      setUserId(data.session?.user.id ?? null);
    })();

    const auth = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
      blockedRef.current = false;
      setBlocked(false);
    });

    return () => {
      mounted = false;
      auth.data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId || blockedRef.current) return;

    if (!tryAcquire(userId)) {
      enforceClose();
      return;
    }

    const key = lockKey(userId);
    const heartbeat = window.setInterval(() => {
      if (!tryAcquire(userId)) enforceClose();
    }, HEARTBEAT_MS);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || blockedRef.current) return;
      const incoming = parseLock(event.newValue);
      if (incoming && incoming.tabId !== tabIdRef.current && isFresh(incoming)) {
        enforceClose();
      }
    };

    const onBeforeUnload = () => {
      releaseIfOwned(userId);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("beforeunload", onBeforeUnload);
      releaseIfOwned(userId);
    };
  }, [enforceClose, releaseIfOwned, tryAcquire, userId]);

  if (!blocked) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(8, 12, 24, 0.96)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: "var(--font-heading)",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <div>
        <div style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: "10px" }}>Duplicate tab detected</div>
        <div style={{ opacity: 0.82 }}>This tab has been disabled because this account is active in another tab.</div>
      </div>
    </div>
  );
}
