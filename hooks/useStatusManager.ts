"use client";

import { useCallback, useState } from "react";
import { supabaseClient } from "../lib/supabase";
import type { UserStatus } from "../lib/statusUtils";

export function useStatusManager(userId: string | null) {
  const [currentStatus, setCurrentStatus] = useState<UserStatus>("offline");

  const setStatus = useCallback(
    async (newStatus: UserStatus, explicitUserId?: string | null) => {
      const targetUserId = explicitUserId ?? userId;
      if (!targetUserId) return;
      setCurrentStatus(newStatus);
      await supabaseClient
        .from("profiles")
        .update({ status: newStatus, last_seen: new Date().toISOString() })
        .eq("id", targetUserId);
    },
    [userId]
  );

  return { currentStatus, setStatus };
}
