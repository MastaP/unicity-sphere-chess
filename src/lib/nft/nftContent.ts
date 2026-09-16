/**
 * The `content` of a `mint_nft` intent for a finished game (Connect 2.3; the
 * format is sphere-sdk's docs/NFT-METADATA.md). Built with the SDK's own
 * `nftContentToWire`, which turns the image bytes into the base64 the wire needs.
 */
import { nftContentToWire } from '@unicitylabs/sphere-sdk/connect';
import type { NftAttribute, WireNftContent, WireNftMetadata } from '@unicitylabs/sphere-sdk/connect';
import { resultReasonLabel } from '../chess-helpers';
import { buildPgn, describeGame, finalPosition, fullMoves, pgnResult, type FinishedGame } from './gameRecord';

export const NFT_COLLECTION = 'Unicity Chess';

export interface NftImage {
  /** The media type the bytes are actually encoded in. */
  mediaType: string;
  bytes: Uint8Array;
}

function isMetadata(content: WireNftContent): content is WireNftMetadata {
  return content.kind === 'metadata';
}

export function buildGameNftContent(game: FinishedGame, site: string, image: NftImage): WireNftMetadata {
  const result = pgnResult(game.result.outcome);
  const attributes: NftAttribute[] = [
    { trait_type: 'White', value: game.white },
    { trait_type: 'Black', value: game.black },
    { trait_type: 'Result', value: result },
    { trait_type: 'Termination', value: resultReasonLabel(game.result.reason) },
    { trait_type: 'Moves', value: fullMoves(game) },
    { trait_type: 'Time control', value: `${game.timeControlMinutes} min` },
    { trait_type: 'Date', value: game.endedAt.toISOString().slice(0, 10) },
  ];
  if (game.botElo != null) attributes.push({ trait_type: 'Bot ELO', value: game.botElo });
  attributes.push(
    { trait_type: 'Game ID', value: game.gameId },
    { trait_type: 'Final position (FEN)', value: finalPosition(game.moves).fen },
    { trait_type: 'PGN', value: buildPgn(game, site) },
  );

  const content = nftContentToWire({
    kind: 'metadata',
    name: `${game.white} vs ${game.black} · ${result === '1/2-1/2' ? '½-½' : result}`,
    description: describeGame(game),
    image: { kind: 'media', media_type: image.mediaType, bytes: image.bytes },
    animation_url: null,
    external_url: site,
    attributes,
    collection: NFT_COLLECTION,
    // An open collection: anyone can mint content that claims it, so an id would prove nothing.
    collection_id: null,
  });
  if (!isMetadata(content)) throw new Error('nftContentToWire changed the kind of the content');
  return content;
}
