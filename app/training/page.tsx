"use client";
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Board from '../../components/Board';
import PlayerCard from '../../components/PlayerCard';
import ResultModal from '../../components/ResultModal';
import { checkWinner4, isDraw, type Cell } from '../../lib/gameLogic';
import Navbar from '../../components/Navbar';

export default function TrainingPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Cell[]>(Array(25).fill(null));
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

    const res = checkWinner4(newBoard);
    const winner = res.symbol;
    if (winner === 'X' || winner === 'O') {
      setWinningCells(res.cells);
      setResult({
        title: `${winner} Wins!`,
        message: `Player ${winner} got 4 in a row!`,
      });
      setScores((s) => ({ ...s, [winner]: s[winner] + 1 }));
      return;
    }

    if (isDraw(newBoard)) {
      setResult({ title: 'Draw!', message: 'The board is full - no winner.' });
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

  const totalRounds = scores.X + scores.O + scores.draw;
  const isXTurn = !gameOver && turn === 'X';
  const isOTurn = !gameOver && turn === 'O';
  const turnColor = isXTurn ? '#a78bfa' : isOTurn ? '#fbbf24' : 'var(--text-muted)';

  return (
    <>
      <Navbar />
      <div
        className="animate-fade-in game-screen"
        style={{
          height: 'auto',
          minHeight: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingTop: 'calc(var(--navbar-height) + 14px)',
        }}
      >
        <div className="game-shell">
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                fontSize: '1.8rem',
                color: 'var(--text-primary)',
                marginBottom: '8px',
              }}
            >
              Training Mode
            </h1>
          </div>

          <div className="game-grid" style={{ height: 'auto' }}>
            <aside className="game-side">
              <div
                style={{
                  textAlign: 'center',
                  marginBottom: '4px',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1.05rem',
                  color: turnColor,
                }}
              >
                {gameOver ? 'Game Over' : `Player ${turn}'s Turn`}
              </div>

              <div className="game-player-stack">
                <PlayerCard
                  username="Player X"
                  elo={scores.X}
                  symbol="X"
                  active={isXTurn}
                  statLabel="Score"
                  statValue={scores.X}
                />
                <div
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: '1.05rem',
                    color: 'var(--text-muted)',
                  }}
                >
                  VS
                </div>
                <PlayerCard
                  username="Player O"
                  elo={scores.O}
                  symbol="O"
                  active={isOTurn}
                  statLabel="Score"
                  statValue={scores.O}
                />
              </div>

              <div className="card" style={{ padding: '12px 16px' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginBottom: '10px',
                  }}
                >
                  Match Stats
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontFamily: 'var(--font-heading)',
                    fontSize: '0.9rem',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    Draw: <strong style={{ color: 'var(--text-primary)' }}>{scores.draw}</strong>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Rounds: <strong style={{ color: 'var(--text-primary)' }}>{totalRounds}</strong>
                  </span>
                </div>
              </div>

              <div className="game-bottom-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button className="btn btn-primary" onClick={resetGame}>
                  New Round
                </button>
                <button className="btn btn-ghost" onClick={resetAll}>
                  Reset Score
                </button>
                <button className="btn btn-ghost" onClick={() => router.push('/dashboard')}>
                  Back to Home
                </button>
              </div>
            </aside>

            <section className="game-board-wrap">
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Board
                  board={board}
                  onMove={makeMove}
                  disabled={gameOver}
                  winningCells={winningCells}
                />
              </div>
            </section>
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
