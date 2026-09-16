/**
 * Mint the NFT of a finished game into the connected wallet: check the wallet can,
 * draw the image, wait for any earlier wallet prompt, then ask with `mint_nft`.
 *
 * The wallet mints into its own address, signed with its own key, and asks the
 * user every time. So each player's client mints their own NFT, and in a bot game
 * only the human's client ever does.
 */
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import type { MintNftIntentParams } from '@unicitylabs/sphere-sdk/connect';
import type { FinishedGame } from './gameRecord';
import { buildGameNftContent, type NftImage } from './nftContent';
import {
  classifyNftMintError,
  nftMintSupport,
  readMintedTokenId,
  type NftMintFailure,
  type NftMintFailureKind,
} from './mintOutcome';

export type NftMintState =
  | { status: 'preparing' }
  | { status: 'confirming' }
  | { status: 'minted'; tokenId: string }
  | { status: 'failed'; failure: NftMintFailure };

/** The part of `ConnectClient` a mint uses. */
export interface NftMintClient {
  readonly walletProtocol: string | null;
  readonly permissions: readonly string[];
  intent<T = unknown>(action: string, params: Record<string, unknown>): Promise<T>;
}

/** Whether asking again is safe: never for a mint that may still complete. */
export function canRetryNftMint(kind: NftMintFailureKind): boolean {
  return kind === 'cancelled' || kind === 'locked' || kind === 'failed';
}

export async function mintGameNft({
  client,
  game,
  site,
  renderImage,
  after,
  onState,
}: {
  client: NftMintClient;
  game: FinishedGame;
  site: string;
  renderImage: () => Promise<NftImage>;
  /** Settles when an earlier wallet prompt (the payout) has been answered, either way. */
  after?: Promise<unknown>;
  onState: (state: NftMintState) => void;
}): Promise<NftMintState> {
  // Handled now, so a rejection that settles before it is awaited is never "unhandled".
  const walletFree = after ? after.then(noop, noop) : Promise.resolve();
  const settle = (state: NftMintState): NftMintState => {
    onState(state);
    return state;
  };
  const fail = (kind: NftMintFailureKind, reason = ''): NftMintState =>
    settle({ status: 'failed', failure: { kind, tokenId: null, reason } });

  const support = nftMintSupport(client.walletProtocol, client.permissions);
  if (support !== 'supported') return fail(support);

  onState({ status: 'preparing' });
  let params: MintNftIntentParams;
  try {
    params = { content: buildGameNftContent(game, site, await renderImage()), sign: true };
  } catch (err) {
    return fail('failed', err instanceof Error ? err.message : String(err));
  }

  await walletFree;
  onState({ status: 'confirming' });
  let result: unknown;
  try {
    result = await client.intent(INTENT_ACTIONS.MINT_NFT, params);
  } catch (err) {
    return settle({ status: 'failed', failure: classifyNftMintError(err, client.walletProtocol) });
  }

  const tokenId = readMintedTokenId(result);
  if (!tokenId) return fail('maybe-minted', 'The wallet answered without a token id');
  return settle({ status: 'minted', tokenId });
}

function noop(): void {}
