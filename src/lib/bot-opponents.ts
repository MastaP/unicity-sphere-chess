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

export const BOT_OPPONENTS: BotOpponent[] = [
  {
    id: 'timo',
    name: 'T1mo',
    nametag: CHESS_BOT_NAMETAG,
    elo: 800,
    avatar: `${import.meta.env.BASE_URL}avatars/chess_t1mo.png`,
    description: 'Beginner',
  },
  {
    id: 'pavel',
    name: 'Pavel',
    nametag: CHESS_BOT_NAMETAG,
    elo: 1300,
    avatar: `${import.meta.env.BASE_URL}avatars/chess_pavel.png`,
    description: 'Intermediate',
  },
  {
    id: 'ahto',
    name: 'Ahto',
    nametag: CHESS_BOT_NAMETAG,
    elo: 2100,
    avatar: `${import.meta.env.BASE_URL}avatars/chess_ahto.png`,
    description: 'Expert',
  },
];
