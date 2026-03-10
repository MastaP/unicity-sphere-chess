import { useState, useEffect, useRef } from 'react';

interface ClockProps {
  timeMs: number;
  active: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, ms / 1000);

  if (totalSeconds < 10) {
    return totalSeconds.toFixed(1);
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function Clock({ timeMs, active }: ClockProps) {
  const [displayMs, setDisplayMs] = useState(timeMs);
  const lastTickRef = useRef(Date.now());

  // Sync display when prop changes externally
  useEffect(() => {
    setDisplayMs(timeMs);
    lastTickRef.current = Date.now();
  }, [timeMs]);

  // Countdown when active
  useEffect(() => {
    if (!active) return;

    lastTickRef.current = Date.now();

    const frame = () => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      setDisplayMs((prev) => Math.max(0, prev - delta));
      rafId = requestAnimationFrame(frame);
    };

    let rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [active]);

  const isLow = displayMs < 30_000;
  const isCritical = displayMs < 10_000;

  return (
    <div
      className={`
        font-mono text-lg px-3 py-1 rounded-lg min-w-20 text-center tabular-nums
        transition-colors
        ${active
          ? isCritical
            ? 'bg-red-600 text-white animate-pulse'
            : isLow
              ? 'bg-amber-600 text-white animate-pulse'
              : 'bg-slate-100 text-slate-900'
          : 'bg-slate-700 text-slate-400'
        }
      `}
    >
      {formatTime(displayMs)}
    </div>
  );
}
