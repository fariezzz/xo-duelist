"use client";
import React, { useEffect, useRef, useState } from 'react';

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Default to muted to respect user experience and browser policies
  const [isMuted, setIsMuted] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('bgm_muted');
    if (saved === 'false') {
      setIsMuted(false);
    }
    
    // Set default volume slightly lower so it doesn't drown out SFX
    if (audioRef.current) {
      audioRef.current.volume = 0.35;
    }
  }, []);

  // Save to localStorage and update audio state
  useEffect(() => {
    localStorage.setItem('bgm_muted', isMuted.toString());
    if (audioRef.current) {
      if (isMuted) {
        audioRef.current.pause();
      } else if (hasInteracted) {
        audioRef.current.play().catch(e => console.warn("Audio play blocked:", e));
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
        src="/sounds/bgm.mp3"
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
