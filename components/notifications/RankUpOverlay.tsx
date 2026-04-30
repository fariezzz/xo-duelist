"use client";
import React from "react";
import TierBadge from "../TierBadge";

interface Props {
  open: boolean;
  oldTier: string;
  newTier: string;
  newElo: number;
  onComplete: () => void;
}

export default function RankUpOverlay({ open, oldTier, newTier, newElo, onComplete }: Props) {
  // Auto-dismiss after 3s (hook must be before any early return)
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(onComplete, 3000);
    return () => clearTimeout(t);
  }, [open, onComplete]);

  if (!open) return null;

  return (
    <div className="rankup-overlay">
      <div className="rankup-title">RANK UP!</div>
      <div className="rankup-badge">
        <TierBadge elo={newElo} />
      </div>
      <div className="rankup-tiers">
        <span>{oldTier}</span>
        <span className="rankup-arrow">→</span>
        <span style={{ color: "#fbbf24" }}>{newTier}</span>
      </div>
    </div>
  );
}
