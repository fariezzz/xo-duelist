"use client";
import React from 'react';
import Cell from './Cell';
import { Cell as CellType } from '../lib/gameLogic';
import type { PowerCell, CurseCell } from '../lib/mechanics';

type Props = {
  board: CellType[];
  onMove: (index: number) => void;
  disabled?: boolean;
  winningCells?: number[];
  powerCells?: PowerCell[];
  curseCells?: CurseCell[];
  blindedSymbol?: 'X' | 'O' | null; // if set, hide this symbol's cells
  mySymbol?: 'X' | 'O';
  skillTargetCells?: number[];
  isShuffling?: boolean;
};

export default function Board({
  board, onMove, disabled, winningCells = [],
  powerCells = [], curseCells = [],
  blindedSymbol, mySymbol,
  skillTargetCells = [],
  isShuffling,
}: Props) {
  const powerSet = new Set(powerCells.filter(p => !p.claimed).map(p => p.index));
  const curseRevealedSet = new Set(curseCells.filter(c => c.triggered).map(c => c.index));

  return (
    <div
      className="card"
      style={{
        padding: 'var(--board-padding)',
        display: 'inline-block',
        maxWidth: '100%',
        overflow: 'hidden',
        boxShadow: '0 0 60px rgba(124, 58, 237, 0.08), 0 0 120px rgba(245, 158, 11, 0.04)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, max-content)', gap: 'var(--board-cell-gap)' }}>
        {board.map((v, i) => {
          const isSkillTarget = skillTargetCells.includes(i);
          // For BLIND curse: hide opponent symbols
          const isBlinded = blindedSymbol !== null && v === blindedSymbol && v !== mySymbol;

          return (
            <Cell
              key={i}
              value={v}
              onClick={() => onMove(i)}
              disabled={disabled || (v !== null && !isSkillTarget)}
              highlight={winningCells.includes(i)}
              isPowerCell={powerSet.has(i)}
              isCursedRevealed={curseRevealedSet.has(i)}
              isBlinded={isBlinded}
              skillTargetMode={isSkillTarget}
              isShuffling={isShuffling}
            />
          );
        })}
      </div>
    </div>
  );
}
