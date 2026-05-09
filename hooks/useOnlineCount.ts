"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserStatus } from "../lib/statusUtils";
import { subscribePresenceState } from "./usePresence";

type PresenceMeta = {
  user_id?: string;
  status?: UserStatus;
};

export function useOnlineCount() {
  const [counts, setCounts] = useState({
    totalOnline: 0,
    inMatchmaking: 0,
    inGame: 0,
  });

  useEffect(() => {
    const unsubscribe = subscribePresenceState((state) => {
      let totalOnline = 0;
      let inMatchmaking = 0;
      let inGame = 0;

      for (const metas of Object.values(state)) {
        if (!Array.isArray(metas) || metas.length === 0) continue;
        totalOnline += 1;
        const latest = metas[metas.length - 1];
        if (latest.status === "matchmaking") inMatchmaking += 1;
        if (latest.status === "in_game") inGame += 1;
      }

      setCounts({ totalOnline, inMatchmaking, inGame });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return useMemo(() => counts, [counts]);
}
