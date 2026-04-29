"use client";
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Board from '../../components/Board';
import ResultModal from '../../components/ResultModal';
import { checkWinner4, isDraw } from '../../lib/gameLogic';
import Navbar from '../../components/Navbar';

export default function TrainingPage() {
  const router = useRouter();
  const [board, setBoard] = useState<("X" | "O" | null)[]>(Array(25).fill(null));
  const [turn, setTurn] = useState<'X' | 'O'>('X');
  const [result, setResult] = useState<{ title: string; message: string } | null>(null);
  const [winningCells, setWinningCells] = useState<number[]>([]);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });
  const gameOver = result !== null;

  const makeMove = useCallback((i: number) => {
    if (gameOver) return;
    if (board[i] !== null) return;

    const newBoard = [...board];
    newBoard[i] = turn;
    setBoard(newBoard);

    // Check winner
    const res = checkWinner4(newBoard as any);
    if (res.symbol) {
      setWinningCells(res.cells);
      setResult({
        title: `${res.symbol} Wins!`,
        message: `Player ${res.symbol} got 4 in a row!`,
      });
      setScores((s) => ({ ...s, [res.symbol!]: s[res.symbol as 'X' | 'O'] + 1 }));
      return;
    }

    if (isDraw(newBoard as any)) {
      setResult({ title: 'Draw!', message: 'The board is full — no winner.' });
      setScores((s) => ({ ...s, draw: s.draw + 1 }));
      return;
    }

    setTurn(turn === 'X' ? 'O' : 'X');
  }, [board, turn, gameOver]);

  function resetGame() {
    setBoard(Array(25).fill(null));
    setTurn('X');
    setResult(null);
    setWinningCells([]);
  }

  function resetAll() {
    resetGame();
    setScores({ X: 0, O: 0, draw: 0 });
  }

  const turnColor = turn === 'X' ? '#a78bfa' : '#fbbf24';
  const turnGlow = turn === 'X'
    ? '0 0 15px rgba(124,58,237,0.4)'
    : '0 0 15px rgba(245,158,11,0.4)';

  return (
    <>
      <Navbar />
      <div
        className="animate-fade-in"
        style={{
          paddingTop: '104px',
          paddingBottom: '32px',
          paddingLeft: '24px',
          paddingRight: '24px',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '1.5rem' }}>🎯</span>
              <h1
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  color: 'var(--text-primary)',
                  margin: 0,
                }}
              >
                Training Mode
              </h1>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
              Pass-and-play on the same device. Results are not recorded.
            </p>
          </div>

          {/* Scoreboard */}
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '32px',
              padding: '16px 24px',
              marginBottom: '24px',
            }}
          >
            {/* Player X */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.3rem',
                  color: '#a78bfa',
                  textShadow: '0 0 10px rgba(124,58,237,0.4)',
                }}
              >
                X
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                {scores.X}
              </div>
            </div>

            {/* Separator */}
            <div
              style={{
                width: '1px',
                height: '40px',
                background: 'rgba(255,255,255,0.1)',
              }}
            />

            {/* Draws */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Draw
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  color: 'var(--text-muted)',
                  lineHeight: 1.2,
                }}
              >
                {scores.draw}
              </div>
            </div>

            {/* Separator */}
            <div
              style={{
                width: '1px',
                height: '40px',
                background: 'rgba(255,255,255,0.1)',
              }}
            />

            {/* Player O */}
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.3rem',
                  color: '#fbbf24',
                  textShadow: '0 0 10px rgba(245,158,11,0.4)',
                }}
              >
                O
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.8rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.2,
                }}
              >
                {scores.O}
              </div>
            </div>
          </div>

          {/* Turn Indicator */}
          {!gameOver && (
            <div
              style={{
                textAlign: 'center',
                marginBottom: '16px',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '1.1rem',
                color: turnColor,
                textShadow: turnGlow,
                transition: 'color 0.3s, text-shadow 0.3s',
              }}
            >
              Player {turn}&apos;s Turn
            </div>
          )}

          {/* Board */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <Board
              board={board as any}
              onMove={makeMove}
              disabled={gameOver}
              winningCells={winningCells}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              onClick={resetGame}
              style={{ minWidth: '140px' }}
            >
              🔄 New Round
            </button>
            <button
              className="btn btn-ghost"
              onClick={resetAll}
              style={{ minWidth: '140px' }}
            >
              🗑️ Reset Score
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => router.push('/dashboard')}
              style={{ minWidth: '140px' }}
            >
              ← Dashboard
            </button>
          </div>
        </div>
      </div>

      <ResultModal
        open={!!result}
        title={result?.title}
        message={result?.message}
        onClose={resetGame}
      />
    </>
  );
}
