/**
 * The NFT's image: the final position as the player saw it, with both players,
 * the score and a one-line summary, drawn on a canvas and encoded as PNG.
 *
 * Browser only. The Sphere wallet shows PNG, JPEG, GIF, WebP and AVIF, never SVG,
 * so the board is rasterised here. A flat board encodes to roughly 100 KB, far
 * inside the ~900 KB the mint_nft contract asks inline media to stay under.
 */
import type { PlayerColor } from '../../types/game';
import { boardLayout } from './boardLayout';
import { describeGame, finalPosition, type FinishedGame } from './gameRecord';
import type { NftImage } from './nftContent';
import { PIECE_SVG_BODY, type PieceCode } from './pieces';

export const MAX_IMAGE_BYTES = 900_000;

const SQUARE = 100;
const BOARD = SQUARE * 8;
const PAD = 32;
const BAR = 64;
const FOOTER = 96;
const WIDTH = PAD * 2 + BOARD;
const HEIGHT = PAD + BAR + BOARD + BAR + FOOTER;
const BOARD_TOP = PAD + BAR;

// The live board's colours (components/Board.tsx) and the app's background (App.css).
const BACKGROUND = '#060606';
const LIGHT_SQUARE = '#edeed1';
const DARK_SQUARE = '#779952';
const LAST_MOVE = 'rgba(255, 111, 0, 0.25)';
const FONT_FAMILY = "Geist, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${FONT_FAMILY}`;
}

/** Wait for the app's web font where the page has it; draw with the fallback otherwise. */
async function loadFonts(): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.load !== 'function') return;
  try {
    await Promise.all([fonts.load(font(600, 28)), fonts.load(font(500, 22)), fonts.load(font(400, 16))]);
  } catch {
    // The fallback face is fine.
  }
}

function loadPiece(code: PieceCode): Promise<HTMLImageElement> {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45" width="${SQUARE}" height="${SQUARE}">` +
    `${PIECE_SVG_BODY[code]}</svg>`;
  return new Promise((resolve, reject) => {
    const img = new Image(SQUARE, SQUARE);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not draw piece ${code}`));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/** `text`, shortened with an ellipsis until it fits `maxWidth` in the context's current font. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  // Binary search on the kept length: a name from a challenge link can be arbitrarily long.
  let keep = 1;
  let over = text.length;
  while (over - keep > 1) {
    const mid = (keep + over) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) keep = mid;
    else over = mid;
  }
  return `${text.slice(0, keep)}…`;
}

/** 1, 0 or ½ for a side, as a scoresheet writes it. */
function score(game: FinishedGame, side: PlayerColor): string {
  if (game.result.outcome === 'draw') return '½';
  const won = game.result.outcome === (side === 'white' ? 'white-wins' : 'black-wins');
  return won ? '1' : '0';
}

function drawPlayerBar(ctx: CanvasRenderingContext2D, game: FinishedGame, side: PlayerColor, top: number): void {
  const middle = top + BAR / 2;
  ctx.beginPath();
  ctx.arc(PAD + 12, middle, 11, 0, Math.PI * 2);
  ctx.fillStyle = side === 'white' ? '#fefefe' : '#1c1c1c';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#737373';
  ctx.stroke();

  const points = score(game, side);
  ctx.textBaseline = 'middle';
  ctx.font = font(700, 32);
  ctx.textAlign = 'right';
  ctx.fillStyle = points === '1' ? '#4ade80' : points === '½' ? '#fdba74' : '#737373';
  ctx.fillText(points, PAD + BOARD, middle);

  ctx.font = font(600, 28);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fefefe';
  const name = side === 'white' ? game.white : game.black;
  ctx.fillText(fit(ctx, name, BOARD - 120), PAD + 36, middle);
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  fen: string,
  lastMove: { from: string; to: string } | null,
  orientation: PlayerColor,
  pieces: Map<PieceCode, HTMLImageElement>,
): void {
  const layout = boardLayout(fen, orientation);
  ctx.save();
  ctx.beginPath();
  // roundRect is missing before Safari 16 and Firefox 112; square corners will do there.
  if (typeof ctx.roundRect === 'function') ctx.roundRect(PAD, BOARD_TOP, BOARD, BOARD, 12);
  else ctx.rect(PAD, BOARD_TOP, BOARD, BOARD);
  ctx.clip();

  for (const cell of layout) {
    const x = PAD + cell.col * SQUARE;
    const y = BOARD_TOP + cell.row * SQUARE;
    ctx.fillStyle = cell.light ? LIGHT_SQUARE : DARK_SQUARE;
    ctx.fillRect(x, y, SQUARE, SQUARE);
    if (lastMove && (cell.square === lastMove.from || cell.square === lastMove.to)) {
      ctx.fillStyle = LAST_MOVE;
      ctx.fillRect(x, y, SQUARE, SQUARE);
    }

    // Coordinates inside the edge squares, in the other square colour.
    ctx.fillStyle = cell.light ? DARK_SQUARE : LIGHT_SQUARE;
    ctx.font = font(600, 16);
    ctx.textBaseline = 'alphabetic';
    if (cell.col === 0) {
      ctx.textAlign = 'left';
      ctx.fillText(cell.square[1]!, x + 6, y + 20);
    }
    if (cell.row === 7) {
      ctx.textAlign = 'right';
      ctx.fillText(cell.square[0]!, x + SQUARE - 6, y + SQUARE - 7);
    }

    const piece = cell.piece && pieces.get(cell.piece);
    if (piece) ctx.drawImage(piece, x, y, SQUARE, SQUARE);
  }
  ctx.restore();
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The browser could not encode the image'))), type);
  });
}

/** The final position of `game`, drawn from `orientation`'s side, as a PNG. */
export async function renderGameImage(game: FinishedGame, orientation: PlayerColor): Promise<NftImage> {
  const { fen, lastMove } = finalPosition(game.moves);
  const codes = [...new Set(boardLayout(fen, orientation).flatMap((cell) => (cell.piece ? [cell.piece] : [])))];
  const [images] = await Promise.all([Promise.all(codes.map(loadPiece)), loadFonts()]);
  const pieces = new Map(codes.map((code, i) => [code, images[i]!] as const));

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('The browser could not draw the image');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const topSide: PlayerColor = orientation === 'white' ? 'black' : 'white';
  drawPlayerBar(ctx, game, topSide, PAD);
  drawBoard(ctx, fen, lastMove, orientation, pieces);
  drawPlayerBar(ctx, game, orientation, BOARD_TOP + BOARD);

  const footerTop = BOARD_TOP + BOARD + BAR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font(500, 22);
  ctx.fillStyle = '#d4d4d4';
  ctx.fillText(fit(ctx, describeGame(game), BOARD), PAD, footerTop + 24);
  ctx.font = font(400, 16);
  ctx.fillStyle = '#737373';
  ctx.fillText(`Unicity Chess · ${game.endedAt.toISOString().slice(0, 10)} · #${game.gameId}`, PAD, footerTop + 60);

  const blob = await toBlob(canvas, 'image/png');
  if (blob.type !== 'image/png') throw new Error('The browser could not encode the image as PNG');
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error(`The board image is ${Math.round(blob.size / 1000)} KB, over the ${MAX_IMAGE_BYTES / 1000} KB limit`);
  }
  return { mediaType: 'image/png', bytes: new Uint8Array(await blob.arrayBuffer()) };
}
