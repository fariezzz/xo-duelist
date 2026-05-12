"use client";

import React from "react";
import type { UserStatus } from "../../lib/statusUtils";
import { STATUS_COLOR } from "../../lib/statusUtils";

type StatusDotProps = {
  status: UserStatus;
  size?: number;
};

export default function StatusDot({ status, size = 10 }: StatusDotProps) {
  const pulsing = status === "online" || status === "in_room" || status === "matchmaking";

  return (
    <>
      <span
        className={`status-dot ${pulsing ? "is-pulsing" : ""}`}
        style={{
          width: size,
          height: size,
          backgroundColor: STATUS_COLOR[status],
        }}
      />
      <style jsx>{`
        .status-dot {
          display: inline-block;
          border-radius: 999px;
          box-shadow: 0 0 0 1px rgba(10, 15, 30, 0.9);
          flex-shrink: 0;
        }

        .status-dot.is-pulsing {
          animation: dot-pulse 1.6s ease-in-out infinite;
        }

        @keyframes dot-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.15);
            opacity: 0.7;
          }
        }
      `}</style>
    </>
  );
}

