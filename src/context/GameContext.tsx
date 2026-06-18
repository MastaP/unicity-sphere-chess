import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { Chess } from 'chess.js';
import { useChessGame } from '../hooks/useChessGame.js';
import { useGameMessages } from '../hooks/useGameMessages.js';
import { useWager } from '../hooks/useWager.js';
import { generateGameId, buildChallengeUrl } from '../lib/protocol.js';
import { isGameTerminal } from '../lib/chess-helpers.js';
import { ACTION } from '../types/protocol.js';
import type { ParsedMessage, ChallengeColor, GameOverReason } from '../types/protocol.js';
import type { GameState, GameResult, PlayerColor, IncomingChallenge } from '../types/game.js';
import type { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
import { GAME_ID_LENGTH } from '../constants.js';

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
    elo?: number,
  ) => Promise<void>;
  offerRematch: () => Promise<void>;
  acceptChallenge: () => Promise<void>;
  declineChallenge: () => void;
  incomingChallenge: IncomingChallenge | null;
  reset: () => void;
  notice: string | null;
  clearNotice: () => void;
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

// Module-level dedup set — survives React StrictMode remounts
const paidOutGameIds = new Set<string>();

export function GameProvider({ connection, children }: GameProviderProps) {
  const [incomingChallenge, setIncomingChallenge] = useState<IncomingChallenge | null>(() => {
    // Parse challenge from URL query params on initial load
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    const action = params.get('action');
    const color = params.get('color');
    const timeStr = params.get('time');

    const from = params.get('from');
    if (action === 'ch' && gameId && gameId.length === GAME_ID_LENGTH && color && timeStr) {
      const timeMinutes = parseInt(timeStr, 10);
      if ([3, 5, 10].includes(timeMinutes)) {
        const colorMap: Record<string, PlayerColor> = {
          w: 'black',  // challenger plays white, so we play black
          b: 'white',
          r: 'white',
        };
        const myColor = colorMap[color] ?? 'black';

        // Clean up URL params without reload
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        return {
          nametag: from ? `@${from}` : '',
          color: myColor,
          timeMinutes: timeMinutes as 3 | 5 | 10,
          gameId,
        };
      }
    }
    return null;
  });

  const wager = useWager(connection.client);

  const [notice, setNotice] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(null), []);

  // Use refs so heartbeat and message callbacks always see the latest game/messaging
  const gameRef = useRef<ReturnType<typeof useChessGame>>(null!);
  const messagingRef = useRef<ReturnType<typeof useGameMessages>>(null!);
  const challengeResendRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * In-flight bot liveness probe. We send PING (with retries every 3s),
   * wait up to 15s for PONG or DECLINE, and either proceed with the
   * deposit (PONG) or abort (DECLINE / timeout). Kept in a ref so the
   * message dispatch callback can resolve it without re-rendering the
   * provider. The retry interval is stored here too so we can stop
   * re-sending as soon as the bot replies.
   */
  const pendingPingRef = useRef<{
    gameId: string;
    resolve: (result: 'pong' | 'decline' | 'timeout') => void;
    timer: ReturnType<typeof setTimeout>;
    retryInterval: ReturnType<typeof setInterval>;
  } | null>(null);

  const onPollSend = useCallback(
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

  const game = useChessGame(onPollSend, onGameOverDetected);
  gameRef.current = game;

  const handleIncomingMessage = useCallback(
    (msg: ParsedMessage, senderPubkey: string) => {
      const g = gameRef.current;
      if (!g) return;

      // Ignore our own echoed messages — the SDK may deliver sent DMs back to us
      if (senderPubkey === connection.identity?.chainPubkey?.slice(2)) return;

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

      // Handle incoming rematch offer
      if (msg.action === ACTION.REMATCH) {
        const colorMap: Record<ChallengeColor, PlayerColor> = {
          w: 'black',
          b: 'white',
          r: 'white',
        };
        setIncomingChallenge({
          nametag: g.state.opponent?.nametag ?? '',
          color: colorMap[msg.color],
          timeMinutes: msg.timeMinutes as 3 | 5 | 10,
          gameId: msg.newGameId,
          _senderPubkey: senderPubkey,
        } as IncomingChallenge & { _senderPubkey: string });
        return;
      }

      // PONG for an in-flight liveness probe — bot is alive and has a slot.
      if (msg.action === ACTION.PONG) {
        const pending = pendingPingRef.current;
        if (pending && pending.gameId === msg.gameId) {
          clearTimeout(pending.timer);
          clearInterval(pending.retryInterval);
          pendingPingRef.current = null;
          pending.resolve('pong');
        }
        return;
      }

      // Handle accept — transition to playing (only for the current game)
      if (msg.action === ACTION.ACCEPT) {
        if (g.state.gameId && msg.gameId === g.state.gameId) {
          if (challengeResendRef.current) {
            clearInterval(challengeResendRef.current);
            challengeResendRef.current = null;
          }
          g.setStatus('playing');
        }
        return;
      }

      // Handle decline. Two cases:
      //  - Decline arriving during an in-flight PING: bot is at capacity.
      //    Resolve the ping with 'decline' so startChallenge skips the
      //    deposit and shows a notice. No refund needed (we never paid).
      //  - Decline for our current game: bot/peer rejected our (already-
      //    deposited) challenge; refund and reset.
      if (msg.action === ACTION.DECLINE) {
        const pending = pendingPingRef.current;
        if (pending && pending.gameId === msg.gameId) {
          clearTimeout(pending.timer);
          clearInterval(pending.retryInterval);
          pendingPingRef.current = null;
          pending.resolve('decline');
          return;
        }
        if (g.state.gameId && msg.gameId === g.state.gameId) {
          if (connection.identity?.nametag) {
            wager.requestPayout(connection.identity.nametag, 10);
          }
          const opponentLabel = g.state.opponent?.nametag ?? 'opponent';
          setNotice(
            `${opponentLabel} declined the challenge. Your ${10} UCT deposit was refunded.`,
          );
          g.reset();
        }
        return;
      }

      // Implicit accept: if we receive a move for our game while not yet playing,
      // treat it as accept + move (handles missed 'ok' DMs)
      if (msg.action === ACTION.MOVE && g.state.gameId && msg.gameId === g.state.gameId
          && g.state.status !== 'playing' && g.state.status !== 'ended') {
        if (challengeResendRef.current) {
          clearInterval(challengeResendRef.current);
          challengeResendRef.current = null;
        }
        g.setStatus('playing');
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

  const triggerPayout = useCallback(
    (result: GameResult, myColor: PlayerColor) => {
      const myNametag = connection.identity?.nametag;
      if (!myNametag) return;

      // Prevent duplicate payouts for the same game (module-level set survives StrictMode remounts)
      const g = gameRef.current;
      const gameId = g?.state.gameId ?? '';
      if (paidOutGameIds.has(gameId)) return;
      paidOutGameIds.add(gameId);

      // Each client only requests payout for itself.
      // The opponent's client handles their own payout.
      if (result.outcome === 'aborted' || result.outcome === 'draw') {
        // Refund own deposit
        wager.requestPayout(myNametag, 10);
      } else {
        const iWon =
          (result.outcome === 'white-wins' && myColor === 'white') ||
          (result.outcome === 'black-wins' && myColor === 'black');
        if (iWon) {
          // When the opponent is a chess bot, the bot pays the reward directly
          // from its own wallet via a Sphere transfer — skip the self-mint.
          const botElo = g?.state.botElo ?? null;
          if (botElo == null) {
            wager.requestPayout(myNametag, 20);
          }
        }
        // Loser gets nothing — no payout needed
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Trigger payout when game transitions to 'ended' (covers timeout, incoming resign/gameover, etc.)
  const prevStatusRef = useRef(game.state.status);
  useEffect(() => {
    if (prevStatusRef.current !== 'ended' && game.state.status === 'ended' && game.state.result) {
      triggerPayout(game.state.result, game.state.myColor);
    }
    prevStatusRef.current = game.state.status;
  }, [game.state.status, game.state.result, game.state.myColor, triggerPayout]);

  const value: GameContextValue = {
    state: game.state,
    incomingChallenge,
    notice,
    clearNotice,

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

    async startChallenge(opponent, color, timeMinutes, elo?) {
      const gameId = generateGameId();
      const opponentPubkey = '';

      game.initChallenge({
        gameId,
        myColor: color,
        timeMinutes,
        opponentNametag: opponent,
        opponentPubkey,
        botElo: elo ?? null,
      });

      // Bot opponents: liveness probe BEFORE the deposit. A bot stuck in
      // historical-replay or at capacity would otherwise eat the user's
      // deposit and freeze on "Waiting for @...". Skip for human players —
      // they don't auto-pong.
      if (elo != null) {
        game.setStatus('pinging');
        const pingMsg: ParsedMessage = { action: ACTION.PING, gameId };
        try {
          await messaging.sendMessage(opponent, pingMsg);
        } catch (err) {
          console.error('[GameContext] PING send failed', err);
          game.reset();
          setNotice(`Could not reach ${opponent} (network error). Try again.`);
          return;
        }
        const probeResult = await new Promise<'pong' | 'decline' | 'timeout'>((resolve) => {
          // Retry every 3s — Nostr DMs are lossy (~50% drop rate observed
          // from NIP-17 timestamp randomization alone) so a single send
          // can easily go missing against a healthy bot. handlePing is
          // idempotent, so duplicate pings just produce duplicate pongs.
          // The first PONG/DECLINE that arrives clears both timers.
          const retryInterval = setInterval(() => {
            messaging.sendMessage(opponent, pingMsg).catch(() => {
              /* retry failure is fine — keep trying */
            });
          }, 3_000);
          const timer = setTimeout(() => {
            if (pendingPingRef.current?.gameId === gameId) {
              clearInterval(pendingPingRef.current.retryInterval);
              pendingPingRef.current = null;
              resolve('timeout');
            }
          }, 15_000);
          pendingPingRef.current = { gameId, resolve, timer, retryInterval };
        });
        if (probeResult !== 'pong') {
          game.reset();
          if (probeResult === 'decline') {
            setNotice(
              `${opponent} is at capacity right now. Try again in a minute — no deposit was made.`,
            );
          } else {
            setNotice(
              `${opponent} did not respond within 15s. Try again later — no deposit was made.`,
            );
          }
          return;
        }
      }

      console.log('[GameContext] startChallenge: depositing...');
      game.setStatus('depositing');
      const depositOk = await wager.deposit(gameId);
      console.log('[GameContext] startChallenge: deposit result =', depositOk);
      if (!depositOk) {
        game.reset();
        throw new Error('Deposit failed');
      }
      game.markDepositDone('me');
      game.setStatus('challenging');

      const challengeColor: ChallengeColor =
        color === 'white' ? 'w' : 'b';
      const baseUrl = `${window.location.origin}${window.location.pathname}`;
      const myNametag = connection.identity?.nametag ?? '';
      const gameUrl = buildChallengeUrl(baseUrl, gameId, challengeColor, timeMinutes, myNametag);

      const msg: ParsedMessage = {
        action: ACTION.CHALLENGE,
        gameId,
        color: challengeColor,
        timeMinutes,
        gameUrl,
        ...(elo != null ? { elo } : {}),
      };
      console.log('[GameContext] startChallenge: sending challenge DM...');
      await messaging.sendMessage(opponent, msg);
      console.log('[GameContext] startChallenge: challenge sent, awaiting accept');
      game.setStatus('awaiting-accept');

      // For bot challenges, resend every 5s until accepted or cancelled
      if (elo != null) {
        if (challengeResendRef.current) clearInterval(challengeResendRef.current);
        challengeResendRef.current = setInterval(() => {
          const g = gameRef.current;
          if (!g || g.state.status !== 'awaiting-accept' || g.state.gameId !== gameId) {
            if (challengeResendRef.current) {
              clearInterval(challengeResendRef.current);
              challengeResendRef.current = null;
            }
            return;
          }
          console.log('[GameContext] Resending bot challenge...');
          messagingRef.current?.sendMessage(opponent, msg).catch(() => {});
        }, 5000);
      }
    },

    async offerRematch() {
      const opponent = game.state.opponent;
      if (!opponent) return;

      const swappedColor: PlayerColor =
        game.state.myColor === 'white' ? 'black' : 'white';
      const newGameId = generateGameId();
      const timeMinutes = game.state.timeControlMinutes;

      // Deposit for the new game
      const depositOk = await wager.deposit(newGameId);
      if (!depositOk) {
        throw new Error('Deposit failed');
      }

      const challengeColor: ChallengeColor =
        swappedColor === 'white' ? 'w' : 'b';

      const msg: ParsedMessage = {
        action: ACTION.REMATCH,
        gameId: game.state.gameId,
        newGameId,
        color: challengeColor,
        timeMinutes,
      };
      await messaging.sendMessage(opponent.nametag, msg);

      // Init the new game locally and wait for accept (preserve bot ELO across rematches)
      game.initChallenge({
        gameId: newGameId,
        myColor: swappedColor,
        timeMinutes: timeMinutes as 3 | 5 | 10,
        opponentNametag: opponent.nametag,
        opponentPubkey: opponent.pubkey,
        botElo: game.state.botElo,
      });
      game.markDepositDone('me');
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
        botElo: null,
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
      // Reset to lobby so both players return to the new game screen
      game.reset();
    },

    resign() {
      const msg = game.resign();
      if (game.state.opponent) {
        messaging.sendMessage(game.state.opponent.nametag, msg);
      }
    },

    offerDraw() {
      const msg = game.offerDraw();
      if (msg && game.state.opponent) {
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
      if (challengeResendRef.current) {
        clearInterval(challengeResendRef.current);
        challengeResendRef.current = null;
      }
      // If we're waiting for accept, notify opponent that we cancelled
      if (game.state.gameId && game.state.opponent?.nametag &&
          (game.state.status === 'awaiting-accept' || game.state.status === 'challenging')) {
        const msg: ParsedMessage = {
          action: ACTION.ABORT,
          gameId: game.state.gameId,
        };
        messaging.sendMessage(game.state.opponent.nametag, msg).catch(() => {});
      }
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
