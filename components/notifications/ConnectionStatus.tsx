"use client";
import React from "react";
import type { ConnectionState } from "../../context/NotificationContext";

interface Props {
  status: ConnectionState;
}

export default function ConnectionStatus({ status }: Props) {
  const labels: Record<ConnectionState, string> = {
    connected: "Live",
    reconnecting: "Reconnecting",
    disconnected: "Disconnected",
  };

  return (
    <div className="connection-pill">
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
    </div>
  );
}
