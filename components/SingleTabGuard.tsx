"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "../lib/supabase";

const HEARTBEAT_MS = 4000;
const LOCK_TTL_SECONDS = 15;
const TAB_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function SingleTabGuard() {
  const router = useRouter();
  const tabIdRef = useRef<string | null>(TAB_INSTANCE_ID);
  const [userId, setUserId] = useState<string | null>(null);
  const blockedRef = useRef(false);

  const claimLock = useCallback(async () => {
    const tabId = tabIdRef.current;
    if (!tabId) return false;
    const { data, error } = await supabaseClient.rpc("claim_session_lock", {
      input_holder_id: tabId,
      input_ttl_seconds: LOCK_TTL_SECONDS,
    });
    if (error) {
      console.warn("claim_session_lock failed:", error.message);
      return null;
    }
    return data === true;
  }, []);

  const releaseLock = useCallback(async () => {
    const tabId = tabIdRef.current;
    if (!tabId) return;
    await supabaseClient.rpc("release_session_lock", { input_holder_id: tabId });
  }, []);

  const enforceConflictRedirect = useCallback(() => {
    if (blockedRef.current) return;
    blockedRef.current = true;
    router.replace("/session-conflict");
  }, [router]);

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
      if (!session?.user.id) {
        void releaseLock();
      }
    });

    return () => {
      mounted = false;
      auth.data.subscription.unsubscribe();
    };
  }, [releaseLock]);

  useEffect(() => {
    if (!userId || blockedRef.current) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || blockedRef.current) return;
      const ok = await claimLock();
      if (ok === false) {
        enforceConflictRedirect();
      }
    };

    // Initial claim
    tick();

    const heartbeat = window.setInterval(tick, HEARTBEAT_MS);
    const onBeforeUnload = () => {
      void releaseLock();
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void releaseLock();
    };
  }, [claimLock, enforceConflictRedirect, releaseLock, userId]);

  return null;
}
