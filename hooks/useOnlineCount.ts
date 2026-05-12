"use client";

import { useEffect, useMemo, useState } from "react";
import { getPresenceStatuses, subscribePresenceState } from "./usePresence";

export function useOnlineCount() {
  const [counts, setCounts] = useState({
    totalOnline: 0,
    inMatchmaking: 0,
    inGame: 0,
  });

  useEffect(() => {
    const unsubscribe = subscribePresenceState((state, hasSynced) => {
      if (!hasSynced) return;

      const statuses = getPresenceStatuses(state);
      const totalOnline = statuses.size;
      let inMatchmaking = 0;
      let inGame = 0;

      for (const status of statuses.values()) {
        if (status === "matchmaking") inMatchmaking += 1;
        if (status === "in_game") inGame += 1;
      }

      setCounts({ totalOnline, inMatchmaking, inGame });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return useMemo(() => counts, [counts]);
}
