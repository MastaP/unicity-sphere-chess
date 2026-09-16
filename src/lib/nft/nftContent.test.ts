import { describe, expect, it } from 'vitest';
import { encodeNftContent } from '@unicitylabs/sphere-sdk';
import { nftContentFromWire } from '@unicitylabs/sphere-sdk/connect';
import { buildGameNftContent } from './nftContent';
import type { FinishedGame } from './gameRecord';

const SITE = 'https://mastap.github.io/unicity-sphere-chess/';
// A 1×1 PNG's first bytes are enough: the format does not decode the image.
const IMAGE = { mediaType: 'image/png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };

const MOVES = ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1'];

function game(overrides: Partial<FinishedGame> = {}): FinishedGame {
  return {
    gameId: 'abcd1234',
    moves: MOVES,
    result: { outcome: 'black-wins', reason: 'resign' },
    timeControlMinutes: 3,
    white: '@alice',
    black: '@bob',
    botElo: null,
    endedAt: new Date('2026-09-16T12:00:00Z'),
    ...overrides,
  };
}

describe('buildGameNftContent', () => {
  it('is content the wallet decodes and the SDK encodes, carrying the image bytes', () => {
    const decoded = nftContentFromWire(buildGameNftContent(game(), SITE, IMAGE));
    expect(() => encodeNftContent(decoded)).not.toThrow();
    expect(decoded.kind).toBe('metadata');
    if (decoded.kind !== 'metadata' || decoded.image?.kind !== 'media') throw new Error('expected inline media');
    expect(decoded.image.media_type).toBe('image/png');
    expect(Array.from(decoded.image.bytes)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('names the players and the result, and describes the game', () => {
    const content = buildGameNftContent(game(), SITE, IMAGE);
    expect(content.name).toBe('@alice vs @bob · 0-1');
    expect(content.description).toBe('@bob won with Black by resignation in 6 moves.');
    expect(content.external_url).toBe(SITE);
    expect(content.collection).toBe('Unicity Chess');
    expect(content.collection_id).toBeNull();
    expect(content.animation_url).toBeNull();
  });

  it('writes a draw as ½-½ in the name', () => {
    const content = buildGameNftContent(game({ result: { outcome: 'draw', reason: 'agreement' } }), SITE, IMAGE);
    expect(content.name).toBe('@alice vs @bob · ½-½');
  });

  it('records the game, its final position and its PGN as attributes', () => {
    const content = buildGameNftContent(game(), SITE, IMAGE);
    expect(content.attributes).toEqual([
      { trait_type: 'White', value: '@alice' },
      { trait_type: 'Black', value: '@bob' },
      { trait_type: 'Result', value: '0-1' },
      { trait_type: 'Termination', value: 'Resignation' },
      { trait_type: 'Moves', value: 6 },
      { trait_type: 'Time control', value: '3 min' },
      { trait_type: 'Date', value: '2026-09-16' },
      { trait_type: 'Game ID', value: 'abcd1234' },
      { trait_type: 'Final position (FEN)', value: 'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq - 5 6' },
      {
        trait_type: 'PGN',
        value: [
          '[Event "Unicity Chess"]',
          '[Site "https://mastap.github.io/unicity-sphere-chess/"]',
          '[Date "2026.09.16"]',
          '[Round "-"]',
          '[White "@alice"]',
          '[Black "@bob"]',
          '[Result "0-1"]',
          '[TimeControl "180"]',
          '[Termination "normal"]',
          '',
          '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 0-1',
        ].join('\n'),
      },
    ]);
  });

  it("adds the bot's ELO for a game against a bot", () => {
    const content = buildGameNftContent(game({ black: 'T1mo (bot)', botElo: 800 }), SITE, IMAGE);
    expect(content.attributes).toContainEqual({ trait_type: 'Bot ELO', value: 800 });
  });
});
