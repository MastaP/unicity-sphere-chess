import { useEffect, useRef } from 'react';
import type { MoveRecord } from '../types/game.js';

interface MoveHistoryProps {
  moves: MoveRecord[];
}

export function MoveHistory({ moves }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new move
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [moves.length]);

  if (moves.length === 0) {
    return (
      <div className="bg-neutral-900 border border-white/10 rounded-2xl p-3 h-48">
        <p className="text-neutral-500 text-sm text-center mt-8">
          No moves yet
        </p>
      </div>
    );
  }

  // Group moves into pairs (white move, black move)
  const rows: { num: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const whiteMove = moves[i];
    if (!whiteMove) break;
    rows.push({
      num: Math.floor(i / 2) + 1,
      white: whiteMove.san,
      black: moves[i + 1]?.san,
    });
  }

  return (
    <div
      ref={scrollRef}
      className="bg-neutral-900 border border-white/10 rounded-2xl p-2 h-48 overflow-y-auto"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="text-neutral-500 text-xs">
            <th className="w-8 text-left font-normal">#</th>
            <th className="text-left font-normal">White</th>
            <th className="text-left font-normal">Black</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.num} className="hover:bg-white/5 rounded">
              <td className="text-neutral-600 py-0.5">{row.num}.</td>
              <td className="text-neutral-200 py-0.5 font-mono">{row.white}</td>
              <td className="text-neutral-200 py-0.5 font-mono">
                {row.black ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
