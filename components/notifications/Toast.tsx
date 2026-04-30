"use client";
import React, { useEffect, useRef, useState } from "react";
import type { ToastItem, ToastType } from "../../context/NotificationContext";

/* ── Color config per type ─────────────────────────────── */
const TYPE_CONFIG: Record<ToastType, { color: string; icon: string; bgTint: string }> = {
  success: { color: "#10b981", icon: "✓", bgTint: "rgba(16,185,129,0.12)" },
  error:   { color: "#ef4444", icon: "✗", bgTint: "rgba(239,68,68,0.12)" },
  warning: { color: "#f59e0b", icon: "⚠", bgTint: "rgba(245,158,11,0.12)" },
  info:    { color: "#7c3aed", icon: "ℹ", bgTint: "rgba(124,58,237,0.12)" },
  special: { color: "#fbbf24", icon: "⚔", bgTint: "rgba(251,191,36,0.12)" },
};

interface Props {
  toast: ToastItem;
  onDismiss: (id: string) => void;
}

export default function Toast({ toast, onDismiss }: Props) {
  const cfg = TYPE_CONFIG[toast.type];
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(Date.now());
  const elapsedBeforePause = useRef(0);

  // Countdown timer with pause support
  useEffect(() => {
    if (toast.type === "error" && !toast.duration) return; // errors stay
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    startRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const total = elapsedBeforePause.current + (now - startRef.current);
      setElapsed(total);
      if (total >= toast.duration) {
        onDismiss(toast.id);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [paused, toast.id, toast.duration, toast.type, onDismiss]);

  const handleMouseEnter = () => {
    elapsedBeforePause.current = elapsed;
    setPaused(true);
  };
  const handleMouseLeave = () => {
    setPaused(false);
  };

  // SVG countdown ring
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, elapsed / toast.duration);
  const dashOffset = circumference * (1 - progress);

  return (
    <div
      className={`toast ${toast.exiting ? "exiting" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        borderColor: `${cfg.color}40`,
        boxShadow: `0 8px 32px ${cfg.color}33`,
      }}
    >
      {/* Left accent bar */}
      <div className="toast-accent" style={{ background: cfg.color }} />

      {/* Icon */}
      <div className="toast-icon-box" style={{ background: cfg.bgTint, color: cfg.color }}>
        {cfg.icon}
      </div>

      {/* Body */}
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>

      {/* Countdown ring */}
      <svg className="toast-countdown" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r={radius} stroke="rgba(255,255,255,0.08)" />
        <circle
          cx="10" cy="10" r={radius}
          stroke={cfg.color}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: paused ? "none" : "stroke-dashoffset 0.1s linear", transform: "rotate(-90deg)", transformOrigin: "center" }}
        />
      </svg>

      {/* Close */}
      <button className="toast-close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
