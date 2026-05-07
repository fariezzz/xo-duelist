/**
 * AI Move Engine for VS AI mode.
 * Human-like probabilistic AI that reuses checkWinner4 / isDraw from gameLogic.
 */
import { checkWinner4, isDraw, type Cell } from './gameLogic';

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

  // Generate all 4-in-a-row lines
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
    // Skip if opponent or barrier blocks this line
    if (cells.some(c => c === opp || c === 'BARRIER')) continue;
    const count = cells.filter(c => c === symbol).length;
    // 4 = win (already handled), 3 = strong threat, 2 = building, 1 = weak
    if (count >= 3) score += 10;
    else if (count === 2) score += 3;
    else score += 1;
  }

  // Center bonus
  const row = Math.floor(index / 5);
  const col = index % 5;
  const centerDist = Math.abs(row - 2) + Math.abs(col - 2);
  score += Math.max(0, 4 - centerDist);

  return score;
}

/**
 * Compute the AI's next move. Returns cell index.
 *
 * Behavior:
 * - 100% take winning move if available
 * - 100% block opponent winning move if available
 * - Otherwise: 75% best heuristic, 15% good move, 10% random
 */
export function computeAIMove(board: Board, aiSymbol: 'X' | 'O'): number | null {
  const playerSymbol = aiSymbol === 'X' ? 'O' : 'X';
  const empty = board.reduce<number[]>((acc, c, i) => { if (c === null) acc.push(i); return acc; }, []);
  if (empty.length === 0) return null;

  // 1. Win in 1 move
  const winMoves = findWinningMoves(board, aiSymbol);
  if (winMoves.length > 0) return winMoves[Math.floor(Math.random() * winMoves.length)];

  // 2. Block opponent win in 1 move
  const blockMoves = findWinningMoves(board, playerSymbol);
  if (blockMoves.length > 0) return blockMoves[Math.floor(Math.random() * blockMoves.length)];

  // 3. Score all empty cells
  const scored = empty.map(i => ({ index: i, score: scoreMoveForSymbol(board, i, aiSymbol) }));
  scored.sort((a, b) => b.score - a.score);

  // Human-like probabilistic selection
  const roll = Math.random();
  if (roll < 0.75) {
    // Best move (top 1-2)
    const topScore = scored[0].score;
    const top = scored.filter(s => s.score >= topScore - 1);
    return top[Math.floor(Math.random() * top.length)].index;
  } else if (roll < 0.90) {
    // Good move (top 30%)
    const cutoff = Math.max(1, Math.ceil(scored.length * 0.3));
    const pool = scored.slice(0, cutoff);
    return pool[Math.floor(Math.random() * pool.length)].index;
  } else {
    // Random (mild blunder)
    return empty[Math.floor(Math.random() * empty.length)];
  }
}
