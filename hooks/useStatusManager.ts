"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "../lib/supabase";
import type { UserStatus } from "../lib/statusUtils";
import { trackPresenceStatus } from "./usePresence";

const statusWriteQueueByUser = new Map<string, Promise<void>>();

function queueStatusPersist(userId: string, status: UserStatus) {
  const previous = statusWriteQueueByUser.get(userId) ?? Promise.resolve();
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      await trackPresenceStatus(status, userId);
      const { error } = await supabaseClient
        .from("profiles")
        .update({ status, last_seen: new Date().toISOString() })
        .eq("id", userId);

      if (error) throw error;
    });

  const cleanup = queued.finally(() => {
    if (statusWriteQueueByUser.get(userId) === cleanup) {
      statusWriteQueueByUser.delete(userId);
    }
  });

  statusWriteQueueByUser.set(userId, cleanup);
  return cleanup;
}

export function useStatusManager(userId: string | null) {
  const [currentStatus, setCurrentStatus] = useState<UserStatus>("offline");
  const userIdRef = useRef(userId);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const setStatus = useCallback(
    async (newStatus: UserStatus, explicitUserId?: string | null) => {
      const targetUserId = explicitUserId ?? userIdRef.current;
      if (!targetUserId) return;
      setCurrentStatus(newStatus);
      try {
        await queueStatusPersist(targetUserId, newStatus);
      } catch (err) {
        console.warn("Failed to update user status:", err);
      }
    },
    []
  );

  return { currentStatus, setStatus };
}
