import { describe, expect, it } from 'vitest';
import { classifyNftMintError, nftMintSupport, readMintedTokenId } from './mintOutcome';

const TOKEN = 'AB'.repeat(32);
const token = 'ab'.repeat(32);

function connectError(code: number, message = 'wallet said no', data?: unknown) {
  return Object.assign(new Error(message), { code, data });
}

describe('nftMintSupport', () => {
  it('rejects a wallet on Connect 2.2, which has no mint_nft', () => {
    expect(nftMintSupport('2.2', ['nft:mint'])).toBe('unsupported');
  });

  it('reports a 2.3 wallet that did not grant nft:mint', () => {
    expect(nftMintSupport('2.3', ['identity:read', 'mint:request'])).toBe('not-granted');
  });

  it('accepts a 2.3 wallet that granted nft:mint', () => {
    expect(nftMintSupport('2.3', ['nft:mint'])).toBe('supported');
  });

  it('accepts a later major version that granted nft:mint', () => {
    expect(nftMintSupport('3.0', ['nft:mint'])).toBe('supported');
  });

  it('tries a wallet whose version it cannot read, if the scope was granted', () => {
    expect(nftMintSupport(null, ['nft:mint'])).toBe('supported');
  });
});

describe('readMintedTokenId', () => {
  it('reads a 64-hex token id, lowercased', () => {
    expect(readMintedTokenId({ tokenId: TOKEN })).toBe(token);
  });

  it('refuses anything that is not a 64-hex token id', () => {
    expect(readMintedTokenId({ tokenId: 'abc' })).toBeNull();
    expect(readMintedTokenId(null)).toBeNull();
    expect(readMintedTokenId('x')).toBeNull();
  });
});

describe('classifyNftMintError', () => {
  it('treats a journaled mint as possibly minted whatever its code, keeping the token id', () => {
    expect(classifyNftMintError(connectError(-32603, 'aggregator down', { tokenId: TOKEN }), '2.3')).toEqual({
      kind: 'maybe-minted',
      tokenId: token,
      reason: 'aggregator down',
    });
  });

  it('treats an unknown outcome without a token id as possibly minted', () => {
    expect(classifyNftMintError(connectError(4201, 'Intent outcome unknown'), '2.3')).toEqual({
      kind: 'maybe-minted',
      tokenId: null,
      reason: 'Intent outcome unknown',
    });
  });

  it('reads a declined prompt as cancelled', () => {
    expect(classifyNftMintError(connectError(4003), '2.3').kind).toBe('cancelled');
  });

  it('reads a cancelled intent as cancelled', () => {
    expect(classifyNftMintError(connectError(4200), '2.3').kind).toBe('cancelled');
  });

  it('reads a locked wallet as locked', () => {
    expect(classifyNftMintError(connectError(4009), '2.3').kind).toBe('locked');
  });

  it('reads a permission denial from a 2.3 wallet as a missing grant', () => {
    expect(classifyNftMintError(connectError(4002), '2.3').kind).toBe('not-granted');
  });

  it('reads a permission denial from an older wallet as no mint support', () => {
    expect(classifyNftMintError(connectError(4002), '2.2').kind).toBe('unsupported');
  });

  it('reads an unknown method as no mint support', () => {
    expect(classifyNftMintError(connectError(-32601), '2.3').kind).toBe('unsupported');
  });

  it('keeps the message of any other failure', () => {
    expect(classifyNftMintError(new Error('boom'), '2.3')).toEqual({ kind: 'failed', tokenId: null, reason: 'boom' });
  });
});
