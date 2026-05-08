'use client'

import { checkWinner, getAIMove, type Board } from '@/lib/ai.bot' 
import { useState } from 'react'

export default function VsAIPage() {
  const [board, setBoard] = useState<Board>(Array(9).fill(null))

  const handleClick = (index: number) => {
    if (board[index] || checkWinner(board)) return

    const newBoard = [...board]
    newBoard[index] = 'X'
    setBoard(newBoard)

    if (!checkWinner(newBoard)) {
      setTimeout(() => {
        const aiMove = getAIMove(newBoard)
        if (aiMove !== null && aiMove !== undefined) {
          const boardAfterAI = [...newBoard]
          boardAfterAI[aiMove] = 'O'
          setBoard(boardAfterAI)
        }
      }, 700)
    }
  }

  const winner = checkWinner(board)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white gap-6">
      <h1 className="text-3xl font-bold">
        {winner ? `Winner: ${winner}` : 'Tic Tac Toe VS AI'}
      </h1>

      <div className="grid grid-cols-3 gap-2">
        {board.map((cell, index) => (
          <button
            key={index}
            onClick={() => handleClick(index)}
            className="w-24 h-24 bg-zinc-800 hover:bg-zinc-700 text-4xl font-bold flex items-center justify-center transition-colors rounded-lg"
          >
            {cell}
          </button>
        ))}
      </div>

      <button
        onClick={() => setBoard(Array(9).fill(null))}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-full font-medium transition-colors"
      >
        Reset Game
      </button>
    </div>
  )
} 