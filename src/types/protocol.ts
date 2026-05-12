export const ACTION = {
  CHALLENGE: 'ch',
  ACCEPT: 'ok',
  DECLINE: 'no',
  MOVE: 'mv',
  RESIGN: 'rs',
  DRAW_OFFER: 'do',
  DRAW_ACCEPT: 'da',
  DRAW_DECLINE: 'dd',
  HEARTBEAT: 'hb',
  ABORT: 'ab',
  GAMEOVER: 'go',
  REMATCH: 'rm',
  /**
   * Liveness probe sent before requesting a deposit. The bot replies PONG
   * if it can accept a new game, DECLINE if at capacity, or nothing if
   * offline. 15s timeout on the UI side avoids depositing into a dead bot.
   */
  PING: 'pi',
  PONG: 'po',
} as const;

export type ActionCode = (typeof ACTION)[keyof typeof ACTION];

export type GameOverResult = 'w' | 'b' | 'd';

export type GameOverReason =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'stalemate'
  | 'agreement'
  | 'repetition'
  | '50move'
  | 'material'
  | 'disconnect';

export type ChallengeColor = 'w' | 'b' | 'r';

export interface ChallengeMessage {
  action: typeof ACTION.CHALLENGE;
  gameId: string;
  color: ChallengeColor;
  timeMinutes: number;
  gameUrl: string;
  /** Optional ELO for bot opponents (ignored for human players) */
  elo?: number;
}

export interface AcceptMessage {
  action: typeof ACTION.ACCEPT;
  gameId: string;
}

export interface DeclineMessage {
  action: typeof ACTION.DECLINE;
  gameId: string;
}

export interface MoveMessage {
  action: typeof ACTION.MOVE;
  gameId: string;
  san: string;
  clockMs: number;
  /** Color of the player who made this move */
  color: 'w' | 'b';
  moveNum: number;
  /**
   * Optional Unix-epoch ms timestamp set by the sender when transmitting.
   * Receivers subtract (now - sentAtMs) from clockMs to compensate for
   * Nostr DM transit delay when displaying the opponent's clock. Absent
   * on messages from older clients — in that case fall back to raw clockMs.
   */
  sentAtMs?: number;
}

export interface ResignMessage {
  action: typeof ACTION.RESIGN;
  gameId: string;
}

export interface DrawOfferMessage {
  action: typeof ACTION.DRAW_OFFER;
  gameId: string;
}

export interface DrawAcceptMessage {
  action: typeof ACTION.DRAW_ACCEPT;
  gameId: string;
}

export interface DrawDeclineMessage {
  action: typeof ACTION.DRAW_DECLINE;
  gameId: string;
}

export interface HeartbeatMessage {
  action: typeof ACTION.HEARTBEAT;
  gameId: string;
  clockMs: number;
}

export interface AbortMessage {
  action: typeof ACTION.ABORT;
  gameId: string;
}

export interface GameOverMessage {
  action: typeof ACTION.GAMEOVER;
  gameId: string;
  result: GameOverResult;
  reason: GameOverReason;
}

export interface RematchMessage {
  action: typeof ACTION.REMATCH;
  gameId: string;
  newGameId: string;
  color: ChallengeColor;
  timeMinutes: number;
}

export interface PingMessage {
  action: typeof ACTION.PING;
  gameId: string;
}

export interface PongMessage {
  action: typeof ACTION.PONG;
  gameId: string;
}

export type ParsedMessage =
  | ChallengeMessage
  | AcceptMessage
  | DeclineMessage
  | MoveMessage
  | ResignMessage
  | DrawOfferMessage
  | DrawAcceptMessage
  | DrawDeclineMessage
  | HeartbeatMessage
  | AbortMessage
  | GameOverMessage
  | RematchMessage
  | PingMessage
  | PongMessage;
