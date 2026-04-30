"use client";
import React from "react";
import type { BannerItem, ToastType } from "../../context/NotificationContext";

const BANNER_COLORS: Record<ToastType, string> = {
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#7c3aed",
  special: "#fbbf24",
};

interface Props {
  banner: BannerItem | null;
}

export default function GameBanner({ banner }: Props) {
  if (!banner) return null;

  const color = BANNER_COLORS[banner.type];
  const classes = `game-banner ${banner.exiting ? "exiting" : ""} ${banner.pulse ? "pulse" : ""}`;

  return (
    <div
      className={classes}
      style={{
        borderBottomColor: color,
        color,
        textShadow: `0 0 12px ${color}50`,
      }}
    >
      {banner.icon && <span>{banner.icon}</span>}
      <span>{banner.message}</span>
    </div>
  );
}
