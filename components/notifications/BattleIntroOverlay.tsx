"use client";

/**
 * BattleIntroOverlay
 *
 * Full-screen opening cinematic rendered via React portal into document.body.
 *
 * Sequence (total ~4 s):
 *   0.0 s — panels slide in from left/right, VS appears
 *   1.5 s — VS fades out, READY appears with glow pulse
 *   2.6 s — READY fades out, FIGHT flashes in
 *   3.5 s — panels slide back out, overlay fades
 *   3.85 s — component unmounts (onDone called)
 *
 * Guards against:
 *   - React Strict Mode double-mount (hasFiredRef)
 *   - Realtime-triggered re-renders (sessionStorage flag)
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { createPortal } from "react-dom";

/* ── Types ─────────────────────────────────────────────── */

export interface BattleIntroPlayer {
  name: string;
  avatarUrl?: string | null;
  elo?: number;
}

export interface BattleIntroOverlayProps {
  /** Unique key to prevent double-trigger across remounts (e.g. roomId) */
  sessionKey: string;
  playerX: BattleIntroPlayer;
  playerO: BattleIntroPlayer;
  /** Called once the animation fully completes and overlay is gone */
  onDone: () => void;
}

/* ── Helpers ────────────────────────────────────────────── */

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function Avatar({
  player,
  side,
}: {
  player: BattleIntroPlayer;
  side: "x" | "o";
}) {
  return (
    <div className={`bi-avatar bi-avatar--${side}`}>
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt={player.name} />
      ) : (
        <div className="bi-avatar-initials">{getInitials(player.name)}</div>
      )}
    </div>
  );
}

/* ── Step type ─────────────────────────────────────────── */
type Step = "vs" | "ready" | "fight" | "exit";

/* ── Main component ─────────────────────────────────────── */

export default function BattleIntroOverlay({
  sessionKey,
  playerX,
  playerO,
  onDone,
}: BattleIntroOverlayProps) {
  // ── Strict-mode + realtime double-fire guard ──
  const storageKey = `bi-seen-${sessionKey}`;

  // Ref to ensure onDone fires exactly once even under StrictMode
  const hasFiredRef = useRef(false);

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>("vs");
  const [exiting, setExiting] = useState(false);
  const [gone, setGone] = useState(false);

  const doneOnce = useCallback(() => {
    if (hasFiredRef.current) return;
    hasFiredRef.current = true;
    onDone();
  }, [onDone]);

  // Wait for client mount (portal needs document)
  useEffect(() => {
    setMounted(true);
  }, []);

  // ── Sequence timer ──
  useEffect(() => {
    if (!mounted) return;

    // Mark as seen so realtime updates don't re-trigger
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch { /* ignore SSR / private mode */ }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // t=1.5s → switch VS → READY
    timers.push(setTimeout(() => setStep("ready"), 1500));

    // t=2.6s → switch READY → FIGHT
    timers.push(setTimeout(() => setStep("fight"), 2600));

    // t=3.5s → begin exit (panels slide out + overlay fade)
    timers.push(
      setTimeout(() => {
        setStep("exit");
        setExiting(true);
      }, 3500)
    );

    // t=3.85s → fully gone, call onDone
    timers.push(
      setTimeout(() => {
        setGone(true);
        doneOnce();
      }, 3850)
    );

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Don't render until we're on the client AND not yet gone
  if (!mounted || gone) return null;

  const overlay = (
    <div
      className={`bi-overlay${exiting ? " bi-overlay-fadeout" : ""}`}
      aria-live="assertive"
      aria-label="Battle intro animation"
      role="presentation"
    >
      {/* ── Left panel — Player X ─────────────── */}
      <div className={`bi-panel bi-panel--left${exiting ? " bi-panel--exit" : ""}`}>
        <div className="bi-symbol bi-symbol--x">X</div>
        <div className="bi-player-info">
          <Avatar player={playerX} side="x" />
          <div className="bi-player-name bi-player-name--x">{playerX.name}</div>
          <div className="bi-player-label bi-player-label--x">Player X</div>
        </div>
      </div>

      {/* ── Right panel — Player O ────────────── */}
      <div className={`bi-panel bi-panel--right${exiting ? " bi-panel--exit" : ""}`}>
        <div className="bi-symbol bi-symbol--o">O</div>
        <div className="bi-player-info">
          <Avatar player={playerO} side="o" />
          <div className="bi-player-name bi-player-name--o">{playerO.name}</div>
          <div className="bi-player-label bi-player-label--o">Player O</div>
        </div>
      </div>

      {/* ── Center: VS / READY / FIGHT ────────── */}
      <div className="bi-center" aria-hidden="true">
        {step === "vs" && (
          <>
            <div className="bi-divider" />
            <div className="bi-center-text bi-vs-text">VS</div>
            <div className="bi-divider" />
          </>
        )}

        {step === "ready" && (
          <div className="bi-center-text bi-ready-text">READY?</div>
        )}

        {(step === "fight" || step === "exit") && (
          <div className="bi-center-text bi-fight-text">FIGHT!</div>
        )}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ── Static helper: check if overlay should show ──────── */

/**
 * Returns true if the battle intro should be shown.
 * Checks the sessionStorage flag to avoid showing twice.
 */
export function shouldShowBattleIntro(sessionKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !sessionStorage.getItem(`bi-seen-${sessionKey}`);
  } catch {
    return false;
  }
}
