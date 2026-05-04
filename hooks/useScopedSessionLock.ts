"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "../lib/supabase";

const HEARTBEAT_MS = 4000;
const LOCK_TTL_SECONDS = 15;
const TAB_INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type LockStatus = "loading" | "inactive" | "active" | "conflict" | "error";

type ClaimResult = {
  granted?: boolean;
};

export function useScopedSessionLock(scope: string) {
  const holderId = useMemo(() => `${TAB_INSTANCE_ID}:${scope}`, [scope]);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<LockStatus>("loading");
  const [isTakingOver, setIsTakingOver] = useState(false);
  const hasLockRef = useRef(false);

  const releaseLock = useCallback(async () => {
    if (!hasLockRef.current) return;
    await supabaseClient.rpc("release_scoped_session_lock", {
      input_scope: scope,
      input_holder_id: holderId,
    });
    hasLockRef.current = false;
  }, [holderId, scope]);

  const claimLock = useCallback(
    async (force = false) => {
      const { data, error } = await supabaseClient.rpc("claim_scoped_session_lock", {
        input_scope: scope,
        input_holder_id: holderId,
        input_ttl_seconds: LOCK_TTL_SECONDS,
        input_force: force,
      });

      if (error) {
        setStatus("error");
        return false;
      }

      const payload = (Array.isArray(data) ? data[0] : data) as ClaimResult | null;
      const granted = payload?.granted === true;
      if (granted) {
        hasLockRef.current = true;
        setStatus("active");
        return true;
      }

      hasLockRef.current = false;
      setStatus("conflict");
      return false;
    },
    [holderId, scope]
  );

  const takeOver = useCallback(async () => {
    setIsTakingOver(true);
    try {
      return await claimLock(true);
    } finally {
      setIsTakingOver(false);
    }
  }, [claimLock]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!mounted) return;
      const uid = data.session?.user.id ?? null;
      setUserId(uid);
      if (!uid) setStatus("inactive");
    })();

    const auth = supabaseClient.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (!uid) {
        setStatus("inactive");
        void releaseLock();
      } else {
        setStatus((prev) => (prev === "inactive" ? "loading" : prev));
      }
    });

    return () => {
      mounted = false;
      auth.data.subscription.unsubscribe();
    };
  }, [releaseLock]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await claimLock(false);
    };

    void tick();

    const heartbeat = window.setInterval(() => {
      void tick();
    }, HEARTBEAT_MS);

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
  }, [claimLock, releaseLock, userId]);

  return {
    status,
    isActive: status === "active",
    isConflict: status === "conflict",
    isTakingOver,
    takeOver,
  };
}
