import { describe, expect, it } from 'vitest';
import {
  buildPgn,
  describeGame,
  finalPosition,
  playerLabel,
  qualifiesForNft,
  type FinishedGame,
} from './gameRecord';

const SCHOLARS_MATE = ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'];
const SITE = 'https://mastap.github.io/unicity-sphere-chess/';

function game(overrides: Partial<FinishedGame> = {}): FinishedGame {
  return {
    gameId: 'abcd1234',
    moves: SCHOLARS_MATE,
    result: { outcome: 'white-wins', reason: 'checkmate' },
    timeControlMinutes: 5,
    white: '@alice',
    black: '@bob',
    botElo: null,
    endedAt: new Date('2026-09-16T12:00:00Z'),
    ...overrides,
  };
}

/** `plies` legal half-moves: knights shuffling out and back. */
function shuffle(plies: number): string[] {
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  return Array.from({ length: plies }, (_, i) => cycle[i % 4]!);
}

describe('qualifiesForNft', () => {
  it('refuses an aborted game however long it ran', () => {
    expect(qualifiesForNft(game({ moves: shuffle(20), result: { outcome: 'aborted', reason: 'abort' } }))).toBe(false);
  });

  it('refuses a finished game that ended before White’s fifth move', () => {
    expect(qualifiesForNft(game({ moves: shuffle(8), result: { outcome: 'black-wins', reason: 'resign' } }))).toBe(false);
  });

  it('accepts a game that ended on White’s fifth move, which is a five-move game', () => {
    expect(qualifiesForNft(game({ moves: shuffle(9), result: { outcome: 'white-wins', reason: 'resign' } }))).toBe(true);
  });

  it('accepts a drawn game of five full moves', () => {
    expect(qualifiesForNft(game({ moves: shuffle(10), result: { outcome: 'draw', reason: 'agreement' } }))).toBe(true);
  });
});

describe('buildPgn', () => {
  it('writes the headers, the numbered moves and the result', () => {
    expect(buildPgn(game(), SITE)).toBe(
      [
        '[Event "Unicity Chess"]',
        '[Site "https://mastap.github.io/unicity-sphere-chess/"]',
        '[Date "2026.09.16"]',
        '[Round "-"]',
        '[White "@alice"]',
        '[Black "@bob"]',
        '[Result "1-0"]',
        '[TimeControl "300"]',
        '[Termination "normal"]',
        '',
        '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
      ].join('\n'),
    );
  });

  it('records a loss on time as a time forfeit, with a black win', () => {
    const pgn = buildPgn(game({ moves: ['d4', 'd5'], result: { outcome: 'black-wins', reason: 'timeout' } }), SITE);
    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn).toContain('[Termination "time forfeit"]');
    expect(pgn.endsWith('\n1. d4 d5 0-1')).toBe(true);
  });

  it('writes a draw as 1/2-1/2', () => {
    const pgn = buildPgn(game({ moves: ['d4'], result: { outcome: 'draw', reason: 'agreement' } }), SITE);
    expect(pgn).toContain('[Result "1/2-1/2"]');
    expect(pgn.endsWith('\n1. d4 1/2-1/2')).toBe(true);
  });

  it('escapes quotes and backslashes in header values', () => {
    const pgn = buildPgn(game({ white: 'The "Bot" \\ 1' }), SITE);
    expect(pgn).toContain('[White "The \\"Bot\\" \\\\ 1"]');
  });

  it('refuses a move list that is not a legal game', () => {
    expect(() => buildPgn(game({ moves: ['e4', 'e4'] }), SITE)).toThrow(/move 2/i);
  });
});

describe('finalPosition', () => {
  it('replays the moves to the final FEN and reports the last move', () => {
    expect(finalPosition(SCHOLARS_MATE)).toEqual({
      fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
      lastMove: { from: 'h5', to: 'f7' },
    });
  });

  it('has no last move before the first move', () => {
    expect(finalPosition([])).toEqual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      lastMove: null,
    });
  });
});

describe('describeGame', () => {
  it('names the winner, the side and how the game was won', () => {
    expect(describeGame(game())).toBe('@alice won with White by checkmate in 4 moves.');
  });

  it('describes a black win on time', () => {
    expect(describeGame(game({ moves: shuffle(23), result: { outcome: 'black-wins', reason: 'timeout' } }))).toBe(
      '@bob won with Black on time in 12 moves.',
    );
  });

  it('describes a draw with its reason', () => {
    expect(describeGame(game({ moves: shuffle(40), result: { outcome: 'draw', reason: 'repetition' } }))).toBe(
      'Drawn by threefold repetition after 20 moves.',
    );
  });
});

describe('playerLabel', () => {
  it('prefixes a bare nametag with @', () => {
    expect(playerLabel('alice', '')).toBe('@alice');
  });

  it('keeps a nametag that already has its @', () => {
    expect(playerLabel(' @alice ', '')).toBe('@alice');
  });

  it('falls back to a shortened public key without a nametag', () => {
    expect(playerLabel('', '02a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9')).toBe('02a1b2c3…e8f9');
  });

  it('drops whitespace and control characters a challenge link could smuggle into a nametag', () => {
    expect(playerLabel('bob\n[Result "0-1"]\t', '')).toBe('@bob[Result"0-1"]');
  });

  it('says Anonymous when there is nothing to name the player by', () => {
    expect(playerLabel(undefined, '')).toBe('Anonymous');
  });
});
