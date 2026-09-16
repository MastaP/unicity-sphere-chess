import { describe, expect, it } from 'vitest';
import { boardLayout } from './boardLayout';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function at(layout: ReturnType<typeof boardLayout>, square: string) {
  const cell = layout.find((c) => c.square === square);
  if (!cell) throw new Error(`no ${square}`);
  return cell;
}

describe('boardLayout', () => {
  it('has all 64 squares', () => {
    expect(boardLayout(START, 'white')).toHaveLength(64);
  });

  it('puts a8 top-left and h1 bottom-right from White’s side', () => {
    const layout = boardLayout(START, 'white');
    expect(at(layout, 'a8')).toMatchObject({ col: 0, row: 0 });
    expect(at(layout, 'h1')).toMatchObject({ col: 7, row: 7 });
    expect(at(layout, 'e1')).toMatchObject({ col: 4, row: 7, piece: 'wK' });
  });

  it('puts h1 top-left and a8 bottom-right from Black’s side', () => {
    const layout = boardLayout(START, 'black');
    expect(at(layout, 'h1')).toMatchObject({ col: 0, row: 0 });
    expect(at(layout, 'a8')).toMatchObject({ col: 7, row: 7 });
    expect(at(layout, 'e1')).toMatchObject({ col: 3, row: 0, piece: 'wK' });
    expect(at(layout, 'd8')).toMatchObject({ col: 4, row: 7, piece: 'bQ' });
  });

  it('colours a1 dark and h1 light', () => {
    const layout = boardLayout(START, 'white');
    expect(at(layout, 'a1').light).toBe(false);
    expect(at(layout, 'h1').light).toBe(true);
  });

  it('places pieces from the FEN and leaves empty squares empty', () => {
    const layout = boardLayout('r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', 'white');
    expect(at(layout, 'f7').piece).toBe('wQ');
    expect(at(layout, 'c6').piece).toBe('bN');
    expect(at(layout, 'd1').piece).toBeNull();
    expect(at(layout, 'h5').piece).toBeNull();
  });
});
