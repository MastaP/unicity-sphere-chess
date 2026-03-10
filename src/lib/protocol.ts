import { PROTOCOL_PREFIX, GAME_ID_LENGTH } from '../constants';
import {
  ACTION,
  type ParsedMessage,
  type ChallengeColor,
  type GameOverResult,
  type GameOverReason,
} from '../types/protocol';

export function generateGameId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, GAME_ID_LENGTH);
}

export function encodeMessage(msg: ParsedMessage): string {
  const prefix = `${PROTOCOL_PREFIX}:${msg.gameId}`;

  switch (msg.action) {
    case ACTION.CHALLENGE:
      return `${prefix}:${ACTION.CHALLENGE}:${msg.color}:${msg.timeMinutes}:${msg.gameUrl}`;
    case ACTION.ACCEPT:
      return `${prefix}:${ACTION.ACCEPT}`;
    case ACTION.DECLINE:
      return `${prefix}:${ACTION.DECLINE}`;
    case ACTION.MOVE:
      return `${prefix}:${ACTION.MOVE}:${msg.san}:${msg.clockMs}`;
    case ACTION.RESIGN:
      return `${prefix}:${ACTION.RESIGN}`;
    case ACTION.DRAW_OFFER:
      return `${prefix}:${ACTION.DRAW_OFFER}`;
    case ACTION.DRAW_ACCEPT:
      return `${prefix}:${ACTION.DRAW_ACCEPT}`;
    case ACTION.DRAW_DECLINE:
      return `${prefix}:${ACTION.DRAW_DECLINE}`;
    case ACTION.HEARTBEAT:
      return `${prefix}:${ACTION.HEARTBEAT}:${msg.clockMs}`;
    case ACTION.ABORT:
      return `${prefix}:${ACTION.ABORT}`;
    case ACTION.GAMEOVER:
      return `${prefix}:${ACTION.GAMEOVER}:${msg.result}:${msg.reason}`;
  }
}

const VALID_CHALLENGE_COLORS = new Set<string>(['w', 'b', 'r']);
const VALID_GAMEOVER_RESULTS = new Set<string>(['w', 'b', 'd']);
const VALID_GAMEOVER_REASONS = new Set<string>([
  'checkmate',
  'resign',
  'timeout',
  'stalemate',
  'agreement',
  'repetition',
  '50move',
  'material',
  'disconnect',
]);

export function parseMessage(raw: string): ParsedMessage | null {
  if (!raw.startsWith(`${PROTOCOL_PREFIX}:`)) return null;

  const parts = raw.split(':');
  if (parts.length < 3) return null;

  const gameId = parts[1];
  if (!gameId || gameId.length !== GAME_ID_LENGTH) return null;

  const action = parts[2];
  if (!action) return null;

  switch (action) {
    case ACTION.CHALLENGE: {
      if (parts.length < 6) return null;
      const color = parts[3];
      const timeStr = parts[4];
      if (!color || !timeStr || !VALID_CHALLENGE_COLORS.has(color)) return null;
      const timeMinutes = parseInt(timeStr, 10);
      if (isNaN(timeMinutes)) return null;
      const gameUrl = parts.slice(5).join(':');
      return {
        action: ACTION.CHALLENGE,
        gameId,
        color: color as ChallengeColor,
        timeMinutes,
        gameUrl,
      };
    }

    case ACTION.ACCEPT:
      return { action: ACTION.ACCEPT, gameId };

    case ACTION.DECLINE:
      return { action: ACTION.DECLINE, gameId };

    case ACTION.MOVE: {
      if (parts.length < 5) return null;
      const san = parts[3];
      const clockStr = parts[4];
      if (!san || !clockStr) return null;
      const clockMs = parseInt(clockStr, 10);
      if (isNaN(clockMs)) return null;
      return { action: ACTION.MOVE, gameId, san, clockMs };
    }

    case ACTION.RESIGN:
      return { action: ACTION.RESIGN, gameId };

    case ACTION.DRAW_OFFER:
      return { action: ACTION.DRAW_OFFER, gameId };

    case ACTION.DRAW_ACCEPT:
      return { action: ACTION.DRAW_ACCEPT, gameId };

    case ACTION.DRAW_DECLINE:
      return { action: ACTION.DRAW_DECLINE, gameId };

    case ACTION.HEARTBEAT: {
      if (parts.length < 4) return null;
      const hbClockStr = parts[3];
      if (!hbClockStr) return null;
      const clockMs = parseInt(hbClockStr, 10);
      if (isNaN(clockMs)) return null;
      return { action: ACTION.HEARTBEAT, gameId, clockMs };
    }

    case ACTION.ABORT:
      return { action: ACTION.ABORT, gameId };

    case ACTION.GAMEOVER: {
      if (parts.length < 5) return null;
      const result = parts[3];
      const reason = parts[4];
      if (!result || !reason) return null;
      if (!VALID_GAMEOVER_RESULTS.has(result)) return null;
      if (!VALID_GAMEOVER_REASONS.has(reason)) return null;
      return {
        action: ACTION.GAMEOVER,
        gameId,
        result: result as GameOverResult,
        reason: reason as GameOverReason,
      };
    }

    default:
      return null;
  }
}
