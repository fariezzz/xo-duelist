export type Cell = 'X' | 'O' | null
export type Board = Cell[]

const WIN_PATTERNS = [
  [0,1,2],
  [3,4,5],
  [6,7,8],
  [0,3,6],
  [1,4,7],
  [2,5,8],
  [0,4,8],
  [2,4,6],
]
export function checkWinner(board: Board) {
  for (const [a,b,c] of WIN_PATTERNS) {
    if (
      board[a] &&
      board[a] === board[b] &&
      board[a] === board[c]
    ) {
      return board[a]
    }
  }

  if (board.every(cell => cell !== null)) {
    return 'draw'
  }

  return null
}
export function getAIMove(board: Board): number {
  const empty = board
    .map((cell, index) => cell === null ? index : null)
    .filter(v => v !== null) as number[]

  return empty[Math.floor(Math.random() * empty.length)]
}