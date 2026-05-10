"use client";
import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const ROUTE_BGM_MAP: Record<string, { src: string, volume: number }> = {
  home: { src: '/sounds/bgm-home.mp3', volume: 0.30 },
  game: { src: '/sounds/bgm-game.mp3', volume: 0.12 }, // Lowered to make in-game SFX pop
  matchmaking: { src: '/sounds/bgm-matchmaking.mp3', volume: 0.32 },
  lobby: { src: '/sounds/bgm-lobby.mp3', volume: 0.28 },
};

function getTrackConfig(pathname: string) {
  if (!pathname) return ROUTE_BGM_MAP.home;
  if (pathname.startsWith('/game/') || pathname === '/training') return ROUTE_BGM_MAP.game;
  if (pathname.startsWith('/lobby')) return ROUTE_BGM_MAP.lobby;
  if (pathname === '/matchmaking') return ROUTE_BGM_MAP.matchmaking;
  // default
  return ROUTE_BGM_MAP.home;
}

export default function BackgroundMusic() {
  const pathname = usePathname();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(() => getTrackConfig(pathname || '/'));

  // Initialize from localStorage (default to playing unless user explicitly muted before)
  useEffect(() => {
    const saved = localStorage.getItem('bgm_muted');
    if (saved === 'false') {
      setIsMuted(false);
    }
  }, []);

  // Update track config when pathname changes
  useEffect(() => {
    const nextTrack = getTrackConfig(pathname || '/');
    if (nextTrack.src !== currentTrack.src) {
      setCurrentTrack(nextTrack);
    }
  }, [pathname, currentTrack.src]);

  // Handle track changes and fading
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.src && !audio.src.endsWith(currentTrack.src)) {
      // Safe src change without complex fade for now to ensure stability
      audio.src = currentTrack.src;
      audio.volume = currentTrack.volume;
      if (!isMuted && hasInteracted) {
        audio.play().catch(e => console.warn("Audio play blocked:", e));
      }
    } else if (!audio.src) {
      audio.src = currentTrack.src;
      audio.volume = currentTrack.volume;
    } else {
      // Just update volume if same track
      audio.volume = currentTrack.volume;
    }
  }, [currentTrack, isMuted, hasInteracted]);

  // Handle play/pause based on mute state
  useEffect(() => {
    localStorage.setItem('bgm_muted', isMuted.toString());
    const audio = audioRef.current;
    if (audio) {
      if (isMuted) {
        audio.pause();
      } else if (hasInteracted) {
        audio.play().catch(e => console.warn("Audio play blocked:", e));
      }
    }
  }, [isMuted, hasInteracted]);

  // Handle first interaction (browsers block audio until the user interacts with the page)
  useEffect(() => {
    const handleInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
        if (!isMuted && audioRef.current) {
          audioRef.current.play().catch(e => console.warn("Audio play blocked:", e));
        }
      }
    };

    // Listen for common interactions
    document.addEventListener('click', handleInteraction, { once: true });
    document.addEventListener('keydown', handleInteraction, { once: true });

    return () => {
      document.removeEventListener('click', handleInteraction);
      document.removeEventListener('keydown', handleInteraction);
    };
  }, [hasInteracted, isMuted]);

  return (
    <>
      {/* Native HTML5 Audio Element */}
      <audio
        ref={audioRef}
        loop
        preload="auto"
      />
      
      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsMuted(!isMuted)}
        title={isMuted ? "Unmute Music" : "Mute Music"}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          background: 'rgba(13, 21, 38, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: isMuted ? 'var(--text-muted)' : 'var(--accent-gold)',
          boxShadow: isMuted ? '0 4px 12px rgba(0,0,0,0.3)' : '0 0 15px rgba(245, 158, 11, 0.3)',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          fontSize: '1.2rem',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1) translateY(-2px)';
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1) translateY(0)';
          e.currentTarget.style.background = 'rgba(13, 21, 38, 0.85)';
        }}
      >
        {isMuted ? '🔇' : '🎵'}
      </button>
    </>
  );
}
