export type Cell = 'X' | 'O' | 'BARRIER' | null;

// Board is an array of 25 cells (row-major order)
export function index(r: number, c: number) {
  return r * 5 + c;
}

export function isDraw(board: Cell[]) {
  return board.every((c) => c !== null);
}

export function checkWinner4(board: Cell[]) {
  // returns { symbol: 'X'|'O'|null, cells: number[] }
  const lines: number[][] = [];

  // horizontal sequences of 4
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c <= 1; c++) {
      const seq = [index(r, c), index(r, c + 1), index(r, c + 2), index(r, c + 3)];
      lines.push(seq);
    }
  }

  // vertical sequences of 4
  for (let c = 0; c < 5; c++) {
    for (let r = 0; r <= 1; r++) {
      const seq = [index(r, c), index(r + 1, c), index(r + 2, c), index(r + 3, c)];
      lines.push(seq);
    }
  }

  // diagonal down-right sequences of 4
  for (let r = 0; r <= 1; r++) {
    for (let c = 0; c <= 1; c++) {
      const seq = [index(r, c), index(r + 1, c + 1), index(r + 2, c + 2), index(r + 3, c + 3)];
      lines.push(seq);
    }
  }

  // diagonal up-right sequences of 4
  for (let r = 3; r <= 4; r++) {
    for (let c = 0; c <= 1; c++) {
      const seq = [index(r, c), index(r - 1, c + 1), index(r - 2, c + 2), index(r - 3, c + 3)];
      lines.push(seq);
    }
  }

  for (const seq of lines) {
    const [a, b, c, d] = seq.map((i) => board[i]);
    if (a && a === b && a === c && a === d) {
      return { symbol: a, cells: seq };
    }
  }

  return { symbol: null, cells: [] };
}
