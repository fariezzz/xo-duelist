"use client";

import { useEffect, useRef, useState } from "react";
import { usePresence } from "../hooks/usePresence";
import ConnectionStatus from "./notifications/ConnectionStatus";

export default function PresenceHeartbeat() {
  const { connectionStatus, connectionPingMs, hasSession } = usePresence();
  const previousStatusRef = useRef(connectionStatus);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const [showConnected, setShowConnected] = useState(false);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = connectionStatus;

    if (showTimerRef.current) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    if (!hasSession || connectionStatus !== "connected" || previousStatus === "connected") return;

    showTimerRef.current = window.setTimeout(() => {
      setShowConnected(true);
      hideTimerRef.current = window.setTimeout(() => {
        setShowConnected(false);
      }, 1800);
    }, 0);

    return () => {
      if (showTimerRef.current) {
        window.clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [connectionStatus, hasSession]);

  if (!hasSession) return null;
  if (connectionStatus === "connected" && !showConnected) return null;

  return <ConnectionStatus status={connectionStatus} pingMs={connectionPingMs} />;
}

