/**
 * What a `mint_nft` attempt can do on this connection, and what its failure means.
 *
 * Errors are read by their numeric `.code` (duck-typed: `instanceof ConnectError`
 * breaks across bundle copies of the SDK). A failure that may have minted is never
 * offered a retry: the wallet resumes a journaled mint, and asking again could mint
 * a second NFT (docs/CONNECT.md, "mint_nft Intent").
 */
import { ERROR_CODES, PERMISSION_SCOPES } from '@unicitylabs/sphere-sdk/connect';

export type NftMintSupport = 'supported' | 'unsupported' | 'not-granted';

export type NftMintFailureKind =
  | 'cancelled'
  | 'locked'
  | 'unsupported'
  | 'not-granted'
  /** The mint may still complete: do not ask again. */
  | 'maybe-minted'
  | 'failed';

export interface NftMintFailure {
  kind: NftMintFailureKind;
  /** The token a journaled mint will become, when the wallet named it. */
  tokenId: string | null;
  /** The wallet's or the SDK's own words. */
  reason: string;
}

/** Connect 2.3 added `mint_nft`. null when the version is missing or unreadable. */
function knowsNftMint(walletProtocol: string | null): boolean | null {
  const match = /^(\d+)\.(\d+)$/.exec(walletProtocol?.trim() ?? '');
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 2 || (major === 2 && minor >= 3);
}

export function nftMintSupport(walletProtocol: string | null, permissions: readonly string[]): NftMintSupport {
  if (knowsNftMint(walletProtocol) === false) return 'unsupported';
  if (!permissions.includes(PERMISSION_SCOPES.NFT_MINT)) return 'not-granted';
  return 'supported';
}

const TOKEN_ID = /^[0-9a-f]{64}$/i;

/** The token id carried by an untrusted value (an intent result or error data), or null. */
export function readMintedTokenId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const tokenId = (value as { tokenId?: unknown }).tokenId;
  return typeof tokenId === 'string' && TOKEN_ID.test(tokenId) ? tokenId.toLowerCase() : null;
}

export function classifyNftMintError(err: unknown, walletProtocol: string | null): NftMintFailure {
  const e = (typeof err === 'object' && err !== null ? err : {}) as { code?: unknown; message?: unknown; data?: unknown };
  const code = typeof e.code === 'number' ? e.code : undefined;
  const reason = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '';
  const failure = (kind: NftMintFailureKind, tokenId: string | null = null): NftMintFailure => ({ kind, tokenId, reason });

  // First: a journaled mint names its token whatever the code, and the wallet resumes it.
  const tokenId = readMintedTokenId(e.data);
  if (tokenId) return failure('maybe-minted', tokenId);

  switch (code) {
    case ERROR_CODES.INTENT_OUTCOME_UNKNOWN:
      return failure('maybe-minted');
    case ERROR_CODES.USER_REJECTED:
    case ERROR_CODES.INTENT_CANCELLED:
      return failure('cancelled');
    case ERROR_CODES.WALLET_LOCKED:
      return failure('locked');
    case ERROR_CODES.PERMISSION_DENIED:
      // Below 2.3 no scope maps to mint_nft, so the host denies it whatever was granted.
      return failure(knowsNftMint(walletProtocol) === true ? 'not-granted' : 'unsupported');
    case ERROR_CODES.METHOD_NOT_FOUND:
      return failure('unsupported');
    default:
      return failure('failed');
  }
}
