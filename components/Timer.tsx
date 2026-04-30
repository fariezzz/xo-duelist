"use client";
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  seconds: number;
  onExpire?: () => void;
  onWarning?: (secondsLeft: number) => void;
  run?: boolean;
};

export default function Timer({ seconds, onExpire, onWarning, run = true }: Props) {
  const [time, setTime] = useState(seconds);
  const onExpireRef = useRef(onExpire);
  const onWarningRef = useRef(onWarning);

  // Keep refs fresh without causing effect re-fires
  useEffect(() => { onExpireRef.current = onExpire; }, [onExpire]);
  useEffect(() => { onWarningRef.current = onWarning; }, [onWarning]);

  useEffect(() => {
    if (!run) return;
    if (time <= 0) {
      onExpireRef.current?.();
      return;
    }
    const t = setTimeout(() => setTime((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [time, run]);

  // Trigger warning when ≤ 5s
  useEffect(() => {
    if (run && time <= 5 && time > 0) {
      onWarningRef.current?.(time);
    }
  }, [time, run]);

  const pct = Math.max(0, Math.min(100, Math.round((time / seconds) * 100)));
  const isLow = time <= 5;

  const barGradient = isLow
    ? 'linear-gradient(90deg, #ef4444, #dc2626)'
    : 'linear-gradient(90deg, #7c3aed, #a78bfa, #f59e0b)';

  return (
    <div style={{ width: '100%' }} className={isLow ? 'animate-shake' : ''}>
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
