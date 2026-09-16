import type { ReactNode } from 'react';
import { NFT_MIN_FULL_MOVES, qualifiesForNft, type FinishedGame } from '../lib/nft/gameRecord.js';
import { canRetryNftMint, type NftMintState } from '../lib/nft/mintGameNft.js';
import type { NftMintFailure } from '../lib/nft/mintOutcome.js';

interface NftMintStatusProps {
  finishedGame: FinishedGame | null;
  nftMint: NftMintState | null;
  onRetry: () => void;
}

function shortTokenId(tokenId: string): string {
  return `${tokenId.slice(0, 8)}…${tokenId.slice(-6)}`;
}

function failureText(failure: NftMintFailure): { title: string; detail?: string } {
  switch (failure.kind) {
    case 'cancelled':
      return { title: 'NFT not minted — declined in your wallet' };
    case 'locked':
      return { title: 'NFT not minted — your wallet is locked', detail: 'Unlock Sphere, then mint again.' };
    case 'maybe-minted':
      return {
        title: 'Your game NFT may still be minted',
        detail: "Check your wallet's Tokens tab before trying again.",
      };
    case 'unsupported':
      return { title: "Your wallet can't mint NFTs yet", detail: 'Update Sphere to get an NFT of each game.' };
    case 'not-granted':
      return {
        title: "NFT minting isn't allowed for this app",
        detail: 'Disconnect, connect again, and allow minting NFTs.',
      };
    case 'failed':
      return { title: 'NFT mint failed', detail: failure.reason || undefined };
  }
}

/** What happened to the finished game's NFT, on the game-over overlay. */
export function NftMintStatus({ finishedGame, nftMint, onRetry }: NftMintStatusProps) {
  if (!finishedGame || finishedGame.result.outcome === 'aborted') return null;

  let body: ReactNode = null;
  if (!qualifiesForNft(finishedGame)) {
    body = <p className="text-neutral-500">Games under {NFT_MIN_FULL_MOVES} moves don&apos;t earn an NFT</p>;
  } else if (nftMint?.status === 'preparing') {
    body = <p className="text-neutral-400">Preparing your game NFT…</p>;
  } else if (nftMint?.status === 'confirming') {
    body = <p className="text-orange-300 font-medium">Confirm your game NFT in your wallet</p>;
  } else if (nftMint?.status === 'minted') {
    body = (
      <>
        <p className="text-green-300 font-medium">Game NFT minted ✓</p>
        <p className="text-neutral-500 font-mono" title={nftMint.tokenId}>
          {shortTokenId(nftMint.tokenId)}
        </p>
      </>
    );
  } else if (nftMint?.status === 'failed') {
    const { title, detail } = failureText(nftMint.failure);
    const tokenId = nftMint.failure.tokenId;
    body = (
      <>
        <p className={nftMint.failure.kind === 'cancelled' ? 'text-neutral-400' : 'text-orange-300'}>{title}</p>
        {detail && <p className="text-neutral-500 break-words">{detail}</p>}
        {tokenId && (
          <p className="text-neutral-500 font-mono" title={tokenId}>
            {shortTokenId(tokenId)}
          </p>
        )}
        {canRetryNftMint(nftMint.failure.kind) && (
          <button
            onClick={onRetry}
            className="mt-1.5 px-3 py-1 bg-white/10 hover:bg-white/15 text-neutral-200
                       rounded-lg cursor-pointer transition-colors"
          >
            Mint NFT
          </button>
        )}
      </>
    );
  }

  if (!body) return null;
  return (
    <div role="status" className="w-full max-w-60 text-center text-xs mb-3">
      {body}
    </div>
  );
}
