import { Chess } from 'chess.js';
import type { PlayerColor } from '../../types/game';
import type { PieceCode } from './pieces';

export interface BoardCell {
  square: string;
  /** Column on screen, 0 at the left. */
  col: number;
  /** Row on screen, 0 at the top. */
  row: number;
  light: boolean;
  piece: PieceCode | null;
}

const FILES = 'abcdefgh';

/** Every square of `fen` as drawn with `orientation`'s side at the bottom. */
export function boardLayout(fen: string, orientation: PlayerColor): BoardCell[] {
  const board = new Chess(fen).board();
  const cells: BoardCell[] = [];
  for (let file = 0; file < 8; file++) {
    for (let rank = 1; rank <= 8; rank++) {
      const occupant = board[8 - rank]?.[file] ?? null;
      cells.push({
        square: `${FILES[file]}${rank}`,
        col: orientation === 'white' ? file : 7 - file,
        row: orientation === 'white' ? 8 - rank : rank - 1,
        // a1 (file 0, rank 1) is dark.
        light: (file + rank) % 2 === 0,
        piece: occupant ? (`${occupant.color}${occupant.type.toUpperCase()}` as PieceCode) : null,
      });
    }
  }
  return cells;
}
