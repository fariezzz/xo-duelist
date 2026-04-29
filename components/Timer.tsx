"use client";
import React, { useEffect, useState } from 'react';

type Props = {
  seconds: number;
  onExpire?: () => void;
  run?: boolean;
  keySeed?: string | number;
};

export default function Timer({ seconds, onExpire, run = true, keySeed }: Props) {
  const [time, setTime] = useState(seconds);

  useEffect(() => {
    setTime(seconds);
  }, [seconds, keySeed]);

  useEffect(() => {
    if (!run) return;
    if (time <= 0) {
      onExpire && onExpire();
      return;
    }
    const t = setTimeout(() => setTime((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [time, run, onExpire]);

  const pct = Math.max(0, Math.min(100, Math.round((time / seconds) * 100)));
  const isLow = time <= 5;

  // Gradient from violet → gold, turns red when low
  const barGradient = isLow
    ? 'linear-gradient(90deg, #ef4444, #dc2626)'
    : 'linear-gradient(90deg, #7c3aed, #a78bfa, #f59e0b)';

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '1.1rem',
            color: isLow ? '#ef4444' : 'var(--text-primary)',
            minWidth: '36px',
            textAlign: 'center',
            transition: 'color 0.3s',
          }}
        >
          {time}s
        </div>
        <div
          style={{
            flex: 1,
            height: '8px',
            background: 'rgba(255, 255, 255, 0.06)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: barGradient,
              borderRadius: '4px',
              transition: 'width 1s linear',
              boxShadow: isLow
                ? '0 0 12px rgba(239, 68, 68, 0.5)'
                : '0 0 8px rgba(124, 58, 237, 0.3)',
            }}
          />
        </div>
      </div>
    </div>
  );
}
