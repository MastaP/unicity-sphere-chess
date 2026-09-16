import { describe, expect, it } from 'vitest';
import { nftContentFromWire } from '@unicitylabs/sphere-sdk/connect';
import type { FinishedGame } from './gameRecord';
import { canRetryNftMint, mintGameNft, type NftMintClient, type NftMintState } from './mintGameNft';

const SITE = 'https://mastap.github.io/unicity-sphere-chess/';
const TOKEN = 'cd'.repeat(32);
const IMAGE = { mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) };

const GAME: FinishedGame = {
  gameId: 'abcd1234',
  moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'],
  result: { outcome: 'white-wins', reason: 'resign' },
  timeControlMinutes: 5,
  white: '@alice',
  black: '@bob',
  botElo: null,
  endedAt: new Date('2026-09-16T12:00:00Z'),
};

interface IntentCall {
  action: string;
  params: Record<string, unknown>;
}

/** A wallet that answers every intent with `answer`, recording what it was asked. */
function wallet(
  answer: () => Promise<unknown>,
  { walletProtocol = '2.3', permissions = ['nft:mint'] }: { walletProtocol?: string | null; permissions?: string[] } = {},
) {
  const calls: IntentCall[] = [];
  const client: NftMintClient = {
    walletProtocol,
    permissions,
    intent<T>(action: string, params: Record<string, unknown>): Promise<T> {
      calls.push({ action, params });
      return answer() as Promise<T>;
    },
  };
  return { client, calls };
}

async function run(client: NftMintClient, extra: Partial<Parameters<typeof mintGameNft>[0]> = {}) {
  const states: NftMintState[] = [];
  let renders = 0;
  const final = await mintGameNft({
    client,
    game: GAME,
    site: SITE,
    renderImage: async () => {
      renders++;
      return IMAGE;
    },
    onState: (s) => states.push(s),
    ...extra,
  });
  return { final, states, renders };
}

describe('mintGameNft', () => {
  it('asks the wallet to mint the signed game NFT and reports its token id', async () => {
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }));
    const { final, states } = await run(client);

    expect(states).toEqual([{ status: 'preparing' }, { status: 'confirming' }, { status: 'minted', tokenId: TOKEN }]);
    expect(final).toEqual({ status: 'minted', tokenId: TOKEN });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.action).toBe('mint_nft');
    expect(calls[0]!.params.sign).toBe(true);
    const content = nftContentFromWire(calls[0]!.params.content);
    expect(content.kind === 'metadata' && content.name).toBe('@alice vs @bob · 1-0');
  });

  it('does not prompt until the earlier wallet prompt has settled', async () => {
    let release!: () => void;
    const after = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }));
    const done = run(client, { after });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toHaveLength(0);
    release();
    await done;
    expect(calls).toHaveLength(1);
  });

  it('still prompts when the earlier prompt failed', async () => {
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }));
    const { final } = await run(client, { after: Promise.reject(new Error('payout declined')) });
    expect(final.status).toBe('minted');
    expect(calls).toHaveLength(1);
  });

  it('never asks a wallet without mint_nft, and draws nothing for it', async () => {
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }), { walletProtocol: '2.2' });
    const { final, renders } = await run(client);
    expect(final).toMatchObject({ status: 'failed', failure: { kind: 'unsupported' } });
    expect(calls).toHaveLength(0);
    expect(renders).toBe(0);
  });

  it('never asks a wallet that did not grant nft:mint', async () => {
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }), { permissions: ['identity:read'] });
    const { final } = await run(client);
    expect(final).toMatchObject({ status: 'failed', failure: { kind: 'not-granted' } });
    expect(calls).toHaveLength(0);
  });

  it('reports a declined prompt as cancelled', async () => {
    const { client } = wallet(async () => {
      throw Object.assign(new Error('User rejected'), { code: 4003 });
    });
    const { final } = await run(client);
    expect(final).toMatchObject({ status: 'failed', failure: { kind: 'cancelled' } });
  });

  it('treats an answer without a token id as possibly minted', async () => {
    const { client } = wallet(async () => ({ ok: true }));
    const { final } = await run(client);
    expect(final).toMatchObject({ status: 'failed', failure: { kind: 'maybe-minted', tokenId: null } });
  });

  it('reports an image that could not be drawn, without asking the wallet', async () => {
    const { client, calls } = wallet(async () => ({ tokenId: TOKEN }));
    const { final } = await run(client, {
      renderImage: async () => {
        throw new Error('no canvas');
      },
    });
    expect(final).toEqual({ status: 'failed', failure: { kind: 'failed', tokenId: null, reason: 'no canvas' } });
    expect(calls).toHaveLength(0);
  });
});

describe('canRetryNftMint', () => {
  it('offers a retry after a cancel, a lock or a plain failure', () => {
    expect(canRetryNftMint('cancelled')).toBe(true);
    expect(canRetryNftMint('locked')).toBe(true);
    expect(canRetryNftMint('failed')).toBe(true);
  });

  it('never offers a retry for a mint that may still complete, or one the wallet cannot do', () => {
    expect(canRetryNftMint('maybe-minted')).toBe(false);
    expect(canRetryNftMint('unsupported')).toBe(false);
    expect(canRetryNftMint('not-granted')).toBe(false);
  });
});
