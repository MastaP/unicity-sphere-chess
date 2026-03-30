import { useMemo, useCallback } from 'react';
import { Chessboard } from 'react-chessboard';
import type { PromotionPieceOption } from 'react-chessboard/dist/chessboard/types';
import type { Chess } from 'chess.js';
import type { PlayerColor, MoveRecord } from '../types/game.js';

interface BoardProps {
  chess: Chess;
  myColor: PlayerColor;
  onMove: (from: string, to: string, promotion?: string) => boolean;
  disabled: boolean;
  lastMove?: MoveRecord;
}

export function Board({ chess, myColor, onMove, disabled, lastMove }: BoardProps) {
  const boardOrientation = myColor;

  // Compute last move highlight squares
  const lastMoveSquares = useMemo(() => {
    if (!lastMove) return {};
    const history = chess.history({ verbose: true });
    if (history.length === 0) return {};
    const last = history[history.length - 1];
    if (!last) return {};
    return {
      [last.from]: { background: 'rgba(255, 111, 0, 0.25)' },
      [last.to]: { background: 'rgba(255, 111, 0, 0.25)' },
    };
  }, [chess, lastMove]);

  // Handle piece drop — for non-promotion moves
  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string, piece: string): boolean => {
      if (disabled) return false;

      const isPromotion =
        piece[1] === 'P' &&
        ((piece[0] === 'w' && targetSquare[1] === '8') ||
         (piece[0] === 'b' && targetSquare[1] === '1'));

      // Let the promotion dialog handle promotion moves
      if (isPromotion) return true;

      return onMove(sourceSquare, targetSquare);
    },
    [disabled, onMove],
  );

  // Handle promotion piece selection from the dialog
  const onPromotionPieceSelect = useCallback(
    (piece?: PromotionPieceOption, promoteFromSquare?: string, promoteToSquare?: string): boolean => {
      if (!piece || !promoteFromSquare || !promoteToSquare) return false;
      // piece is like "wQ", "wN" etc — extract the piece letter lowercase
      const promotion = piece![1]!.toLowerCase();
      return onMove(promoteFromSquare, promoteToSquare, promotion);
    },
    [onMove],
  );

  return (
    <div className="w-[min(90vw,500px)] aspect-square">
      <Chessboard
        id="game-board"
        position={chess.fen()}
        onPieceDrop={onDrop}
        onPromotionPieceSelect={onPromotionPieceSelect}
        boardOrientation={boardOrientation}
        arePiecesDraggable={!disabled}
        customBoardStyle={{
          borderRadius: '12px',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.5)',
        }}
        customDarkSquareStyle={{ backgroundColor: '#779952' }}
        customLightSquareStyle={{ backgroundColor: '#edeed1' }}
        customSquareStyles={lastMoveSquares}
        animationDuration={150}
        showPromotionDialog={true}
      />
    </div>
  );
}
