"use client";

import { useEffect, useRef } from "react";
import { supabaseClient } from "../lib/supabase";
import { useScopedSessionLock } from "../hooks/useScopedSessionLock";

export default function GlobalSessionEnforcer() {
  const isSigningOutRef = useRef(false);
  const { isConflict, status } = useScopedSessionLock("global", {
    forceOnInit: true,
    useBrowserId: true,
  });

  useEffect(() => {
    if (!isConflict && status !== "deleted") return;
    // Guard: only trigger once even if isConflict flickers
    if (isSigningOutRef.current) return;
    isSigningOutRef.current = true;

    // Another device/browser has taken the global session lock OR the user account was deleted.
    // Sign out locally and redirect to login with an informative error.
    supabaseClient.auth.signOut({ scope: "local" }).then(() => {
      window.location.replace(status === "deleted" ? "/?error=account_deleted" : "/?error=session_conflict");
    }).catch(() => {
      // Even if signOut fails, force a redirect to clear the session UI
      window.location.replace(status === "deleted" ? "/?error=account_deleted" : "/?error=session_conflict");
    });
  }, [isConflict, status]);

  return null;
}
