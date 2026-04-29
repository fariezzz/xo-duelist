"use client";
import React from 'react';

type Props = {
  open: boolean;
  title?: string;
  message?: string;
  onClose?: () => void;
};

export default function ResultModal({ open, title, message, onClose }: Props) {
  if (!open) return null;

  const isWin = title?.toLowerCase().includes('win');
  const isLoss = title?.toLowerCase().includes('lose');

  let borderColor = 'rgba(148, 163, 184, 0.3)';
  let glowColor = '0 0 40px rgba(148, 163, 184, 0.1)';
  let titleColor = 'var(--text-primary)';
  let icon = '🤝';

  if (isWin) {
    borderColor = 'rgba(124, 58, 237, 0.5)';
    glowColor = '0 0 60px rgba(124, 58, 237, 0.2), 0 0 120px rgba(245, 158, 11, 0.1)';
    titleColor = '#a78bfa';
    icon = '🏆';
  } else if (isLoss) {
    borderColor = 'rgba(239, 68, 68, 0.4)';
    glowColor = '0 0 40px rgba(239, 68, 68, 0.15)';
    titleColor = '#ef4444';
    icon = '💔';
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: 'fade-in 0.3s ease-out',
      }}
    >
      <div
        className="card"
        style={{
          width: '90%',
          maxWidth: '420px',
          padding: '32px',
          borderColor,
          boxShadow: glowColor,
          textAlign: 'center',
          animation: 'fade-in 0.4s ease-out',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>{icon}</div>
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '2rem',
            color: titleColor,
            marginBottom: '8px',
          }}
        >
          {title}
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '24px' }}>
          {message}
        </p>
        <button
          className="btn btn-primary"
          onClick={onClose}
          style={{ width: '100%' }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
