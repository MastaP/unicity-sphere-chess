import { useState, useEffect } from 'react';
import { useGame } from '../context/GameContext.js';
import { ChallengeDialog } from './ChallengeDialog.js';
import { IncomingChallenge } from './IncomingChallenge.js';
import { Board } from './Board.js';
import { Clock } from './Clock.js';
import { MoveHistory } from './MoveHistory.js';
import { CapturedPieces } from './CapturedPieces.js';
import { GameStatus } from './GameStatus.js';
import { GameOverOverlay } from './GameOverOverlay.js';
import type { UseSphereConnect } from '../hooks/useSphereConnect.js';

interface GameScreenProps {
  connection: UseSphereConnect;
}

export function GameScreen({ connection }: GameScreenProps) {
  const {
    state,
    makeMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    abort,
    claimDisconnectWin,
    startChallenge,
    acceptChallenge,
    declineChallenge,
    incomingChallenge,
    reset,
  } = useGame();

  const myNametag = connection.identity?.nametag ?? 'You';
  const opponentNametag = state.opponent?.nametag ?? 'Opponent';

  // Lobby / idle state
  if (
    state.status === 'idle' ||
    state.status === 'depositing' ||
    state.status === 'challenging' ||
    state.status === 'awaiting-accept'
  ) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-100">Unicity Chess</h1>
          <p className="text-slate-400 text-sm mt-1">Playing as {myNametag}</p>
        </div>

        {incomingChallenge && (
          <IncomingChallenge
            challenge={incomingChallenge}
            onAccept={acceptChallenge}
            onDecline={declineChallenge}
          />
        )}

        <ChallengeDialog
          onChallenge={startChallenge}
          status={state.status}
          opponent={state.opponent?.nametag ?? null}
          onCancel={reset}
        />

        <button
          onClick={connection.disconnect}
          className="text-slate-500 hover:text-slate-300 text-sm transition-colors cursor-pointer"
        >
          Disconnect
        </button>
      </div>
    );
  }

  // Active game
  const isMyTurn = (state.chess.turn() === 'w') === (state.myColor === 'white');
  const isGameOver = state.status === 'ended';
  const canAbort = state.moveHistory.length < 2 && !isGameOver;

  // Disconnect detection: full game duration since last heartbeat/move
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (isGameOver) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isGameOver]);
  const disconnectTimeoutMs = state.timeControlMinutes * 60 * 1000;
  const canClaimDisconnect =
    !isGameOver &&
    state.lastHeartbeatAt > 0 &&
    now - state.lastHeartbeatAt >= disconnectTimeoutMs;

  // Determine which clock/pieces go on top vs bottom based on orientation
  const topColor = state.myColor === 'white' ? 'black' : 'white';
  const bottomColor = state.myColor;

  const topClockMs =
    state.myColor === 'white' ? state.opponentClockMs : state.myClockMs;
  const bottomClockMs =
    state.myColor === 'white' ? state.myClockMs : state.opponentClockMs;
  const topActive =
    (state.chess.turn() === 'w') === (topColor === 'white') && !isGameOver;
  const bottomActive =
    (state.chess.turn() === 'w') === (bottomColor === 'white') && !isGameOver;

  const topLabel = topColor === state.myColor ? myNametag : opponentNametag;
  const bottomLabel = bottomColor === state.myColor ? myNametag : opponentNametag;

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-2 sm:p-4">
      <GameStatus
        isMyTurn={isMyTurn}
        isCheck={state.chess.isCheck()}
        isGameOver={isGameOver}
        result={state.result}
        opponentNametag={opponentNametag}
        lastHeartbeatAt={state.lastHeartbeatAt}
        drawOfferedBy={state.drawOfferedBy}
      />

      <div className="flex flex-col lg:flex-row gap-3 mt-2 w-full max-w-4xl items-start justify-center">
        {/* Board column */}
        <div className="flex flex-col gap-1 items-center">
          {/* Top player info */}
          <div className="flex items-center justify-between w-full max-w-[min(90vw,500px)] px-1">
            <div className="flex items-center gap-2">
              <CapturedPieces chess={state.chess} color={topColor} />
              <span className="text-slate-400 text-sm truncate max-w-32">
                {topLabel}
              </span>
            </div>
            <Clock timeMs={topClockMs} active={topActive} />
          </div>

          {/* Chess board with overlay */}
          <div className="relative">
            <Board
              chess={state.chess}
              myColor={state.myColor}
              onMove={makeMove}
              disabled={!isMyTurn || isGameOver}
              lastMove={
                state.moveHistory.length > 0
                  ? state.moveHistory[state.moveHistory.length - 1]
                  : undefined
              }
            />
            {isGameOver && state.result && (
              <GameOverOverlay
                result={state.result}
                myColor={state.myColor}
                onRematch={() => {
                  const swappedColor =
                    state.myColor === 'white' ? 'black' : 'white';
                  if (state.opponent) {
                    startChallenge(
                      state.opponent.nametag,
                      swappedColor,
                      state.timeControlMinutes,
                    );
                  }
                }}
                onNewGame={reset}
                pgn={state.chess.pgn()}
              />
            )}
          </div>

          {/* Bottom player info */}
          <div className="flex items-center justify-between w-full max-w-[min(90vw,500px)] px-1">
            <div className="flex items-center gap-2">
              <CapturedPieces chess={state.chess} color={bottomColor} />
              <span className="text-slate-300 text-sm font-medium truncate max-w-32">
                {bottomLabel}
              </span>
            </div>
            <Clock timeMs={bottomClockMs} active={bottomActive} />
          </div>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-2 w-full lg:w-64 shrink-0">
          <MoveHistory moves={state.moveHistory} />

          {/* Draw offer banner */}
          {state.drawOfferedBy === 'opponent' && !isGameOver && (
            <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
              <p className="text-amber-300 text-sm mb-2">
                {opponentNametag} offers a draw
              </p>
              <div className="flex gap-2">
                <button
                  onClick={acceptDraw}
                  className="flex-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg cursor-pointer transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={declineDraw}
                  className="flex-1 px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-sm rounded-lg cursor-pointer transition-colors"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!isGameOver && (
            <div className="flex flex-wrap gap-2">
              {canClaimDisconnect && (
                <button
                  onClick={claimDisconnectWin}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg cursor-pointer transition-colors font-medium"
                >
                  Claim win -- opponent disconnected
                </button>
              )}
              {canAbort && (
                <button
                  onClick={abort}
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg cursor-pointer transition-colors"
                >
                  Abort
                </button>
              )}
              {!canAbort && (
                <>
                  <button
                    onClick={resign}
                    className="px-3 py-1.5 bg-red-800/60 hover:bg-red-700/60 text-red-300 text-sm rounded-lg cursor-pointer transition-colors"
                  >
                    Resign
                  </button>
                  {state.drawOfferedBy !== 'me' && (
                    <button
                      onClick={offerDraw}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg cursor-pointer transition-colors"
                    >
                      Offer Draw
                    </button>
                  )}
                  {state.drawOfferedBy === 'me' && (
                    <span className="px-3 py-1.5 text-slate-500 text-sm">
                      Draw offered...
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
