import { useState, useEffect } from 'react';
import type { GameResult } from '../types/game.js';

interface GameStatusProps {
  isMyTurn: boolean;
  isCheck: boolean;
  isGameOver: boolean;
  result: GameResult | null;
  opponentNametag: string;
  lastHeartbeatAt: number;
  drawOfferedBy: 'me' | 'opponent' | null;
}

const HEARTBEAT_STALE_MS = 60_000; // 1 minute without heartbeat = stale
const HEARTBEAT_WARN_MS = 90_000;  // 1.5 minutes = warning

function formatResult(result: GameResult): string {
  const outcomes: Record<string, string> = {
    'white-wins': 'White wins',
    'black-wins': 'Black wins',
    'draw': 'Draw',
    'aborted': 'Game aborted',
  };

  const reasons: Record<string, string> = {
    checkmate: 'by checkmate',
    resign: 'by resignation',
    timeout: 'on time',
    stalemate: 'by stalemate',
    agreement: 'by agreement',
    repetition: 'by repetition',
    '50move': 'by 50-move rule',
    material: 'insufficient material',
    abort: '',
    disconnect: 'opponent disconnected',
  };

  const outcomeStr = outcomes[result.outcome] ?? result.outcome;
  const reasonStr = reasons[result.reason] ?? result.reason;
  return reasonStr ? `${outcomeStr} — ${reasonStr}` : outcomeStr;
}

export function GameStatus({
  isMyTurn,
  isCheck,
  isGameOver,
  result,
  opponentNametag,
  lastHeartbeatAt,
  drawOfferedBy,
}: GameStatusProps) {
  const [now, setNow] = useState(Date.now());

  // Update "now" every second for connection status
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const heartbeatAge = lastHeartbeatAt > 0 ? now - lastHeartbeatAt : Infinity;
  const isConnected = heartbeatAge < HEARTBEAT_STALE_MS;
  const isStale = heartbeatAge >= HEARTBEAT_STALE_MS && heartbeatAge < HEARTBEAT_WARN_MS;

  let statusText: string;
  let statusColor = 'text-neutral-300';

  if (isGameOver && result) {
    statusText = formatResult(result);
    statusColor = 'text-orange-300';
  } else if (isCheck) {
    statusText = isMyTurn ? 'Check! Your move' : 'Check!';
    statusColor = 'text-red-400';
  } else if (drawOfferedBy === 'opponent') {
    statusText = `${opponentNametag} offers a draw`;
    statusColor = 'text-orange-300';
  } else if (isMyTurn) {
    statusText = 'Your turn';
    statusColor = 'text-green-400';
  } else {
    statusText = `Waiting for ${opponentNametag}`;
  }

  return (
    <div className="flex items-center gap-3 bg-neutral-900 border border-white/10 rounded-2xl px-4 py-2 w-full max-w-4xl">
      {/* Connection indicator */}
      {!isGameOver && (
        <div className="flex items-center gap-1.5 shrink-0" title={
          isConnected ? 'Connected' : isStale ? 'Connection stale' : 'Possibly disconnected'
        }>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? 'bg-green-500'
                : isStale
                  ? 'bg-yellow-500 animate-pulse'
                  : 'bg-red-500 animate-pulse'
            }`}
          />
        </div>
      )}

      {/* Status text */}
      <span className={`text-sm font-medium ${statusColor} flex-1`}>
        {statusText}
      </span>

      {/* Opponent nametag */}
      {!isGameOver && (
        <span className="text-neutral-500 text-xs shrink-0">
          vs {opponentNametag}
        </span>
      )}
    </div>
  );
}
