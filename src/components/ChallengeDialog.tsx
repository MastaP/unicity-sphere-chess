import { useState, useEffect, useRef } from 'react';
import type { PlayerColor, GameStatus } from '../types/game.js';
import { CHALLENGE_TIMEOUT_MS, ENTRY_FEE } from '../constants.js';

interface ChallengeDialogProps {
  onChallenge: (opponent: string, color: PlayerColor, timeMinutes: 3 | 5 | 10) => Promise<void>;
  status: GameStatus;
  opponent: string | null;
  onCancel: () => void;
}

const TIME_OPTIONS = [3, 5, 10] as const;

export function ChallengeDialog({ onChallenge, status, opponent, onCancel }: ChallengeDialogProps) {
  const [nametag, setNametag] = useState('');
  const [color, setColor] = useState<PlayerColor>('white');
  const [timeMinutes, setTimeMinutes] = useState<3 | 5 | 10>(5);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const challengeSentAt = useRef<number>(0);

  const isWaiting = status === 'depositing' || status === 'challenging' || status === 'awaiting-accept';

  // Countdown timer when waiting for acceptance
  useEffect(() => {
    if (!isWaiting) {
      challengeSentAt.current = 0;
      setCountdown(0);
      return;
    }

    if (!challengeSentAt.current) {
      challengeSentAt.current = Date.now();
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - challengeSentAt.current;
      const remaining = Math.max(0, CHALLENGE_TIMEOUT_MS - elapsed);
      setCountdown(Math.ceil(remaining / 1000));

      if (remaining <= 0) {
        onCancel();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isWaiting, onCancel]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleaned = nametag.trim();
    if (!cleaned) {
      setError('Enter an opponent nametag');
      return;
    }

    const tag = cleaned.startsWith('@') ? cleaned : `@${cleaned}`;

    try {
      await onChallenge(tag, color, timeMinutes);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send challenge');
    }
  }

  if (isWaiting) {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    const countdownStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm text-center">
        <div className="animate-pulse mb-4">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        {status === 'depositing' && (
          <p className="text-neutral-300">Depositing {ENTRY_FEE} UCT...</p>
        )}
        {status === 'challenging' && (
          <p className="text-neutral-300">Sending challenge...</p>
        )}
        {status === 'awaiting-accept' && (
          <>
            <p className="text-neutral-300">
              Waiting for {opponent ?? 'opponent'}...
            </p>
            <p className="text-neutral-500 text-sm mt-1">
              Expires in {countdownStr}
            </p>
          </>
        )}

        <button
          onClick={onCancel}
          className="mt-4 px-4 py-2 text-neutral-500 hover:text-neutral-300 text-sm cursor-pointer transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm"
    >
      <h2 className="text-lg font-semibold text-white mb-4">New Game</h2>

      {/* Opponent nametag */}
      <label className="block mb-4">
        <span className="text-neutral-400 text-sm">Opponent</span>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">@</span>
          <input
            type="text"
            value={nametag.replace(/^@/, '')}
            onChange={(e) => setNametag(e.target.value)}
            placeholder="nametag"
            className="w-full bg-neutral-800 border border-neutral-700 rounded-xl pl-8 pr-3 py-2.5
                       text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500
                       transition-colors"
          />
        </div>
      </label>

      {/* Color selection */}
      <fieldset className="mb-4">
        <legend className="text-neutral-400 text-sm mb-2">Play as</legend>
        <div className="flex gap-2">
          {(['white', 'black'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors
                ${
                  color === c
                    ? c === 'white'
                      ? 'bg-neutral-100 text-neutral-900'
                      : 'bg-neutral-700 text-white ring-2 ring-orange-500'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
            >
              {c === 'white' ? '\u2654 White' : '\u265A Black'}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Time control */}
      <fieldset className="mb-5">
        <legend className="text-neutral-400 text-sm mb-2">Time control</legend>
        <div className="flex gap-2">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeMinutes(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium cursor-pointer transition-colors
                ${
                  timeMinutes === t
                    ? 'bg-orange-500 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                }`}
            >
              {t} min
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-3 py-2 rounded-xl text-sm mb-4">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold
                   rounded-xl transition-colors cursor-pointer"
      >
        Challenge ({ENTRY_FEE} UCT)
      </button>
    </form>
  );
}
