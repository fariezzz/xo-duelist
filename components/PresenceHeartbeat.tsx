"use client";

import { usePresence } from "../hooks/usePresence";

export default function PresenceHeartbeat() {
  usePresence();
  return null;
}

