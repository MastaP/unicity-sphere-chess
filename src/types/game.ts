import type { Chess } from 'chess.js';

export type GameStatus =
  | 'idle'
  | 'depositing'
  | 'challenging'
  | 'awaiting-accept'
  | 'playing'
  | 'ended';

export type PlayerColor = 'white' | 'black';

export interface MoveRecord {
  san: string;
  clockMs: number;
  timestamp: number;
}

export interface GameResult {
  outcome: 'white-wins' | 'black-wins' | 'draw' | 'aborted';
  reason:
    | 'checkmate'
    | 'resign'
    | 'timeout'
    | 'stalemate'
    | 'agreement'
    | 'repetition'
    | '50move'
    | 'material'
    | 'abort'
    | 'disconnect';
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  myColor: PlayerColor;
  chess: Chess;
  moveHistory: MoveRecord[];
  myClockMs: number;
  opponentClockMs: number;
  timeControlMinutes: 3 | 5 | 10;
  result: GameResult | null;
  opponent: { nametag: string; pubkey: string } | null;
  drawOfferedBy: 'me' | 'opponent' | null;
  lastHeartbeatAt: number;
  myDepositDone: boolean;
  opponentDepositDone: boolean;
}

export interface IncomingChallenge {
  nametag: string;
  color: PlayerColor;
  timeMinutes: 3 | 5 | 10;
  gameId: string;
}
