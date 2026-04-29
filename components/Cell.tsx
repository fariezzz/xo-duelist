"use client";
import React from 'react';

type Props = {
  value: 'X' | 'O' | null;
  onClick: () => void;
  highlight?: boolean;
  disabled?: boolean;
};

export default function Cell({ value, onClick, highlight, disabled }: Props) {
  const size = 64;
  const idleBorderColor = 'rgba(124, 58, 237, 0.4)';
  const idleBackground = 'rgba(124, 58, 237, 0.06)';
  const idleShadow = '0 0 15px rgba(124, 58, 237, 0.15)';

  const winningBorderColor = 'rgba(16, 185, 129, 0.6)';
  const winningBackground = 'rgba(16, 185, 129, 0.1)';
  const winningShadow = '0 0 20px rgba(16, 185, 129, 0.3), 0 0 40px rgba(16, 185, 129, 0.1)';

  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: highlight ? winningBorderColor : idleBorderColor,
    background: highlight ? winningBackground : idleBackground,
    boxShadow: highlight ? winningShadow : idleShadow,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
    opacity: disabled ? 0.85 : 1,
  };

  // Winning highlight
  if (highlight) {
    baseStyle.animation = 'pulse-glow 1.5s ease-in-out infinite';
  }

  const xStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    fontWeight: 800,
    fontFamily: 'var(--font-heading)',
    color: '#a78bfa',
    textShadow: '0 0 12px rgba(124, 58, 237, 0.6), 0 0 24px rgba(124, 58, 237, 0.3)',
    lineHeight: 1,
  };

  const oStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    fontWeight: 800,
    fontFamily: 'var(--font-heading)',
    color: '#fbbf24',
    textShadow: '0 0 12px rgba(245, 158, 11, 0.6), 0 0 24px rgba(245, 158, 11, 0.3)',
    lineHeight: 1,
  };

  const emptyStyle: React.CSSProperties = {
    fontSize: '1.25rem',
    color: 'rgba(255,255,255,0.15)',
    lineHeight: 1,
  };

  return (
    <button
      style={baseStyle}
      onClick={onClick}
      disabled={disabled}
    >
      {value === 'X' ? (
        <span style={xStyle}>X</span>
      ) : value === 'O' ? (
        <span style={oStyle}>O</span>
      ) : (
        <span style={emptyStyle}>·</span>
      )}
    </button>
  );
}
