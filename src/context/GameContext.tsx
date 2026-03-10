import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { useChessGame } from '../hooks/useChessGame.js';
import { useGameMessages } from '../hooks/useGameMessages.js';
import { useWager } from '../hooks/useWager.js';
import { generateGameId } from '../lib/protocol.js';
import { isGameTerminal } from '../lib/chess-helpers.js';
import { ACTION } from '../types/protocol.js';
import type { ParsedMessage, ChallengeColor, GameOverReason } from '../types/protocol.js';
import type { GameState, GameResult, PlayerColor, IncomingChallenge } from '../types/game.js';
import type { ConnectClient } from '@unicitylabs/sphere-sdk/connect';

export interface GameContextValue {
  state: GameState;
  makeMove: (from: string, to: string, promotion?: string) => boolean;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  abort: () => void;
  claimDisconnectWin: () => void;
  startChallenge: (
    opponent: string,
    color: PlayerColor,
    timeMinutes: 3 | 5 | 10,
  ) => Promise<void>;
  acceptChallenge: () => Promise<void>;
  declineChallenge: () => void;
  incomingChallenge: IncomingChallenge | null;
  reset: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}

interface GameProviderProps {
  connection: {
    client: ConnectClient | null;
    identity: { nametag?: string; chainPubkey: string } | null;
  };
  children: ReactNode;
}

export function GameProvider({ connection, children }: GameProviderProps) {
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(null);

  const wager = useWager(connection.client);

  // Use refs so heartbeat and message callbacks always see the latest game/messaging
  const gameRef = useRef<ReturnType<typeof useChessGame>>(null!);
  const messagingRef = useRef<ReturnType<typeof useGameMessages>>(null!);

  const onSendHeartbeat = useCallback(
    (msg: ParsedMessage) => {
      const g = gameRef.current;
      const m = messagingRef.current;
      if (g && m && g.state.opponent) {
        m.sendMessage(g.state.opponent.nametag, msg);
      }
    },
    [],
  );

  const onGameOverDetected = useCallback(
    (_result: GameResult, goMsg: ParsedMessage) => {
      const g = gameRef.current;
      const m = messagingRef.current;
      if (g && m && g.state.opponent) {
        m.sendMessage(g.state.opponent.nametag, goMsg);
      }
    },
    [],
  );

  const game = useChessGame(onSendHeartbeat, onGameOverDetected);
  gameRef.current = game;

  const handleIncomingMessage = useCallback(
    (msg: ParsedMessage, senderPubkey: string) => {
      const g = gameRef.current;
      if (!g) return;

      // Handle incoming challenges separately
      if (msg.action === ACTION.CHALLENGE) {
        const colorMap: Record<ChallengeColor, PlayerColor> = {
          w: 'black',  // challenger plays white, so we play black
          b: 'white',  // challenger plays black, so we play white
          r: 'white',  // random, default to white for MVP
        };
        setIncomingChallenge({
          nametag: '', // Will be enriched by the pubkey lookup
          color: colorMap[msg.color],
          timeMinutes: msg.timeMinutes as 3 | 5 | 10,
          gameId: msg.gameId,
          _senderPubkey: senderPubkey,
          _challengerColor: msg.color === 'w' ? 'white' : msg.color === 'b' ? 'black' : 'white',
        } as IncomingChallenge & { _senderPubkey: string; _challengerColor: PlayerColor });
        return;
      }

      // Handle accept — transition to playing (only for the current game)
      if (msg.action === ACTION.ACCEPT) {
        if (g.state.gameId && msg.gameId === g.state.gameId) {
          g.setStatus('playing');
        }
        return;
      }

      // Handle decline (only for the current game)
      if (msg.action === ACTION.DECLINE) {
        if (g.state.gameId && msg.gameId === g.state.gameId) {
          // Refund deposit
          if (connection.identity?.nametag) {
            wager.requestPayout(connection.identity.nametag, 10);
          }
          g.reset();
        }
        return;
      }

      // All other messages routed to game handler
      g.handleIncomingMessage(msg);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const messaging = useGameMessages(
    connection.client,
    game.state.gameId || null,
    handleIncomingMessage,
  );
  messagingRef.current = messaging;

  // Track whether we've already triggered payout for this game to avoid double-paying
  const payoutTriggeredRef = useRef<string | null>(null);

  const triggerPayout = useCallback(
    (result: GameResult, myColor: PlayerColor, opponentNametag: string) => {
      const myNametag = connection.identity?.nametag;
      if (!myNametag) return;

      // Prevent duplicate payouts for the same game
      const g = gameRef.current;
      const gameId = g?.state.gameId ?? '';
      if (payoutTriggeredRef.current === gameId) return;
      payoutTriggeredRef.current = gameId;

      if (result.outcome === 'aborted') {
        wager.requestPayout(myNametag, 10);
        wager.requestPayout(opponentNametag, 10);
      } else if (result.outcome === 'draw') {
        wager.requestPayout(myNametag, 10);
        wager.requestPayout(opponentNametag, 10);
      } else {
        const iWon =
          (result.outcome === 'white-wins' && myColor === 'white') ||
          (result.outcome === 'black-wins' && myColor === 'black');
        wager.requestPayout(iWon ? myNametag : opponentNametag, 20);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Trigger payout when game transitions to 'ended' (covers timeout, incoming resign/gameover, etc.)
  const prevStatusRef = useRef(game.state.status);
  useEffect(() => {
    if (prevStatusRef.current !== 'ended' && game.state.status === 'ended' && game.state.result) {
      const opponent = game.state.opponent;
      if (opponent) {
        triggerPayout(game.state.result, game.state.myColor, opponent.nametag);
      }
    }
    prevStatusRef.current = game.state.status;
  }, [game.state.status, game.state.result, game.state.opponent, game.state.myColor, triggerPayout]);

  const value: GameContextValue = {
    state: game.state,
    incomingChallenge,

    makeMove(from: string, to: string, promotion?: string) {
      // Convert from/to into SAN using chess.js
      const chess = game.state.chess;
      const moves = chess.moves({ verbose: true });
      const match = moves.find(
        (m) =>
          m.from === from &&
          m.to === to &&
          (!promotion || m.promotion === promotion),
      );
      if (!match) return false;

      const msg = game.makeMove(match.san);
      if (!msg) return false;

      const opponent = game.state.opponent;
      if (opponent) {
        messaging.sendMessage(opponent.nametag, msg);
      }

      // Check for game-over by inspecting the post-move position directly,
      // rather than reading game.state which hasn't re-rendered yet.
      const postMoveChess = new Chess(chess.fen());
      postMoveChess.move(match.san);
      const terminal = isGameTerminal(postMoveChess);
      if (terminal && opponent) {
        const goMsg: ParsedMessage = {
          action: ACTION.GAMEOVER,
          gameId: game.state.gameId,
          result:
            terminal.outcome === 'white-wins'
              ? 'w'
              : terminal.outcome === 'black-wins'
                ? 'b'
                : 'd',
          reason: terminal.reason as GameOverReason,
        };
        messaging.sendMessage(opponent.nametag, goMsg);
        // Payout is triggered by the useEffect watching game.state.status -> 'ended'
      }

      return true;
    },

    async startChallenge(opponent, color, timeMinutes) {
      const gameId = generateGameId();
      const opponentPubkey = ''; // Will be resolved by messaging layer

      game.initChallenge({
        gameId,
        myColor: color,
        timeMinutes,
        opponentNametag: opponent,
        opponentPubkey,
      });

      const depositOk = await wager.deposit(gameId);
      if (!depositOk) {
        game.reset();
        throw new Error('Deposit failed');
      }
      game.markDepositDone('me');

      const challengeColor: ChallengeColor =
        color === 'white' ? 'w' : 'b';
      const gameUrl = `${window.location.origin}${window.location.pathname}?game=${gameId}`;

      const msg: ParsedMessage = {
        action: ACTION.CHALLENGE,
        gameId,
        color: challengeColor,
        timeMinutes,
        gameUrl,
      };
      await messaging.sendMessage(opponent, msg);
      game.setStatus('awaiting-accept');
    },

    async acceptChallenge() {
      if (!incomingChallenge) return;
      const challenge = incomingChallenge as IncomingChallenge & {
        _senderPubkey?: string;
        _challengerColor?: PlayerColor;
      };

      game.initChallenge({
        gameId: challenge.gameId,
        myColor: challenge.color,
        timeMinutes: challenge.timeMinutes,
        opponentNametag: challenge.nametag,
        opponentPubkey: challenge._senderPubkey ?? '',
      });

      const depositOk = await wager.deposit(challenge.gameId);
      if (!depositOk) {
        game.reset();
        throw new Error('Deposit failed');
      }
      game.markDepositDone('me');

      const msg: ParsedMessage = {
        action: ACTION.ACCEPT,
        gameId: challenge.gameId,
      };
      await messaging.sendMessage(challenge.nametag, msg);

      game.setStatus('playing');
      setIncomingChallenge(null);
    },

    declineChallenge() {
      if (!incomingChallenge) return;
      const msg: ParsedMessage = {
        action: ACTION.DECLINE,
        gameId: incomingChallenge.gameId,
      };
      messaging.sendMessage(incomingChallenge.nametag, msg);
      setIncomingChallenge(null);
    },

    resign() {
      const msg = game.resign();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    offerDraw() {
      const msg = game.offerDraw();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    acceptDraw() {
      const msg = game.acceptDraw();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    declineDraw() {
      const msg = game.declineDraw();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    abort() {
      const msg = game.abort();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    claimDisconnectWin() {
      const msg = game.claimDisconnectWin();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    reset() {
      game.reset();
      setIncomingChallenge(null);
    },
  };

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  );
}
