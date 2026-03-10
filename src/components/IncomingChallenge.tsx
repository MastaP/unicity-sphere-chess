import { useState } from 'react';
import type { IncomingChallenge as IncomingChallengeType } from '../types/game.js';
import { ENTRY_FEE } from '../constants.js';

interface IncomingChallengeProps {
  challenge: IncomingChallengeType;
  onAccept: () => Promise<void>;
  onDecline: () => void;
}

export function IncomingChallenge({ challenge, onAccept, onDecline }: IncomingChallengeProps) {
  const [isDepositing, setIsDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // challenge.color is already set to the receiver's color by GameContext
  const myColor = challenge.color;

  async function handleAccept() {
    setError(null);
    setIsDepositing(true);
    try {
      await onAccept();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to accept challenge');
      setIsDepositing(false);
    }
  }

  return (
    <div className="bg-orange-900/15 border border-orange-500/30 rounded-2xl p-5 w-full max-w-sm animate-[pulse_2s_ease-in-out_1]">
      <h3 className="text-orange-300 font-semibold mb-3">Incoming Challenge</h3>

      <div className="space-y-1 text-sm text-neutral-300 mb-4">
        <p>
          <span className="text-neutral-500">From:</span>{' '}
          <span className="font-medium text-white">{challenge.nametag}</span>
        </p>
        <p>
          <span className="text-neutral-500">You play:</span>{' '}
          {myColor === 'white' ? '\u2654 White' : '\u265A Black'}
        </p>
        <p>
          <span className="text-neutral-500">Time:</span>{' '}
          {challenge.timeMinutes} minutes
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-3 py-2 rounded-xl text-sm mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isDepositing}
          className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50
                     text-white font-semibold rounded-xl cursor-pointer disabled:cursor-not-allowed
                     transition-colors text-sm"
        >
          {isDepositing ? 'Depositing...' : `Accept (${ENTRY_FEE} UCT)`}
        </button>
        <button
          onClick={onDecline}
          disabled={isDepositing}
          className="flex-1 py-2.5 bg-white/10 hover:bg-white/15 disabled:bg-white/5
                     text-neutral-300 font-medium rounded-xl cursor-pointer disabled:cursor-not-allowed
                     transition-colors text-sm"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
