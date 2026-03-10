import type { Chess } from 'chess.js';
import type { GameResult } from '../types/game';

export function toPgn(chess: Chess): string {
  return chess.pgn();
}

export function getCapturedPieces(chess: Chess): {
  white: string[];
  black: string[];
} {
  const initial: Record<string, number> = {
    p: 8,
    n: 2,
    b: 2,
    r: 2,
    q: 1,
  };

  const remaining = { w: { ...initial }, b: { ...initial } };
  const fen = chess.fen().split(' ')[0] ?? '';

  for (const ch of fen) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue;
    const color = ch === ch.toUpperCase() ? 'w' : 'b';
    const piece = ch.toLowerCase();
    const colorRemaining = remaining[color];
    if (colorRemaining && piece in colorRemaining) {
      const current = colorRemaining[piece];
      if (current !== undefined) {
        colorRemaining[piece] = current - 1;
      }
    }
  }

  const pieceSymbols: Record<string, string> = {
    p: '\u2659',
    n: '\u2658',
    b: '\u2657',
    r: '\u2656',
    q: '\u2655',
  };

  const toCapturedList = (side: 'w' | 'b'): string[] => {
    const captured: string[] = [];
    for (const [piece, count] of Object.entries(remaining[side])) {
      const symbol = pieceSymbols[piece];
      if (symbol) {
        for (let i = 0; i < count; i++) {
          captured.push(symbol);
        }
      }
    }
    return captured;
  };

  return {
    white: toCapturedList('b'),
    black: toCapturedList('w'),
  };
}

export function formatClockMs(ms: number): string {
  if (ms <= 0) return '0:00';

  const totalSeconds = ms / 1000;

  if (totalSeconds < 10) {
    return totalSeconds.toFixed(1);
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function isGameTerminal(chess: Chess): GameResult | null {
  if (chess.isCheckmate()) {
    return {
      outcome: chess.turn() === 'w' ? 'black-wins' : 'white-wins',
      reason: 'checkmate',
    };
  }

  if (chess.isStalemate()) {
    return { outcome: 'draw', reason: 'stalemate' };
  }

  if (chess.isThreefoldRepetition()) {
    return { outcome: 'draw', reason: 'repetition' };
  }

  if (chess.isInsufficientMaterial()) {
    return { outcome: 'draw', reason: 'material' };
  }

  if (chess.isDraw()) {
    return { outcome: 'draw', reason: '50move' };
  }

  return null;
}
