import { useState } from 'react';
import type { GameResult, PlayerColor, IncomingChallenge } from '../types/game.js';
import { ENTRY_FEE } from '../constants.js';

interface GameOverOverlayProps {
  result: GameResult;
  myColor: PlayerColor;
  onRematch: () => void;
  onNewGame: () => void;
  pgn: string;
  incomingChallenge?: IncomingChallenge | null;
  onAcceptChallenge?: () => void;
  onDeclineChallenge?: () => void;
}

function getPayoutText(result: GameResult, myColor: PlayerColor): string {
  if (result.outcome === 'aborted') {
    return `${ENTRY_FEE} UCT returned`;
  }
  if (result.outcome === 'draw') {
    return `${ENTRY_FEE} UCT returned`;
  }
  const iWon =
    (result.outcome === 'white-wins' && myColor === 'white') ||
    (result.outcome === 'black-wins' && myColor === 'black');
  return iWon ? `+${ENTRY_FEE * 2} UCT` : `${ENTRY_FEE} UCT lost`;
}

function getResultText(result: GameResult, myColor: PlayerColor): string {
  if (result.outcome === 'aborted') return 'Game Aborted';
  if (result.outcome === 'draw') return 'Draw';
  const iWon =
    (result.outcome === 'white-wins' && myColor === 'white') ||
    (result.outcome === 'black-wins' && myColor === 'black');
  return iWon ? 'You Won!' : 'You Lost';
}

function getReasonText(result: GameResult): string {
  const reasons: Record<string, string> = {
    checkmate: 'Checkmate',
    resign: 'Resignation',
    timeout: 'Time out',
    stalemate: 'Stalemate',
    agreement: 'By agreement',
    repetition: 'Threefold repetition',
    '50move': '50-move rule',
    material: 'Insufficient material',
    abort: 'Aborted',
    disconnect: 'Disconnection',
  };
  return reasons[result.reason] ?? result.reason;
}

export function GameOverOverlay({
  result,
  myColor,
  onRematch,
  onNewGame,
  pgn,
  incomingChallenge,
  onAcceptChallenge,
  onDeclineChallenge,
}: GameOverOverlayProps) {
  const [copied, setCopied] = useState(false);

  const iWon =
    (result.outcome === 'white-wins' && myColor === 'white') ||
    (result.outcome === 'black-wins' && myColor === 'black');
  const isDraw = result.outcome === 'draw' || result.outcome === 'aborted';

  async function copyPgn() {
    try {
      await navigator.clipboard.writeText(pgn);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for iframe contexts
      const textarea = document.createElement('textarea');
      textarea.value = pgn;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center z-10 p-4">
      {/* Result */}
      <h2
        className={`text-3xl font-bold mb-1 ${
          iWon ? 'text-green-400' : isDraw ? 'text-orange-300' : 'text-red-400'
        }`}
      >
        {getResultText(result, myColor)}
      </h2>

      <p className="text-neutral-400 text-sm mb-2">
        {getReasonText(result)}
      </p>

      {/* Payout */}
      <p
        className={`text-lg font-semibold mb-4 ${
          iWon ? 'text-green-300' : isDraw ? 'text-neutral-300' : 'text-red-300'
        }`}
      >
        {getPayoutText(result, myColor)}
      </p>

      {/* Incoming rematch offer */}
      {incomingChallenge && onAcceptChallenge && onDeclineChallenge && (
        <div className="bg-orange-500/15 border border-orange-500/40 rounded-xl p-3 mb-4 w-full max-w-52 text-center">
          <p className="text-orange-300 text-sm font-medium mb-2">
            Rematch offer!
          </p>
          <p className="text-neutral-400 text-xs mb-3">
            {incomingChallenge.timeMinutes} min
            {incomingChallenge.color === 'white' ? ' — you play white' : ' — you play black'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onAcceptChallenge}
              className="flex-1 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold
                         rounded-xl cursor-pointer transition-colors"
            >
              Accept
            </button>
            <button
              onClick={onDeclineChallenge}
              className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/15 text-neutral-300 text-sm
                         rounded-xl cursor-pointer transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2 w-full max-w-48">
        {!incomingChallenge && (
          <button
            onClick={onRematch}
            className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold
                       rounded-xl cursor-pointer transition-colors text-sm"
          >
            Rematch
          </button>
        )}
        <button
          onClick={copyPgn}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-neutral-300
                     rounded-xl cursor-pointer transition-colors text-sm"
        >
          {copied ? 'Copied!' : 'Copy PGN'}
        </button>
        <button
          onClick={onNewGame}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-neutral-300
                     rounded-xl cursor-pointer transition-colors text-sm"
        >
          New Game
        </button>
      </div>
    </div>
  );
}
