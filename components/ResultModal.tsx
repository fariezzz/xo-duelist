"use client";
import React from "react";

export type ResultOutcome = "win" | "lose" | "draw";

interface Props {
  open: boolean;
  outcome?: ResultOutcome;
  eloChange?: number;
  newElo?: number;
  opponentName?: string;
  onPlayAgain?: () => void;
  onDashboard?: () => void;
  /* Legacy compat — used by training mode */
  title?: string;
  message?: string;
  onClose?: () => void;
}

const OUTCOME_CONFIG = {
  win: {
    icon: "🏆",
    label: "VICTORY",
    titleColor: "#fbbf24",
    borderColor: "rgba(245, 158, 11, 0.5)",
    glowColor: "0 0 60px rgba(245,158,11,0.2), 0 0 120px rgba(124,58,237,0.1)",
    iconClass: "win-burst",
    eloColor: "#10b981",
    eloPrefix: "+",
    vignetteStyle: undefined as React.CSSProperties | undefined,
  },
  lose: {
    icon: "💔",
    label: "DEFEAT",
    titleColor: "#ef4444",
    borderColor: "rgba(239, 68, 68, 0.4)",
    glowColor: "0 0 40px rgba(239, 68, 68, 0.15)",
    iconClass: "",
    eloColor: "#ef4444",
    eloPrefix: "",
    vignetteStyle: { boxShadow: "inset 0 0 120px rgba(239,68,68,0.08)" } as React.CSSProperties,
  },
  draw: {
    icon: "🤝",
    label: "DRAW",
    titleColor: "#94a3b8",
    borderColor: "rgba(148, 163, 184, 0.3)",
    glowColor: "0 0 40px rgba(148, 163, 184, 0.1)",
    iconClass: "",
    eloColor: "#94a3b8",
    eloPrefix: "±",
    vignetteStyle: undefined as React.CSSProperties | undefined,
  },
};

export default function ResultModal({
  open,
  outcome,
  eloChange,
  newElo,
  opponentName,
  onPlayAgain,
  onDashboard,
  title,
  message,
  onClose,
}: Props) {
  if (!open) return null;

  // Legacy mode (training page compatibility)
  if (!outcome && title) {
    const isWin = title.toLowerCase().includes("win");
    const isLoss = title.toLowerCase().includes("lose");
    const legacyOutcome: ResultOutcome = isWin ? "win" : isLoss ? "lose" : "draw";
    const cfg = OUTCOME_CONFIG[legacyOutcome];

    return (
      <div className="result-overlay">
        <div
          className="card result-card"
          style={{ borderColor: cfg.borderColor, boxShadow: cfg.glowColor }}
        >
          <div className={`result-icon ${cfg.iconClass}`}>{cfg.icon}</div>
          <div className="result-title" style={{ color: cfg.titleColor }}>{title}</div>
          {message && <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", marginBottom: "24px" }}>{message}</p>}
          <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>Continue</button>
        </div>
      </div>
    );
  }

  if (!outcome) return null;

  const cfg = OUTCOME_CONFIG[outcome];
  const eloStr = eloChange !== undefined
    ? `${cfg.eloPrefix}${Math.abs(eloChange)} ELO`
    : null;

  return (
    <div className="result-overlay" style={cfg.vignetteStyle}>
      <div
        className="card result-card"
        style={{ borderColor: cfg.borderColor, boxShadow: cfg.glowColor }}
      >
        {/* Icon */}
        <div className={`result-icon ${cfg.iconClass}`}>{cfg.icon}</div>

        {/* Title */}
        <div className="result-title" style={{ color: cfg.titleColor }}>{cfg.label}</div>

        {/* ELO change */}
        {eloStr && (
          <div className="result-elo-change" style={{ color: cfg.eloColor }}>{eloStr}</div>
        )}

        {/* New total */}
        {newElo !== undefined && (
          <div className="result-elo-total">
            New ELO: <span style={{ color: "var(--accent-gold)", fontWeight: 700 }}>{newElo}</span>
          </div>
        )}

        {/* Opponent */}
        {opponentName && (
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "20px" }}>
            vs <span style={{ fontWeight: 600 }}>{opponentName}</span>
          </div>
        )}

        {/* Actions */}
        <div className="result-actions">
          {onPlayAgain && (
            <button className="btn btn-primary" onClick={onPlayAgain} style={{ width: "100%" }}>
              ⚔️ Play Again
            </button>
          )}
          {onDashboard && (
            <button className="btn btn-ghost" onClick={onDashboard} style={{ width: "100%" }}>
              ← Back to Dashboard
            </button>
          )}
          {onClose && !onPlayAgain && !onDashboard && (
            <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
