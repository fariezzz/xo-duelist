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

/* ── Web Audio whoosh helper ─────────────────────────────── */
function playWhoosh(type: "panel" | "transition" | "fight" = "panel") {
  if (typeof window === "undefined") return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, type === "fight" ? 1.2 : 2.2);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Bandpass filter for whoosh character
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = type === "fight" ? 900 : type === "transition" ? 600 : 400;
    filter.Q.value = type === "fight" ? 0.6 : 0.9;

    // Frequency sweep
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(type === "fight" ? 80 : 40, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(type === "fight" ? 600 : 300, ctx.currentTime + 0.35);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(type === "fight" ? 0.55 : 0.32, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.48);

    src.connect(filter);
    filter.connect(gain);
    osc.connect(gain);
    gain.connect(ctx.destination);

    src.start();
    osc.start();
    src.stop(ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);

    setTimeout(() => ctx.close(), 600);
  } catch {
    // Silently ignore if AudioContext not available
  }
}

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
  const openingAudioRef = useRef<HTMLAudioElement | null>(null);

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

  // Play opening.mpeg for the full duration of the intro
  useEffect(() => {
    if (!mounted) return;
    try {
      const audio = new Audio("/sounds/opening.mpeg");
      audio.volume = 0.75;
      audio.play().catch(() => {});
      openingAudioRef.current = audio;
    } catch { /* ignore */ }
    return () => {
      const audio = openingAudioRef.current;
      if (audio) { audio.pause(); audio.currentTime = 0; }
      openingAudioRef.current = null;
    };
  }, [mounted]);

  // ── Sequence timer ──
  useEffect(() => {
    if (!mounted) return;

    // Panel whoosh on entry
    playWhoosh("panel");

    // Mark as seen so realtime updates don't re-trigger
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch { /* ignore SSR / private mode */ }

    const timers: ReturnType<typeof setTimeout>[] = [];

    // t=1.5s → switch VS → READY
    timers.push(setTimeout(() => {
      setStep("ready");
      playWhoosh("transition");
    }, 1500));

    // t=2.6s → switch READY → FIGHT
    timers.push(setTimeout(() => {
      setStep("fight");
      playWhoosh("fight");
    }, 2600));

    // t=3.5s → begin exit (panels slide out + overlay fade)
    timers.push(
      setTimeout(() => {
        setStep("exit");
        setExiting(true);
      }, 3500)
    );

    // t=3.5s → fade out opening audio as panels exit
    timers.push(
      setTimeout(() => {
        const audio = openingAudioRef.current;
        if (audio) {
          const steps = 10;
          const stepMs = 350 / steps;
          let s = 0;
          const startVol = audio.volume;
          const fadeId = setInterval(() => {
            s++;
            if (audio) audio.volume = Math.max(0, startVol * (1 - s / steps));
            if (s >= steps) { clearInterval(fadeId); if (audio) { audio.pause(); } }
          }, stepMs);
        }
      }, 3500)
    );

    // t=3.85s → fully gone, call onDone and signal BGM to resume
    timers.push(
      setTimeout(() => {
        setGone(true);
        window.dispatchEvent(new CustomEvent("battle-intro-done"));
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
