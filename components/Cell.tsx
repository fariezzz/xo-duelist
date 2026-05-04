"use client";
import React from 'react';

type Props = {
  value: 'X' | 'O' | 'BARRIER' | null;
  onClick: () => void;
  highlight?: boolean;
  disabled?: boolean;
  isPowerCell?: boolean;
  isCursedRevealed?: boolean;
  isBlinded?: boolean;
  skillTargetMode?: boolean;
  isShuffling?: boolean;
};

export default function Cell({
  value,
  onClick,
  highlight,
  disabled,
  isPowerCell,
  isCursedRevealed,
  isBlinded,
  skillTargetMode,
  isShuffling,
}: Props) {
  const size = 70;

  const isBarrier = value === 'BARRIER';
  const isEmpty = value === null;
  const isFilled = value === 'X' || value === 'O';

  // --- Border & background ---
  let borderColor = 'rgba(124, 58, 237, 0.4)';
  let background = 'rgba(124, 58, 237, 0.06)';
  let boxShadow = '0 0 15px rgba(124, 58, 237, 0.15)';
  let animation: string | undefined;

  if (highlight) {
    borderColor = 'rgba(16, 185, 129, 0.6)';
    background = 'rgba(16, 185, 129, 0.1)';
    boxShadow = '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1)';
    animation = 'pulse-glow 1.5s ease-in-out infinite';
  } else if (isPowerCell && isEmpty) {
    borderColor = 'rgba(245, 158, 11, 0.7)';
    background = 'rgba(245, 158, 11, 0.12)';
    boxShadow = '0 0 20px rgba(245, 158, 11, 0.4), 0 0 40px rgba(245, 158, 11, 0.15), inset 0 0 15px rgba(245, 158, 11, 0.08)';
    animation = 'golden-pulse 2s ease-in-out infinite';
  } else if (isCursedRevealed) {
    borderColor = 'rgba(239, 68, 68, 0.6)';
    background = 'rgba(239, 68, 68, 0.1)';
    boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
  } else if (isBarrier) {
    borderColor = 'rgba(148, 163, 184, 0.4)';
    background = 'rgba(148, 163, 184, 0.08)';
    boxShadow = '0 0 10px rgba(148, 163, 184, 0.15)';
  } else if (skillTargetMode && !disabled) {
    borderColor = 'rgba(168, 85, 247, 0.7)';
    background = 'rgba(168, 85, 247, 0.12)';
    boxShadow = '0 0 15px rgba(168, 85, 247, 0.3)';
    animation = 'pulse-glow 1.5s ease-in-out infinite';
  }

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor,
    background,
    boxShadow,
    cursor: disabled && !skillTargetMode ? 'not-allowed' : 'pointer',
    transition: 'all 0.3s ease',
    position: 'relative',
    overflow: 'hidden',
    opacity: disabled && !skillTargetMode ? 0.85 : 1,
    animation,
  };

  if (isShuffling) {
    baseStyle.animation = 'card-flip 0.6s ease-in-out';
  }

  // Blind overlay
  const blindOverlay = isBlinded && isFilled ? (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(10, 15, 30, 0.85)',
      backdropFilter: 'blur(4px)',
      borderRadius: '10px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '1.2rem',
    }}>
      ?
    </div>
  ) : null;

  const xStyle: React.CSSProperties = {
    fontSize: '1.75rem', fontWeight: 800,
    fontFamily: 'var(--font-heading)', color: '#a78bfa',
    textShadow: '0 0 12px rgba(124, 58, 237, 0.6), 0 0 24px rgba(124, 58, 237, 0.3)',
    lineHeight: 1,
  };

  const oStyle: React.CSSProperties = {
    fontSize: '1.75rem', fontWeight: 800,
    fontFamily: 'var(--font-heading)', color: '#fbbf24',
    textShadow: '0 0 12px rgba(245, 158, 11, 0.6), 0 0 24px rgba(245, 158, 11, 0.3)',
    lineHeight: 1,
  };

  let content: React.ReactNode;
  if (isBarrier) {
    content = <span style={{ fontSize: '1.5rem' }}>🛡️</span>;
  } else if (value === 'X') {
    content = <span style={xStyle}>X</span>;
  } else if (value === 'O') {
    content = <span style={oStyle}>O</span>;
  } else if (isPowerCell) {
    content = <span style={{ fontSize: '1.3rem', filter: 'drop-shadow(0 0 6px rgba(245,158,11,0.6))' }}>✦</span>;
  } else if (isCursedRevealed) {
    content = <span style={{ fontSize: '1.3rem' }}>💀</span>;
  } else {
    content = <span style={{ fontSize: '1.25rem', color: 'rgba(255,255,255,0.15)', lineHeight: 1 }}>·</span>;
  }

  return (
    <button style={baseStyle} onClick={onClick} disabled={isBarrier || (disabled && !skillTargetMode)}>
      {content}
      {blindOverlay}
    </button>
  );
}
