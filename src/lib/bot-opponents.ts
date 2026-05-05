/** Nametag of the chess bot service that handles all bot opponents */
export const CHESS_BOT_NAMETAG = 'chess-bot';

export interface BotOpponent {
  id: string;
  name: string;
  nametag: string;
  elo: number;
  avatar: string;
  description: string;
}

/**
 * Reward (in whole UCT) the bot pays when the player beats it. Tiered by ELO:
 *   ELO < 1000          → 20 UCT
 *   1000 ≤ ELO ≤ 2000   → 25 UCT
 *   ELO > 2000          → 30 UCT
 *
 * Must match `rewardForElo` in agentic-chatbot/packages/chess-bot/src/rewards.ts.
 */
export function rewardForElo(elo: number): number {
  if (!Number.isFinite(elo)) return 20;
  if (elo < 1000) return 20;
  if (elo <= 2000) return 25;
  return 30;
}

export const BOT_OPPONENTS: BotOpponent[] = [
  {
    id: 'timo',
    name: 'T1mo',
    nametag: CHESS_BOT_NAMETAG,
    elo: 800,
    avatar: 'avatars/chess_t1mo.png',
    description: 'Beginner',
  },
  {
    id: 'pavel',
    name: 'Pavel',
    nametag: CHESS_BOT_NAMETAG,
    elo: 1320,
    avatar: 'avatars/chess_pavel.png',
    description: 'Intermediate',
  },
  {
    id: 'ahto',
    name: 'Ahto',
    nametag: CHESS_BOT_NAMETAG,
    elo: 2100,
    avatar: 'avatars/chess_ahto.png',
    description: 'Expert',
  },
];
