/**
 * AI Move Engine for VS AI mode.
 * Human-like probabilistic AI that reuses checkWinner4 / isDraw from gameLogic.
 */
import { checkWinner4, type Cell } from './gameLogic';
import {
  type SkillType, type BoardCell, type PowerCell,
  canUseSkill, getSkillTargets,
} from './mechanics';

/** Fixed bot UUID — must match the SQL migration */
export const AI_BOT_ID = 'a0000000-0000-0000-0000-000000000001';

/** AI persona names — makes bot feel like a real player */
const AI_PERSONAS = [
  'Calm Strategist',
  'Aggressive Rookie',
  'Balanced Duelist',
  'Risk Taker',
  'Silent Hunter',
  'Grid Master',
  'Shadow Player',
  'Neon Tactician',
] as const;

export function getRandomPersona(): string {
  return AI_PERSONAS[Math.floor(Math.random() * AI_PERSONAS.length)];
}

type Board = Cell[];

/**
 * Find cells that would give `symbol` a win in 1 move.
 */
function findWinningMoves(board: Board, symbol: 'X' | 'O'): number[] {
  const moves: number[] = [];
  for (let i = 0; i < 25; i++) {
    if (board[i] !== null) continue;
    const test = [...board] as Board;
    test[i] = symbol;
    const res = checkWinner4(test);
    if (res.symbol === symbol) moves.push(i);
  }
  return moves;
}

/**
 * Score a move heuristically: count how many 4-in-a-row lines this cell participates in
 * where the AI already has pieces and no opponent/barrier blocking.
 */
function scoreMoveForSymbol(board: Board, index: number, symbol: 'X' | 'O'): number {
  const opp = symbol === 'X' ? 'O' : 'X';
  const testBoard = [...board] as Board;
  testBoard[index] = symbol;

  const lines: number[][] = [];
  const idx = (r: number, c: number) => r * 5 + c;
  for (let r = 0; r < 5; r++) for (let c = 0; c <= 1; c++) lines.push([idx(r, c), idx(r, c + 1), idx(r, c + 2), idx(r, c + 3)]);
  for (let c = 0; c < 5; c++) for (let r = 0; r <= 1; r++) lines.push([idx(r, c), idx(r + 1, c), idx(r + 2, c), idx(r + 3, c)]);
  for (let r = 0; r <= 1; r++) for (let c = 0; c <= 1; c++) lines.push([idx(r, c), idx(r + 1, c + 1), idx(r + 2, c + 2), idx(r + 3, c + 3)]);
  for (let r = 3; r <= 4; r++) for (let c = 0; c <= 1; c++) lines.push([idx(r, c), idx(r - 1, c + 1), idx(r - 2, c + 2), idx(r - 3, c + 3)]);

  let score = 0;
  for (const line of lines) {
    if (!line.includes(index)) continue;
    const cells = line.map(i => testBoard[i]);
    if (cells.some(c => c === opp || c === 'BARRIER')) continue;
    const count = cells.filter(c => c === symbol).length;
    if (count >= 3) score += 10;
    else if (count === 2) score += 3;
    else score += 1;
  }

  const row = Math.floor(index / 5);
  const col = index % 5;
  const centerDist = Math.abs(row - 2) + Math.abs(col - 2);
  score += Math.max(0, 4 - centerDist);

  return score;
}

/**
 * Compute the AI's next move (basic placement). Returns cell index.
 */
export function computeAIMove(board: Board, aiSymbol: 'X' | 'O'): number | null {
  const playerSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const empty = board.reduce<number[]>((acc, c, i) => { if (c === null) acc.push(i); return acc; }, []);
  if (empty.length === 0) return null;

  const winMoves = findWinningMoves(board, aiSymbol);
  if (winMoves.length > 0) return winMoves[Math.floor(Math.random() * winMoves.length)];

  const blockMoves = findWinningMoves(board, playerSymbol);
  if (blockMoves.length > 0) return blockMoves[Math.floor(Math.random() * blockMoves.length)];

  const scored = empty.map(i => ({ index: i, score: scoreMoveForSymbol(board, i, aiSymbol) }));
  scored.sort((a, b) => b.score - a.score);

  const roll = Math.random();
  if (roll < 0.75) {
    const topScore = scored[0].score;
    const top = scored.filter(s => s.score >= topScore - 1);
    return top[Math.floor(Math.random() * top.length)].index;
  } else if (roll < 0.90) {
    const cutoff = Math.max(1, Math.ceil(scored.length * 0.3));
    const pool = scored.slice(0, cutoff);
    return pool[Math.floor(Math.random() * pool.length)].index;
  } else {
    return empty[Math.floor(Math.random() * empty.length)];
  }
}

// ═══════════════════════════════════════════════════
// AI SKILL DECISION
// ═══════════════════════════════════════════════════

/**
 * Decide if AI should use its skill this turn.
 * Returns { useSkill: true, skill, target } or { useSkill: false }.
 */
export function decideAISkill(
  skill: SkillType | null,
  board: BoardCell[],
  aiSymbol: 'X' | 'O',
  powerCells: PowerCell[],
  turnCount: number,
): { useSkill: true; skill: SkillType; target: number } | { useSkill: false } {
  if (!skill) return { useSkill: false };

  const check = canUseSkill(skill, turnCount);
  if (!check.ok) return { useSkill: false };

  const targets = getSkillTargets(skill, board, aiSymbol, powerCells);
  if (targets.length === 0) return { useSkill: false };

  const playerSymbol = aiSymbol === 'X' ? 'O' : 'X';

  // ── OVERWRITE ──
  if (skill === 'OVERWRITE') {
    // Can win by overwriting?
    for (const t of targets) {
      const test = [...board] as BoardCell[];
      test[t] = aiSymbol;
      if (checkWinner4(test as Cell[]).symbol === aiSymbol) {
        return { useSkill: true, skill, target: t };
      }
    }
    // Block player imminent win via overwrite
    const playerWins = findWinningMoves(board as Board, playerSymbol);
    if (playerWins.length > 0) {
      const blockTargets = targets.filter(t => {
        const test = [...board] as BoardCell[];
        test[t] = aiSymbol;
        return findWinningMoves(test as Board, playerSymbol).length < playerWins.length;
      });
      if (blockTargets.length > 0) {
        return { useSkill: true, skill, target: blockTargets[0] };
      }
    }
    // High advantage: 65% use
    if (Math.random() < 0.65) {
      return { useSkill: true, skill, target: pickBestOverwrite(board, targets, aiSymbol) };
    }
    return { useSkill: false };
  }

  // ── BARRIER ──
  if (skill === 'BARRIER') {
    // Block player imminent win
    const playerWins = findWinningMoves(board as Board, playerSymbol);
    if (playerWins.length > 0) {
      const blockable = targets.filter(t => playerWins.includes(t));
      if (blockable.length > 0) {
        return { useSkill: true, skill, target: blockable[0] };
      }
    }
    // 30% strategic use
    if (Math.random() < 0.30) {
      return { useSkill: true, skill, target: pickBestBarrier(board, targets, playerSymbol) };
    }
    return { useSkill: false };
  }

  // ── BOMB ──
  if (skill === 'BOMB') {
    // Disrupt player imminent win
    const playerWins = findWinningMoves(board as Board, playerSymbol);
    if (playerWins.length > 0) {
      for (const t of targets) {
        if (board[t] === playerSymbol) {
          const test = [...board] as BoardCell[];
          test[t] = null;
          if (findWinningMoves(test as Board, playerSymbol).length < playerWins.length) {
            return { useSkill: true, skill, target: t };
          }
        }
      }
    }
    // 25% bomb a strategic player piece
    if (Math.random() < 0.25) {
      const playerPieces = targets.filter(t => board[t] === playerSymbol);
      if (playerPieces.length > 0) {
        return { useSkill: true, skill, target: pickBestBomb(board, playerPieces, playerSymbol) };
      }
    }
    return { useSkill: false };
  }

  return { useSkill: false };
}

function pickBestOverwrite(board: BoardCell[], targets: number[], aiSymbol: 'X' | 'O'): number {
  let best = targets[0];
  let bestScore = -1;
  for (const t of targets) {
    const test = [...board] as BoardCell[];
    test[t] = aiSymbol;
    const s = scoreMoveForSymbol(test as Board, t, aiSymbol);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

function pickBestBarrier(board: BoardCell[], targets: number[], playerSymbol: 'X' | 'O'): number {
  let best = targets[0];
  let bestScore = -1;
  for (const t of targets) {
    const s = scoreMoveForSymbol(board as Board, t, playerSymbol);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}

function pickBestBomb(board: BoardCell[], targets: number[], playerSymbol: 'X' | 'O'): number {
  let best = targets[0];
  let bestScore = -1;
  for (const t of targets) {
    const s = scoreMoveForSymbol(board as Board, t, playerSymbol);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best;
}
