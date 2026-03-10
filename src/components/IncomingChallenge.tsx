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
    <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-5 w-full max-w-sm animate-[pulse_2s_ease-in-out_1]">
      <h3 className="text-amber-300 font-semibold mb-3">Incoming Challenge</h3>

      <div className="space-y-1 text-sm text-slate-300 mb-4">
        <p>
          <span className="text-slate-500">From:</span>{' '}
          <span className="font-medium text-slate-100">{challenge.nametag}</span>
        </p>
        <p>
          <span className="text-slate-500">You play:</span>{' '}
          {myColor === 'white' ? '\u2654 White' : '\u265A Black'}
        </p>
        <p>
          <span className="text-slate-500">Time:</span>{' '}
          {challenge.timeMinutes} minutes
        </p>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 px-3 py-2 rounded-lg text-sm mb-3">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={isDepositing}
          className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-600/50
                     text-white font-semibold rounded-lg cursor-pointer disabled:cursor-not-allowed
                     transition-colors text-sm"
        >
          {isDepositing ? 'Depositing...' : `Accept (${ENTRY_FEE} UCT)`}
        </button>
        <button
          onClick={onDecline}
          disabled={isDepositing}
          className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700/50
                     text-slate-300 font-medium rounded-lg cursor-pointer disabled:cursor-not-allowed
                     transition-colors text-sm"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
