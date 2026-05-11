"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const ROUTE_BGM_MAP: Record<string, { src: string; volume: number }> = {
  home: { src: "/sounds/bgm-home.mp3", volume: 0.3 },
  game: { src: "/sounds/bgm-game.mp3", volume: 0.12 },
  matchmaking: { src: "/sounds/bgm-matchmaking.mp3", volume: 0.32 },
  lobby: { src: "/sounds/bgm-lobby.mp3", volume: 0.28 },
};

function getTrackConfig(pathname: string) {
  if (!pathname) return ROUTE_BGM_MAP.home;
  if (pathname.startsWith("/game/") || pathname === "/training") return ROUTE_BGM_MAP.game;
  if (pathname.startsWith("/lobby")) return ROUTE_BGM_MAP.lobby;
  if (pathname === "/matchmaking") return ROUTE_BGM_MAP.matchmaking;
  return ROUTE_BGM_MAP.home;
}

export default function BackgroundMusic() {
  const pathname = usePathname();
  const isHomeRoute = pathname === "/dashboard";
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(() => getTrackConfig(pathname || "/"));

  // Hard gate: while true, all audio.play() calls are blocked
  const battleIntroActiveRef = useRef(false);

  // Safe play — respects the battle intro gate
  const safePlay = (audio: HTMLAudioElement) => {
    if (battleIntroActiveRef.current) return;
    audio.play().catch((err) => console.warn("Audio play blocked:", err));
  };

  // Restore mute preference
  useEffect(() => {
    const saved = localStorage.getItem("bgm_muted");
    if (saved === "false") setIsMuted(false);
  }, []);

  // Track change on route navigation
  useEffect(() => {
    const nextTrack = getTrackConfig(pathname || "/");
    if (nextTrack.src !== currentTrack.src) {
      setCurrentTrack(nextTrack);
    }
  }, [pathname, currentTrack.src]);

  // Load & switch track src
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src && !audio.src.endsWith(currentTrack.src)) {
      audio.src = currentTrack.src;
      audio.volume = currentTrack.volume;
      if (!isMuted && hasInteracted) safePlay(audio);
    } else if (!audio.src) {
      audio.src = currentTrack.src;
      audio.volume = currentTrack.volume;
    } else {
      audio.volume = currentTrack.volume;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, isMuted, hasInteracted]);

  // Mute / unmute
  useEffect(() => {
    localStorage.setItem("bgm_muted", isMuted.toString());
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) {
      audio.pause();
    } else if (hasInteracted) {
      safePlay(audio);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted, hasInteracted]);

  // First interaction → unlock autoplay
  useEffect(() => {
    const handleInteraction = () => {
      if (hasInteracted) return;
      setHasInteracted(true);
      if (!isMuted && audioRef.current) safePlay(audioRef.current);
    };
    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInteracted, isMuted]);

  // ── Battle intro coordination ────────────────────────────
  useEffect(() => {
    const handleIntroStart = () => {
      // Hard-block any play() while intro is active
      battleIntroActiveRef.current = true;
      const audio = audioRef.current;
      if (audio && !audio.paused) audio.pause();
    };

    const handleIntroDone = () => {
      battleIntroActiveRef.current = false;
      const audio = audioRef.current;
      if (!audio || isMuted) return;
      // Fade in from 0 → target volume over ~1.2 s
      audio.volume = 0;
      audio.play().catch(() => {});
      const target = currentTrack.volume;
      const steps = 24;
      const stepMs = 1200 / steps;
      let step = 0;
      const id = setInterval(() => {
        step++;
        if (audio) audio.volume = Math.min(target, (target / steps) * step);
        if (step >= steps) clearInterval(id);
      }, stepMs);
    };

    window.addEventListener("battle-intro-start", handleIntroStart);
    window.addEventListener("battle-intro-done", handleIntroDone);
    return () => {
      window.removeEventListener("battle-intro-start", handleIntroStart);
      window.removeEventListener("battle-intro-done", handleIntroDone);
    };
  }, [isMuted, currentTrack.volume]);

  return (
    <>
      <audio ref={audioRef} loop preload="auto" />

      <button
        className={`bgm-toggle ${isHomeRoute ? "has-bottom-nav" : ""}`}
        onClick={() => setIsMuted(!isMuted)}
        aria-label={isMuted ? "Unmute music" : "Mute music"}
        title={isMuted ? "Unmute Music" : "Mute Music"}
        style={{
          zIndex: 9999,
          borderRadius: "50%",
          background: "rgba(13, 21, 38, 0.85)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: isMuted ? "var(--text-muted)" : "var(--accent-gold)",
          boxShadow: isMuted ? "0 4px 12px rgba(0,0,0,0.3)" : "0 0 15px rgba(245, 158, 11, 0.3)",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          fontSize: "1.2rem",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.1) translateY(-2px)";
          e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1) translateY(0)";
          e.currentTarget.style.background = "rgba(13, 21, 38, 0.85)";
        }}
      >
        {isMuted ? "\u{1F507}" : "\u{1F3B5}"}
      </button>

      <style jsx>{`
        .bgm-toggle {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 46px;
          height: 46px;
        }

        @media (max-width: 768px) {
          .bgm-toggle {
            right: 14px;
            bottom: 14px;
            width: 44px;
            height: 44px;
          }

          .bgm-toggle.has-bottom-nav {
            bottom: 76px;
            bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
          }
        }
      `}</style>
    </>
  );
}
