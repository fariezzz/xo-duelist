import { checkWinner4 } from './gameLogic';

// ═══════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════
export type SkillType = 'BARRIER' | 'OVERWRITE' | 'BOMB';
export type CurseType = 'BLIND' | 'SLOW' | 'FUMBLE';
export type BoardCell = 'X' | 'O' | 'BARRIER' | null;

export interface PowerCell { index: number; claimed: boolean }
export interface CurseCell { index: number; triggered: boolean }
export interface PlayerCurse { type: CurseType; turns_remaining: number }

export const SKILL_META: Record<SkillType, { icon: string; name: string; desc: string }> = {
  BARRIER:   { icon: '🛡️', name: 'Barrier',   desc: 'Block an empty cell permanently' },
  OVERWRITE: { icon: '✏️', name: 'Overwrite', desc: "Replace opponent's symbol with yours" },
  BOMB:      { icon: '💣', name: 'Bomb',      desc: 'Remove any symbol from the board' },
};

export const CURSE_META: Record<CurseType, { icon: string; name: string; desc: string }> = {
  BLIND:  { icon: '🌑', name: 'Blind',  desc: 'Board goes dark for 2 turns!' },
  SLOW:   { icon: '🐌', name: 'Slow',   desc: 'Timer cut to 8s for 3 turns!' },
  FUMBLE: { icon: '🎲', name: 'Fumble', desc: 'Next move placed randomly!' },
};

const ALL_SKILLS: SkillType[] = ['BARRIER', 'OVERWRITE', 'BOMB'];
const ALL_CURSES: CurseType[] = ['BLIND', 'SLOW', 'FUMBLE'];

// 5 zones for even distribution (excluding corners)
const ZONES: number[][] = [
  [1, 5, 6],           // NW
  [3, 8, 9],           // NE
  [15, 16, 21],        // SW
  [18, 19, 23],        // SE
  [2, 7, 10, 11, 12, 13, 14, 17, 22], // center cross
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════
// INITIALIZATION - 2 power cells + 2 curse cells
// ═══════════════════════════════════════════════════
export function initializeCells(): { power_cells: PowerCell[]; curse_cells: CurseCell[] } {
  // pick 4 different zones, 1 cell from each
  const zoneOrder = shuffle([0, 1, 2, 3, 4]).slice(0, 4);
  const indices = zoneOrder.map(z => pick(ZONES[z]));

  return {
    power_cells: indices.slice(0, 2).map(i => ({ index: i, claimed: false })),
    curse_cells: indices.slice(2, 4).map(i => ({ index: i, triggered: false })),
  };
}

// ═══════════════════════════════════════════════════
// SKILLS
// ═══════════════════════════════════════════════════
export function getRandomSkill(): SkillType {
  return pick(ALL_SKILLS);
}

/** Check if a skill can be used given the current game state */
export function canUseSkill(
  skill: SkillType,
  turnCount: number,
): { ok: boolean; reason?: string } {
  // OVERWRITE & BOMB blocked on first move (turn_count < 2 means both players haven't moved once)
  if ((skill === 'OVERWRITE' || skill === 'BOMB') && turnCount < 2) {
    return { ok: false, reason: 'Cannot use this skill on the first turn!' };
  }
  return { ok: true };
}

/** Get valid target cells for a skill */
export function getSkillTargets(
  skill: SkillType,
  board: BoardCell[],
  mySymbol: 'X' | 'O',
  powerCells: PowerCell[],
): number[] {
  const oppSymbol = mySymbol === 'X' ? 'O' : 'X';
  const powerIndices = new Set(powerCells.filter(p => !p.claimed).map(p => p.index));

  switch (skill) {
    case 'BARRIER':
      // any empty cell that isn't a power cell
      return board.reduce<number[]>((acc, c, i) => {
        if (c === null && !powerIndices.has(i)) acc.push(i);
        return acc;
      }, []);
    case 'OVERWRITE':
      // opponent cells, not on unclaimed power cells
      return board.reduce<number[]>((acc, c, i) => {
        if (c === oppSymbol && !powerIndices.has(i)) acc.push(i);
        return acc;
      }, []);
    case 'BOMB':
      // any filled cell (X or O), not power cells
      return board.reduce<number[]>((acc, c, i) => {
        if ((c === 'X' || c === 'O') && !powerIndices.has(i)) acc.push(i);
        return acc;
      }, []);

    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════
// CURSES
// ═══════════════════════════════════════════════════
export function getRandomCurse(): CurseType {
  return pick(ALL_CURSES);
}

/** Check if player is 1 move from winning (for FUMBLE protection) */
export function isOneStepFromWin(board: BoardCell[], symbol: 'X' | 'O'): boolean {
  for (let i = 0; i < 25; i++) {
    if (board[i] !== null) continue;
    const test = [...board];
    test[i] = symbol;
    const res = checkWinner4(test as any);
    if (res.symbol === symbol) return true;
  }
  return false;
}

export function buildCurse(type: CurseType): PlayerCurse {
  switch (type) {
    case 'BLIND':  return { type: 'BLIND',  turns_remaining: 2 };
    case 'SLOW':   return { type: 'SLOW',   turns_remaining: 3 };
    case 'FUMBLE': return { type: 'FUMBLE', turns_remaining: 1 };
  }
}

export function tickCurse(curse: PlayerCurse | null): PlayerCurse | null {
  if (!curse) return null;
  const remaining = curse.turns_remaining - 1;
  if (remaining <= 0) return null;
  return { ...curse, turns_remaining: remaining };
}

export function getTimerSeconds(curse: PlayerCurse | null): number {
  if (curse?.type === 'SLOW' && curse.turns_remaining > 0) return 8;
  return 30;
}

// ═══════════════════════════════════════════════════
// BOARD SHUFFLE
// ═══════════════════════════════════════════════════
export function shuffleBoard(
  board: BoardCell[],
  powerCells: PowerCell[],
  curseCells: CurseCell[],
): { board: BoardCell[]; power_cells: PowerCell[]; curse_cells: CurseCell[] } {
  // Separate filled and empty positions
  const filledPositions: number[] = [];
  const filledValues: BoardCell[] = [];
  const emptyPositions: number[] = [];

  // Positions locked in place (claimed power, triggered curse, barrier)
  const locked = new Set<number>();
  for (const p of powerCells) if (p.claimed) locked.add(p.index);
  for (const c of curseCells) if (c.triggered) locked.add(c.index);

  for (let i = 0; i < 25; i++) {
    if (locked.has(i)) continue; // skip locked cells
    if (board[i] === 'BARRIER') { locked.add(i); continue; }
    if (board[i] !== null) {
      filledPositions.push(i);
      filledValues.push(board[i]);
    } else {
      emptyPositions.push(i);
    }
  }

  // Shuffle filled values among filled positions
  const shuffledValues = shuffle(filledValues);
  const newBoard = [...board];
  filledPositions.forEach((pos, idx) => {
    newBoard[pos] = shuffledValues[idx];
  });

  // Shuffle unclaimed power cells and untriggered curse cells to new empty positions
  const unclaimedPower = powerCells.filter(p => !p.claimed);
  const untriggeredCurse = curseCells.filter(c => !c.triggered);
  const specialCount = unclaimedPower.length + untriggeredCurse.length;

  // Available empty positions (excluding current special cell positions)
  const specialPositions = new Set([
    ...unclaimedPower.map(p => p.index),
    ...untriggeredCurse.map(c => c.index),
  ]);
  const availableEmpty = emptyPositions.filter(p => !specialPositions.has(p));
  const allCandidates = shuffle([...specialPositions, ...availableEmpty]);
  const newSpecialPositions = allCandidates.slice(0, specialCount);

  const newPowerCells = powerCells.map((p) => {
    if (p.claimed) return p;
    const idx = unclaimedPower.indexOf(p);
    return { ...p, index: newSpecialPositions[idx] ?? p.index };
  });

  const newCurseCells = curseCells.map((c) => {
    if (c.triggered) return c;
    const idx = untriggeredCurse.indexOf(c);
    return { ...c, index: newSpecialPositions[unclaimedPower.length + idx] ?? c.index };
  });

  return { board: newBoard, power_cells: newPowerCells, curse_cells: newCurseCells };
}

/** Validate no 4-in-a-row exists after shuffle */
export function hasAnyWinner(board: BoardCell[]): boolean {
  const res = checkWinner4(board as any);
  return res.symbol !== null;
}

/** Shuffle with anti-win validation, max 50 attempts */
export function safeShuffle(
  board: BoardCell[],
  powerCells: PowerCell[],
  curseCells: CurseCell[],
): { board: BoardCell[]; power_cells: PowerCell[]; curse_cells: CurseCell[]; reshuffled: boolean } {
  let result = shuffleBoard(board, powerCells, curseCells);
  let reshuffled = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (!hasAnyWinner(result.board)) {
      return { ...result, reshuffled };
    }
    reshuffled = true;
    result = shuffleBoard(board, powerCells, curseCells);
  }
  // Safety: return last attempt even if it has a winner (extremely unlikely)
  return { ...result, reshuffled };
}

/** Get a random empty cell index (for FUMBLE) */
export function getRandomEmptyCell(board: BoardCell[]): number | null {
  const empty = board.reduce<number[]>((acc, c, i) => {
    if (c === null) acc.push(i);
    return acc;
  }, []);
  return empty.length > 0 ? pick(empty) : null;
}
