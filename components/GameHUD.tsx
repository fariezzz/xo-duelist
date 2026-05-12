"use client";
import React from 'react';
import { Swords } from 'lucide-react';
import { CURSE_META, type PlayerCurse } from '../lib/mechanics';
import { CurseIcon, ShuffleIcon } from './MechanicIcon';

type Props = {
  turnCount: number;
  nextShuffleAt: number;
  activeCurse?: PlayerCurse | null;
};

export default function GameHUD({ turnCount, nextShuffleAt, activeCurse }: Props) {
  const turnsUntilShuffle = nextShuffleAt - turnCount;
  const shuffleSoon = turnsUntilShuffle <= 1 && turnsUntilShuffle > 0;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: '20px', marginBottom: '12px', flexWrap: 'wrap',
    }}>
      <div style={{
        fontFamily: 'var(--font-heading)', fontWeight: 600,
        fontSize: '0.85rem', color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px', padding: '6px 14px',
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      }}>
        <Swords size={14} color="#a78bfa" />
        Turn <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{turnCount}</span>
      </div>

      <div style={{
        fontFamily: 'var(--font-heading)', fontWeight: 600,
        fontSize: '0.85rem',
        color: shuffleSoon ? '#f59e0b' : 'var(--text-muted)',
        background: shuffleSoon ? 'rgba(245,158,11,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${shuffleSoon ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '8px', padding: '6px 14px',
        animation: shuffleSoon ? 'pulse-glow 1.5s ease-in-out infinite' : undefined,
        display: 'inline-flex', alignItems: 'center', gap: '6px',
      }}>
        <ShuffleIcon size={14} color={shuffleSoon ? '#fbbf24' : 'var(--text-muted)'} />
        Shuffle in <span style={{ fontWeight: 700, color: shuffleSoon ? '#fbbf24' : 'var(--text-primary)' }}>
          {turnsUntilShuffle > 0 ? turnsUntilShuffle : 0}
        </span> turns
      </div>

      {activeCurse && (
        <div style={{
          fontFamily: 'var(--font-heading)', fontWeight: 600,
          fontSize: '0.85rem', color: '#ef4444',
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px', padding: '6px 14px',
          animation: 'pulse-glow 2s ease-in-out infinite',
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}>
          <CurseIcon curse={activeCurse.type} size={14} />
          {CURSE_META[activeCurse.type].name}
          <span style={{ opacity: 0.7 }}>({activeCurse.turns_remaining})</span>
        </div>
      )}
    </div>
  );
}
