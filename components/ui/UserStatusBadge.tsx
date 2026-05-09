"use client";

import React from "react";
import type { UserStatus } from "../../lib/statusUtils";
import { STATUS_LABEL, STATUS_COLOR } from "../../lib/statusUtils";
import StatusDot from "./StatusDot";

type UserStatusBadgeProps = {
  status: UserStatus;
  showLabel?: boolean;
};

export default function UserStatusBadge({ status, showLabel = true }: UserStatusBadgeProps) {
  return (
    <span className="status-badge">
      <StatusDot status={status} />
      {showLabel && (
        <span className="status-label" style={{ color: STATUS_COLOR[status] }}>
          {STATUS_LABEL[status]}
        </span>
      )}
      <style jsx>{`
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .status-label {
          font-family: var(--font-heading);
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }
      `}</style>
    </span>
  );
}

