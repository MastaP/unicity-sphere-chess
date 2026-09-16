/**
 * A finished game as the NFT records it: whether it earns one, its PGN, its
 * final position and a one-line description. Pure — no React, no DOM.
 */
import { Chess } from 'chess.js';
import type { GameResult } from '../../types/game';

export interface FinishedGame {
  gameId: string;
  /** SAN moves from the standard starting position, in order. */
  moves: readonly string[];
  result: GameResult;
  timeControlMinutes: number;
  /** How each side is named: a @nametag, a shortened key, or the bot's name. */
  white: string;
  black: string;
  /** ELO of the bot opponent; null for a game between two people. */
  botElo: number | null;
  endedAt: Date;
}

/** A game shorter than this many full moves earns no NFT. */
export const NFT_MIN_FULL_MOVES = 5;

export function qualifiesForNft(game: FinishedGame): boolean {
  return game.result.outcome !== 'aborted' && fullMoves(game) >= NFT_MIN_FULL_MOVES;
}

/** Full moves played: a move by White, answered or not, counts as one. */
export function fullMoves(game: FinishedGame): number {
  return Math.ceil(game.moves.length / 2);
}

/** Replays `moves` from the start, throwing on the first one that is not legal. */
function replay(moves: readonly string[]): Chess {
  const chess = new Chess();
  moves.forEach((san, i) => {
    try {
      chess.move(san);
    } catch {
      throw new Error(`Move ${i + 1} (${san}) is not legal in this game`);
    }
  });
  return chess;
}

export function finalPosition(moves: readonly string[]): {
  fen: string;
  lastMove: { from: string; to: string } | null;
} {
  const chess = replay(moves);
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  return { fen: chess.fen(), lastMove: last ? { from: last.from, to: last.to } : null };
}

export function pgnResult(outcome: GameResult['outcome']): string {
  switch (outcome) {
    case 'white-wins':
      return '1-0';
    case 'black-wins':
      return '0-1';
    case 'draw':
      return '1/2-1/2';
    case 'aborted':
      return '*';
  }
}

/** The PGN Termination tag (PGN standard §9.8.1). */
function pgnTermination(result: GameResult): string {
  switch (result.reason) {
    case 'timeout':
      return 'time forfeit';
    case 'disconnect':
      return 'abandoned';
    case 'abort':
      return 'unterminated';
    default:
      return 'normal';
  }
}

function pgnDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

function pgnTag(name: string, value: string): string {
  return `[${name} "${value.replace(/[\\"]/g, (c) => `\\${c}`)}"]`;
}

export function buildPgn(game: FinishedGame, site: string): string {
  replay(game.moves);
  const result = pgnResult(game.result.outcome);
  const headers = [
    pgnTag('Event', 'Unicity Chess'),
    pgnTag('Site', site),
    pgnTag('Date', pgnDate(game.endedAt)),
    pgnTag('Round', '-'),
    pgnTag('White', game.white),
    pgnTag('Black', game.black),
    pgnTag('Result', result),
    pgnTag('TimeControl', String(game.timeControlMinutes * 60)),
    pgnTag('Termination', pgnTermination(game.result)),
  ];
  const movetext: string[] = [];
  game.moves.forEach((san, i) => {
    movetext.push(i % 2 === 0 ? `${i / 2 + 1}. ${san}` : san);
  });
  movetext.push(result);
  return `${headers.join('\n')}\n\n${movetext.join(' ')}`;
}

const WIN_HOW: Partial<Record<GameResult['reason'], string>> = {
  checkmate: 'by checkmate',
  resign: 'by resignation',
  timeout: 'on time',
  disconnect: 'by forfeit',
};

const DRAW_HOW: Partial<Record<GameResult['reason'], string>> = {
  stalemate: 'by stalemate',
  agreement: 'by agreement',
  repetition: 'by threefold repetition',
  '50move': 'by the 50-move rule',
  material: 'by insufficient material',
};

function movesPhrase(n: number): string {
  return `${n} ${n === 1 ? 'move' : 'moves'}`;
}

export function describeGame(game: FinishedGame): string {
  const n = fullMoves(game);
  const { outcome, reason } = game.result;
  if (outcome === 'white-wins' || outcome === 'black-wins') {
    const winner = outcome === 'white-wins' ? `${game.white} won with White` : `${game.black} won with Black`;
    const how = WIN_HOW[reason];
    return `${winner}${how ? ` ${how}` : ''} in ${movesPhrase(n)}.`;
  }
  if (outcome === 'draw') {
    const how = DRAW_HOW[reason];
    return `Drawn${how ? ` ${how}` : ''} after ${movesPhrase(n)}.`;
  }
  return `Aborted after ${movesPhrase(n)}.`;
}

/** A player's name for the record: their @nametag, else a shortened key. */
export function playerLabel(nametag: string | undefined, pubkey: string): string {
  // A nametag has no whitespace; an opponent's can come from a challenge link, so strip any.
  const tag = nametag?.replace(/[\s\p{Cc}]/gu, '').replace(/^@/, '');
  if (tag) return `@${tag}`;
  const key = pubkey.trim();
  if (key.length > 13) return `${key.slice(0, 8)}…${key.slice(-4)}`;
  return key || 'Anonymous';
}
