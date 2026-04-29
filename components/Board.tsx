"use client";
import React from 'react';
import Cell from './Cell';
import { Cell as CellType } from '../lib/gameLogic';

type Props = {
  board: CellType[];
  onMove: (index: number) => void;
  disabled?: boolean;
  winningCells?: number[];
};

export default function Board({ board, onMove, disabled, winningCells = [] }: Props) {
  return (
    <div
      className="card"
      style={{
        padding: '20px',
        display: 'inline-block',
        boxShadow: '0 0 60px rgba(124, 58, 237, 0.08), 0 0 120px rgba(245, 158, 11, 0.04)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '6px',
        }}
      >
        {board.map((v, i) => (
          <Cell
            key={i}
            value={v}
            onClick={() => onMove(i)}
            disabled={disabled || v !== null}
            highlight={winningCells.includes(i)}
          />
        ))}
      </div>
    </div>
  );
}
