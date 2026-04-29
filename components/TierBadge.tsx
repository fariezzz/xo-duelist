"use client";
import React from 'react';

const tiers = [
  { name: 'Bronze', icon: '🥉', min: 0, gradient: 'linear-gradient(135deg, #92400e, #b45309)', glow: 'rgba(180, 83, 9, 0.3)' },
  { name: 'Silver', icon: '🥈', min: 800, gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)', glow: 'rgba(156, 163, 175, 0.3)' },
  { name: 'Gold', icon: '🥇', min: 1000, gradient: 'linear-gradient(135deg, #b45309, #f59e0b)', glow: 'rgba(245, 158, 11, 0.3)' },
  { name: 'Platinum', icon: '💎', min: 1200, gradient: 'linear-gradient(135deg, #0284c7, #38bdf8)', glow: 'rgba(56, 189, 248, 0.3)' },
  { name: 'Diamond', icon: '👑', min: 1400, gradient: 'linear-gradient(135deg, #6d28d9, #a78bfa)', glow: 'rgba(167, 139, 250, 0.3)' },
];

function getTier(elo: number) {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (elo >= tiers[i].min) return tiers[i];
  }
  return tiers[0];
}

export default function TierBadge({ elo }: { elo: number }) {
  const tier = getTier(elo);

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: '20px',
        background: tier.gradient,
        boxShadow: `0 0 12px ${tier.glow}`,
        fontFamily: 'var(--font-heading)',
        fontWeight: 600,
        fontSize: '0.75rem',
        letterSpacing: '0.04em',
        color: 'white',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ fontSize: '0.85rem' }}>{tier.icon}</span>
      {tier.name}
    </span>
  );
}

export { getTier };
