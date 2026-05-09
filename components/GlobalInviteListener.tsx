"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "../lib/supabase";
import GameInvitePopup from "./GameInvitePopup";

/**
 * Global listener that renders GameInvitePopup on every page.
 * Manages its own auth state so it works regardless of which page is active.
 */
export default function GlobalInviteListener() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data } = await supabaseClient.auth.getSession();
      if (!cancelled) setCurrentUserId(data.session?.user.id ?? null);
    })();

    const { data: auth } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setCurrentUserId(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      auth.subscription.unsubscribe();
    };
  }, []);

  return <GameInvitePopup currentUserId={currentUserId} />;
}
