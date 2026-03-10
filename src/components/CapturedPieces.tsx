import { useMemo } from 'react';
import type { Chess, PieceSymbol, Color } from 'chess.js';
import type { PlayerColor } from '../types/game.js';

interface CapturedPiecesProps {
  chess: Chess;
  color: PlayerColor;
}

// Starting material counts
const STARTING_COUNTS: Record<PieceSymbol, number> = {
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
  k: 1,
};

// Piece values for material advantage
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

// Unicode pieces -- white pieces captured BY black (shown next to black's name), and vice versa
const UNICODE_PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { p: '\u2659', n: '\u2658', b: '\u2657', r: '\u2656', q: '\u2655', k: '\u2654' },
  b: { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' },
};

// Display order for captured pieces
const DISPLAY_ORDER: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];

export function CapturedPieces({ chess, color }: CapturedPiecesProps) {
  const { captured, advantage } = useMemo(() => {
    // Count remaining pieces on the board for each color
    const board = chess.board();
    const remaining: Record<Color, Record<PieceSymbol, number>> = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
    };

    for (const row of board) {
      for (const square of row) {
        if (square) {
          remaining[square.color][square.type]++;
        }
      }
    }

    // Captured = starting count - remaining. This side captured the OTHER color's pieces.
    const capturedColor: Color = color === 'white' ? 'b' : 'w';
    const captured: string[] = [];
    let myMaterial = 0;
    let oppMaterial = 0;

    for (const piece of DISPLAY_ORDER) {
      const capturedCount = STARTING_COUNTS[piece] - remaining[capturedColor][piece];
      for (let i = 0; i < capturedCount; i++) {
        captured.push(UNICODE_PIECES[capturedColor][piece]);
      }
    }

    // Calculate material advantage
    const myColorCode: Color = color === 'white' ? 'w' : 'b';
    const oppColorCode: Color = color === 'white' ? 'b' : 'w';
    for (const piece of DISPLAY_ORDER) {
      myMaterial += remaining[myColorCode][piece] * PIECE_VALUES[piece];
      oppMaterial += remaining[oppColorCode][piece] * PIECE_VALUES[piece];
    }

    return {
      captured,
      advantage: myMaterial - oppMaterial,
    };
  }, [chess, color]);

  if (captured.length === 0 && advantage <= 0) {
    return <div className="h-5" />;
  }

  return (
    <div className="flex items-center gap-0.5 text-sm leading-none">
      <span className="tracking-tight opacity-80">
        {captured.join('')}
      </span>
      {advantage > 0 && (
        <span className="text-neutral-500 text-xs ml-1">+{advantage}</span>
      )}
    </div>
  );
}
