"use client";
import React from 'react';

type Props = {
  username: string;
  elo: number;
  symbol?: 'X' | 'O';
  you?: boolean;
  active?: boolean;
};

export default function PlayerCard({ username, elo, symbol, you, active }: Props) {
  const symbolColor = symbol === 'X' ? '#a78bfa' : '#fbbf24';
  const symbolGlow =
    symbol === 'X'
      ? '0 0 12px rgba(124, 58, 237, 0.5)'
      : '0 0 12px rgba(245, 158, 11, 0.5)';

  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px 18px',
        borderColor: active ? (symbol === 'X' ? 'rgba(124,58,237,0.4)' : 'rgba(245,158,11,0.4)') : undefined,
        boxShadow: active ? (symbol === 'X' ? '0 0 20px rgba(124,58,237,0.15)' : '0 0 20px rgba(245,158,11,0.15)') : undefined,
        transition: 'all 0.3s ease',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: `linear-gradient(135deg, #7c3aed, #f59e0b)`,
          padding: '2px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'var(--bg-layer-1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '1.1rem',
            color: symbolColor,
            textShadow: symbolGlow,
          }}
        >
          {symbol || username.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: '1rem',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {username}
          {you && (
            <span
              style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: '6px',
                background: 'rgba(124, 58, 237, 0.2)',
                color: '#a78bfa',
                fontWeight: 600,
                letterSpacing: '0.04em',
              }}
            >
              YOU
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '0.85rem',
            color: 'var(--accent-gold)',
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            marginTop: '2px',
          }}
        >
          ELO: {elo}
        </div>
      </div>
    </div>
  );
}
