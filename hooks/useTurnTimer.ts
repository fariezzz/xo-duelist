import { useState, useEffect, useCallback } from 'react';

export const useTurnTimer = (currentTurn: number, onTimeout: () => void) => {
  const START_TIME = 30;
  const MIN_TIME = 10;
  const DECREMENT_PER_TURN = 2; // Kurangi 2 detik setiap giliran

  // Hitung durasi maksimal untuk giliran saat ini
  const calculateMaxTime = useCallback(() => {
    const calculated = START_TIME - (currentTurn * DECREMENT_PER_TURN);
    return Math.max(MIN_TIME, calculated);
  }, [currentTurn]);

  const [timeLeft, setTimeLeft] = useState(calculateMaxTime());

  // Reset timer setiap kali giliran berubah
  useEffect(() => {
    setTimeLeft(calculateMaxTime());
  }, [currentTurn, calculateMaxTime]);

  // Logika hitung mundur
  useEffect(() => {
    if (timeLeft <= 0) {
      onTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onTimeout]);

  return { timeLeft, maxTime: calculateMaxTime() };
};