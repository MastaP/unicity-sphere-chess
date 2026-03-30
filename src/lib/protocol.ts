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
      // Bot challenges use the unichess: protocol format; human challenges use the URL
      if (msg.elo != null) {
        return `${prefix}:${ACTION.CHALLENGE}:${msg.color}:${msg.timeMinutes}:${msg.elo}`;
      }
      return msg.gameUrl;
    case ACTION.ACCEPT:
      return `${prefix}:${ACTION.ACCEPT}`;
    case ACTION.DECLINE:
      return `${prefix}:${ACTION.DECLINE}`;
    case ACTION.MOVE:
      return `${prefix}:${ACTION.MOVE}:${msg.san}:${msg.clockMs}:${msg.color}:${msg.moveNum}`;
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
    case ACTION.REMATCH:
      return `${prefix}:${ACTION.REMATCH}:${msg.newGameId}:${msg.color}:${msg.timeMinutes}`;
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

/**
 * Parse a raw DM message into a ParsedMessage.
 * Handles two formats:
 * - Challenge: a URL with query params (?game=...&action=ch&color=...&time=...)
 * - All others: uc1:<gameId>:<action>:<params...>
 */
export function parseMessage(raw: string): ParsedMessage | null {
  // Try parsing as a challenge URL first
  const challengeFromUrl = parseChallengeUrl(raw.trim());
  if (challengeFromUrl) return challengeFromUrl;

  // Standard uc1: protocol messages
  if (!raw.startsWith(`${PROTOCOL_PREFIX}:`)) return null;

  const parts = raw.split(':');
  if (parts.length < 3) return null;

  const gameId = parts[1];
  if (!gameId || gameId.length !== GAME_ID_LENGTH) return null;

  const action = parts[2];
  if (!action) return null;

  switch (action) {
    case ACTION.CHALLENGE: {
      // unichess:<gameId>:ch:<color>:<timeMinutes>[:<elo>]
      if (parts.length < 5) return null;
      const chColor = parts[3];
      if (!chColor || !VALID_CHALLENGE_COLORS.has(chColor)) return null;
      const chTime = parseInt(parts[4]!, 10);
      if (isNaN(chTime) || chTime <= 0) return null;
      const chElo = parts[5] ? parseInt(parts[5], 10) : undefined;
      return {
        action: ACTION.CHALLENGE,
        gameId,
        color: chColor as ChallengeColor,
        timeMinutes: chTime,
        gameUrl: raw,
        ...(chElo != null && !isNaN(chElo) ? { elo: chElo } : {}),
      };
    }

    case ACTION.ACCEPT:
      return { action: ACTION.ACCEPT, gameId };

    case ACTION.DECLINE:
      return { action: ACTION.DECLINE, gameId };

    case ACTION.MOVE: {
      if (parts.length < 7) return null;
      const san = parts[3];
      const clockStr = parts[4];
      const color = parts[5];
      const moveNum = parseInt(parts[6]!, 10);
      if (!san || !clockStr || !color) return null;
      if (color !== 'w' && color !== 'b') return null;
      const clockMs = parseInt(clockStr, 10);
      if (isNaN(clockMs) || isNaN(moveNum)) return null;
      return { action: ACTION.MOVE, gameId, san, clockMs, color, moveNum };
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

    case ACTION.REMATCH: {
      if (parts.length < 6) return null;
      const newGameId = parts[3];
      const rmColor = parts[4];
      const rmTimeStr = parts[5];
      if (!newGameId || newGameId.length !== GAME_ID_LENGTH) return null;
      if (!rmColor || !VALID_CHALLENGE_COLORS.has(rmColor)) return null;
      if (!rmTimeStr) return null;
      const rmTime = parseInt(rmTimeStr, 10);
      if (isNaN(rmTime)) return null;
      return {
        action: ACTION.REMATCH,
        gameId,
        newGameId,
        color: rmColor as ChallengeColor,
        timeMinutes: rmTime,
      };
    }

    default:
      return null;
  }
}

function parseChallengeUrl(raw: string): ParsedMessage | null {
  try {
    if (!raw.startsWith('http://') && !raw.startsWith('https://') && !raw.startsWith('unicity-connect://')) return null;
    // Convert unicity-connect:// to https:// for URL parsing
    const normalizedRaw = raw.replace(/^unicity-connect:\/\//, 'https://');
    const url = new URL(normalizedRaw);
    const gameId = url.searchParams.get('game');
    const action = url.searchParams.get('action');
    const color = url.searchParams.get('color');
    const timeStr = url.searchParams.get('time');

    if (action !== 'ch') return null;
    if (!gameId || gameId.length !== GAME_ID_LENGTH) return null;
    if (!color || !VALID_CHALLENGE_COLORS.has(color)) return null;
    if (!timeStr) return null;
    const timeMinutes = parseInt(timeStr, 10);
    if (isNaN(timeMinutes)) return null;

    const eloStr = url.searchParams.get('elo');
    const elo = eloStr ? parseInt(eloStr, 10) : undefined;

    return {
      action: ACTION.CHALLENGE,
      gameId,
      color: color as ChallengeColor,
      timeMinutes,
      gameUrl: raw,
      ...(elo != null && !isNaN(elo) ? { elo } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Build a challenge URL with game params as query parameters.
 * Uses unicity-connect:// protocol for deep link support in Sphere DMs.
 * Sphere converts this back to http(s) when opening.
 *
 * @param elo - Optional ELO rating for bot opponents. Omitted for human players.
 */
export function buildChallengeUrl(
  baseUrl: string,
  gameId: string,
  color: ChallengeColor,
  timeMinutes: number,
  challengerNametag: string,
  elo?: number,
): string {
  const url = new URL(baseUrl);
  url.searchParams.set('game', gameId);
  url.searchParams.set('action', 'ch');
  url.searchParams.set('color', color);
  url.searchParams.set('time', String(timeMinutes));
  url.searchParams.set('from', challengerNametag.replace(/^@/, ''));
  if (elo != null) {
    url.searchParams.set('elo', String(elo));
  }
  // Replace http(s):// with unicity-connect:// for Sphere deep link handling
  return url.toString().replace(/^https?:\/\//, 'unicity-connect://');
}
