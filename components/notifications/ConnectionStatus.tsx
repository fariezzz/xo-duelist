"use client";
import React from "react";
import { SignalHigh, SignalLow, SignalMedium } from "lucide-react";
import type { ConnectionState } from "../../context/NotificationContext";

interface Props {
  status: ConnectionState;
  pingMs?: number | null;
}

export default function ConnectionStatus({ status, pingMs = null }: Props) {
  const labels: Record<ConnectionState, string> = {
    connected: "Connected",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
  };
  const pingTone =
    pingMs === null
      ? "unknown"
      : pingMs <= 100
        ? "excellent"
        : pingMs <= 250
          ? "good"
          : "poor";
  const PingIcon =
    pingTone === "excellent"
      ? SignalHigh
      : pingTone === "good"
        ? SignalMedium
        : pingTone === "poor"
          ? SignalLow
          : SignalMedium;

  return (
    <div className="connection-pill" role="status" aria-live="polite">
      <div className={`connection-dot ${status}`} />
      <span>{labels[status]}</span>
      {status === "reconnecting" && (
        <span style={{ display: "inline-flex", gap: "1px", marginLeft: "2px" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                animation: `dotBlink 1.4s ease-in-out ${i * 0.2}s infinite`,
                color: "#f59e0b",
              }}
            >
              .
            </span>
          ))}
        </span>
      )}
      {status === "reconnecting" && (
        <span className={`connection-ping ${pingTone}`} aria-label={pingMs === null ? "Ping not available yet" : `Ping ${pingMs} milliseconds`}>
          <PingIcon size={13} strokeWidth={2.5} aria-hidden="true" />
          {pingMs === null ? "... ms" : `${pingMs} ms`}
        </span>
      )}
    </div>
  );
}
