import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { GameState } from '../../types/game';
import { finishedGameFrom } from './fromGameState';

const ENDED_AT = new Date('2026-09-16T12:00:00Z');

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: 'abcd1234',
    status: 'ended',
    myColor: 'white',
    chess: new Chess(),
    moveHistory: [
      { san: 'e4', clockMs: 1, timestamp: 1 },
      { san: 'e5', clockMs: 1, timestamp: 2 },
    ],
    myClockMs: 1,
    opponentClockMs: 1,
    timeControlMinutes: 10,
    result: { outcome: 'draw', reason: 'agreement' },
    opponent: { nametag: '@bob', pubkey: 'bb'.repeat(32) },
    drawOfferedBy: null,
    lastHeartbeatAt: 0,
    myDepositDone: true,
    opponentDepositDone: true,
    botElo: null,
    ...overrides,
  };
}

const ME = { nametag: 'alice', chainPubkey: '02' + 'aa'.repeat(32) };

describe('finishedGameFrom', () => {
  it('puts me on White and the opponent on Black when I played White', () => {
    expect(finishedGameFrom(state(), ME, ENDED_AT)).toEqual({
      gameId: 'abcd1234',
      moves: ['e4', 'e5'],
      result: { outcome: 'draw', reason: 'agreement' },
      timeControlMinutes: 10,
      white: '@alice',
      black: '@bob',
      botElo: null,
      endedAt: ENDED_AT,
    });
  });

  it('puts me on Black and the opponent on White when I played Black', () => {
    const game = finishedGameFrom(state({ myColor: 'black' }), ME, ENDED_AT);
    expect(game).toMatchObject({ white: '@bob', black: '@alice' });
  });

  it("names a bot opponent by its persona, not the shared bot nametag", () => {
    const game = finishedGameFrom(
      state({ myColor: 'black', botElo: 1320, opponent: { nametag: '@chess-bot', pubkey: '' } }),
      ME,
      ENDED_AT,
    );
    expect(game).toMatchObject({ white: 'Pavel (bot)', black: '@alice', botElo: 1320 });
  });

  it('names a bot with an unknown ELO generically', () => {
    const game = finishedGameFrom(state({ botElo: 999, opponent: { nametag: '@chess-bot', pubkey: '' } }), ME, ENDED_AT);
    expect(game?.black).toBe('Chess bot');
  });

  it('returns null for a game with no result', () => {
    expect(finishedGameFrom(state({ result: null }), ME, ENDED_AT)).toBeNull();
  });
});
