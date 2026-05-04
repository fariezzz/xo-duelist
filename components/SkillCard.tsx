"use client";
import React from 'react';
import { SKILL_META, type SkillType } from '../lib/mechanics';

type Props = {
  skill: SkillType | null;
  onUseSkill: () => void;
  disabled?: boolean;
  isNew?: boolean; // flash animation when skill just received
};

export default function SkillCard({ skill, onUseSkill, disabled, isNew }: Props) {
  if (!skill) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding: '14px 20px',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-heading)',
        fontSize: '0.85rem',
        opacity: 0.6,
      }}>
        No skill yet — find a Power Cell! ✦
      </div>
    );
  }

  const meta = SKILL_META[skill];

  return (
    <div style={{
      background: 'rgba(124, 58, 237, 0.08)',
      border: '1px solid rgba(124, 58, 237, 0.3)',
      borderRadius: '12px',
      padding: '14px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      animation: isNew ? 'skill-reveal 0.6s ease-out' : undefined,
      boxShadow: isNew ? '0 0 25px rgba(245,158,11,0.3)' : '0 0 15px rgba(124,58,237,0.1)',
      transition: 'all 0.3s ease',
    }}>
      {/* Icon */}
      <div style={{
        fontSize: '1.8rem',
        width: '44px', height: '44px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(124,58,237,0.15)',
        borderRadius: '10px',
        flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 700,
          fontSize: '1rem', color: 'var(--text-primary)',
        }}>
          {meta.name}
        </div>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px',
        }}>
          {meta.desc}
        </div>
      </div>

      {/* Use button */}
      <button
        className="btn btn-primary"
        onClick={onUseSkill}
        disabled={disabled}
        style={{
          padding: '8px 16px',
          fontSize: '0.82rem',
          fontWeight: 700,
          borderRadius: '8px',
          flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        Use
      </button>
    </div>
  );
}
