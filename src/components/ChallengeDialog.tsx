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
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm text-center">
        <div className="animate-pulse mb-4">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        {status === 'depositing' && (
          <p className="text-slate-300">Depositing {ENTRY_FEE} UCT...</p>
        )}
        {status === 'challenging' && (
          <p className="text-slate-300">Sending challenge...</p>
        )}
        {status === 'awaiting-accept' && (
          <>
            <p className="text-slate-300">
              Waiting for {opponent ?? 'opponent'}...
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Expires in {countdownStr}
            </p>
          </>
        )}

        <button
          onClick={onCancel}
          className="mt-4 px-4 py-2 text-slate-400 hover:text-slate-200 text-sm cursor-pointer transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-sm"
    >
      <h2 className="text-lg font-semibold text-slate-100 mb-4">New Game</h2>

      {/* Opponent nametag */}
      <label className="block mb-4">
        <span className="text-slate-400 text-sm">Opponent</span>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">@</span>
          <input
            type="text"
            value={nametag.replace(/^@/, '')}
            onChange={(e) => setNametag(e.target.value)}
            placeholder="nametag"
            className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-8 pr-3 py-2
                       text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500
                       transition-colors"
          />
        </div>
      </label>

      {/* Color selection */}
      <fieldset className="mb-4">
        <legend className="text-slate-400 text-sm mb-2">Play as</legend>
        <div className="flex gap-2">
          {(['white', 'black'] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                ${
                  color === c
                    ? c === 'white'
                      ? 'bg-slate-100 text-slate-900'
                      : 'bg-slate-600 text-slate-100 ring-2 ring-amber-500'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
            >
              {c === 'white' ? '\u2654 White' : '\u265A Black'}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Time control */}
      <fieldset className="mb-5">
        <legend className="text-slate-400 text-sm mb-2">Time control</legend>
        <div className="flex gap-2">
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTimeMinutes(t)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors
                ${
                  timeMinutes === t
                    ? 'bg-amber-500 text-slate-900'
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
            >
              {t} min
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold
                   rounded-xl transition-colors cursor-pointer shadow-lg shadow-amber-500/20"
      >
        Challenge ({ENTRY_FEE} UCT)
      </button>
    </form>
  );
}
