import { useReducer, useCallback, useRef, useEffect } from 'react';
import { Chess } from 'chess.js';
import type { GameState, GameResult, MoveRecord, PlayerColor } from '../types/game';
import type { ParsedMessage } from '../types/protocol';
import { ACTION } from '../types/protocol';
import { isGameTerminal } from '../lib/chess-helpers';
import { HEARTBEAT_INTERVAL_MS } from '../constants';

type GameAction =
  | { type: 'INIT_CHALLENGE'; gameId: string; myColor: PlayerColor; timeMinutes: 3 | 5 | 10; opponentNametag: string; opponentPubkey: string }
  | { type: 'SET_STATUS'; status: GameState['status'] }
  | { type: 'DEPOSIT_DONE'; who: 'me' | 'opponent' }
  | { type: 'APPLY_MOVE'; san: string; clockMs: number; isMyMove: boolean }
  | { type: 'SET_CLOCK'; who: 'me' | 'opponent'; clockMs: number }
  | { type: 'HEARTBEAT_RECEIVED'; clockMs: number }
  | { type: 'DRAW_OFFERED'; by: 'me' | 'opponent' }
  | { type: 'DRAW_CLEARED' }
  | { type: 'GAME_OVER'; result: GameResult }
  | { type: 'RESET' };

function createInitialState(): GameState {
  return {
    gameId: '',
    status: 'idle',
    myColor: 'white',
    chess: new Chess(),
    moveHistory: [],
    myClockMs: 0,
    opponentClockMs: 0,
    timeControlMinutes: 5,
    result: null,
    opponent: { nametag: '', pubkey: '' },
    drawOfferedBy: null,
    lastHeartbeatAt: 0,
    myDepositDone: false,
    opponentDepositDone: false,
  };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'INIT_CHALLENGE': {
      const timeMs = action.timeMinutes * 60 * 1000;
      return {
        ...createInitialState(),
        gameId: action.gameId,
        status: 'depositing',
        myColor: action.myColor,
        timeControlMinutes: action.timeMinutes,
        myClockMs: timeMs,
        opponentClockMs: timeMs,
        opponent: { nametag: action.opponentNametag, pubkey: action.opponentPubkey },
      };
    }

    case 'SET_STATUS':
      return { ...state, status: action.status };

    case 'DEPOSIT_DONE':
      if (action.who === 'me') {
        return { ...state, myDepositDone: true };
      }
      return { ...state, opponentDepositDone: true };

    case 'APPLY_MOVE': {
      const chess = new Chess(state.chess.fen());
      const moveResult = chess.move(action.san);
      if (!moveResult) return state;

      const record: MoveRecord = {
        san: action.san,
        clockMs: action.clockMs,
        timestamp: Date.now(),
      };

      if (action.isMyMove) {
        return {
          ...state,
          chess,
          moveHistory: [...state.moveHistory, record],
          myClockMs: action.clockMs,
          lastHeartbeatAt: Date.now(),
        };
      }

      const clampedClock = Math.min(action.clockMs, state.opponentClockMs);
      return {
        ...state,
        chess,
        moveHistory: [...state.moveHistory, record],
        opponentClockMs: clampedClock,
        lastHeartbeatAt: Date.now(),
      };
    }

    case 'SET_CLOCK':
      if (action.who === 'me') {
        return { ...state, myClockMs: action.clockMs };
      }
      return { ...state, opponentClockMs: action.clockMs };

    case 'HEARTBEAT_RECEIVED': {
      const clampedClock = Math.min(action.clockMs, state.opponentClockMs);
      return {
        ...state,
        opponentClockMs: clampedClock,
        lastHeartbeatAt: Date.now(),
      };
    }

    case 'DRAW_OFFERED':
      return { ...state, drawOfferedBy: action.by };

    case 'DRAW_CLEARED':
      return { ...state, drawOfferedBy: null };

    case 'GAME_OVER':
      return { ...state, status: 'ended', result: action.result };

    case 'RESET':
      return createInitialState();

    default:
      return state;
  }
}

export interface UseChessGame {
  state: GameState;
  initChallenge: (params: {
    gameId: string;
    myColor: PlayerColor;
    timeMinutes: 3 | 5 | 10;
    opponentNametag: string;
    opponentPubkey: string;
  }) => void;
  setStatus: (status: GameState['status']) => void;
  markDepositDone: (who: 'me' | 'opponent') => void;
  makeMove: (san: string) => ParsedMessage | null;
  handleIncomingMessage: (msg: ParsedMessage) => void;
  resign: () => ParsedMessage;
  offerDraw: () => ParsedMessage | null;
  acceptDraw: () => ParsedMessage;
  declineDraw: () => ParsedMessage;
  abort: () => ParsedMessage;
  claimDisconnectWin: () => ParsedMessage;
  reset: () => void;
}

export function useChessGame(
  onSendHeartbeat?: (msg: ParsedMessage) => void,
  onGameOverDetected?: (result: GameResult, msg: ParsedMessage) => void,
): UseChessGame {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  const stateRef = useRef(state);
  stateRef.current = state;

  const clockRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatCallbackRef = useRef(onSendHeartbeat);
  heartbeatCallbackRef.current = onSendHeartbeat;
  const gameOverCallbackRef = useRef(onGameOverDetected);
  gameOverCallbackRef.current = onGameOverDetected;

  const isMyTurn = useCallback((): boolean => {
    const s = stateRef.current;
    const turn = s.chess.turn();
    return (turn === 'w' && s.myColor === 'white') || (turn === 'b' && s.myColor === 'black');
  }, []);

  // Clock tick via requestAnimationFrame
  useEffect(() => {
    const tick = (now: number) => {
      const s = stateRef.current;
      if (s.status !== 'playing') {
        clockRef.current = null;
        return;
      }

      if (lastTickRef.current > 0) {
        const delta = now - lastTickRef.current;
        const myTurn = isMyTurn();

        if (myTurn) {
          const newClock = Math.round(Math.max(0, s.myClockMs - delta));
          dispatch({ type: 'SET_CLOCK', who: 'me', clockMs: newClock });

          if (newClock <= 0) {
            const result: GameResult = {
              outcome: s.myColor === 'white' ? 'black-wins' : 'white-wins',
              reason: 'timeout',
            };
            dispatch({ type: 'GAME_OVER', result });
            const goMsg: ParsedMessage = {
              action: ACTION.GAMEOVER,
              gameId: s.gameId,
              result: s.myColor === 'white' ? 'b' : 'w',
              reason: 'timeout',
            };
            gameOverCallbackRef.current?.(result, goMsg);
            clockRef.current = null;
            return;
          }
        } else {
          const newClock = Math.round(Math.max(0, s.opponentClockMs - delta));
          dispatch({ type: 'SET_CLOCK', who: 'opponent', clockMs: newClock });

          if (newClock <= 0) {
            const result: GameResult = {
              outcome: s.myColor === 'white' ? 'white-wins' : 'black-wins',
              reason: 'timeout',
            };
            dispatch({ type: 'GAME_OVER', result });
            const goMsg: ParsedMessage = {
              action: ACTION.GAMEOVER,
              gameId: s.gameId,
              result: s.myColor === 'white' ? 'w' : 'b',
              reason: 'timeout',
            };
            gameOverCallbackRef.current?.(result, goMsg);
            clockRef.current = null;
            return;
          }
        }
      }

      lastTickRef.current = now;
      clockRef.current = requestAnimationFrame(tick);
    };

    if (state.status === 'playing') {
      lastTickRef.current = 0;
      clockRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (clockRef.current !== null) {
        cancelAnimationFrame(clockRef.current);
        clockRef.current = null;
      }
      lastTickRef.current = 0;
    };
  }, [state.status, isMyTurn]);

  // Heartbeat interval: send when it's NOT my turn
  useEffect(() => {
    if (state.status !== 'playing') {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    heartbeatRef.current = setInterval(() => {
      const s = stateRef.current;
      if (s.status !== 'playing') return;

      const myTurn = isMyTurn();
      if (!myTurn && heartbeatCallbackRef.current) {
        const msg: ParsedMessage = {
          action: ACTION.HEARTBEAT,
          gameId: s.gameId,
          clockMs: Math.round(s.myClockMs),
        };
        heartbeatCallbackRef.current(msg);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [state.status, isMyTurn]);

  const initChallenge = useCallback(
    (params: {
      gameId: string;
      myColor: PlayerColor;
      timeMinutes: 3 | 5 | 10;
      opponentNametag: string;
      opponentPubkey: string;
    }) => {
      dispatch({
        type: 'INIT_CHALLENGE',
        ...params,
      });
    },
    [],
  );

  const setStatus = useCallback((status: GameState['status']) => {
    dispatch({ type: 'SET_STATUS', status });
  }, []);

  const markDepositDone = useCallback((who: 'me' | 'opponent') => {
    dispatch({ type: 'DEPOSIT_DONE', who });
  }, []);

  const makeMove = useCallback(
    (san: string): ParsedMessage | null => {
      const s = stateRef.current;
      if (s.status !== 'playing') return null;
      if (!isMyTurn()) return null;

      const testChess = new Chess(s.chess.fen());
      const moveResult = testChess.move(san);
      if (!moveResult) return null;

      const clockMs = Math.round(s.myClockMs);
      dispatch({ type: 'APPLY_MOVE', san, clockMs, isMyMove: true });

      const msg: ParsedMessage = {
        action: ACTION.MOVE,
        gameId: s.gameId,
        san,
        clockMs,
      };

      // Check for terminal position after move
      const terminal = isGameTerminal(testChess);
      if (terminal) {
        dispatch({ type: 'GAME_OVER', result: terminal });
      }

      return msg;
    },
    [isMyTurn],
  );

  const handleIncomingMessage = useCallback(
    (msg: ParsedMessage) => {
      const s = stateRef.current;

      switch (msg.action) {
        case ACTION.MOVE: {
          if (s.status !== 'playing') return;
          if (isMyTurn()) return;

          const testChess = new Chess(s.chess.fen());
          const moveResult = testChess.move(msg.san);
          if (!moveResult) return;

          dispatch({
            type: 'APPLY_MOVE',
            san: msg.san,
            clockMs: msg.clockMs,
            isMyMove: false,
          });

          const terminal = isGameTerminal(testChess);
          if (terminal) {
            dispatch({ type: 'GAME_OVER', result: terminal });
          }
          break;
        }

        case ACTION.HEARTBEAT:
          dispatch({ type: 'HEARTBEAT_RECEIVED', clockMs: msg.clockMs });
          break;

        case ACTION.RESIGN: {
          const result: GameResult = {
            outcome: s.myColor === 'white' ? 'white-wins' : 'black-wins',
            reason: 'resign',
          };
          dispatch({ type: 'GAME_OVER', result });
          break;
        }

        case ACTION.DRAW_OFFER:
          dispatch({ type: 'DRAW_OFFERED', by: 'opponent' });
          break;

        case ACTION.DRAW_ACCEPT: {
          dispatch({ type: 'GAME_OVER', result: { outcome: 'draw', reason: 'agreement' } });
          break;
        }

        case ACTION.DRAW_DECLINE:
          dispatch({ type: 'DRAW_CLEARED' });
          break;

        case ACTION.ABORT:
          dispatch({ type: 'GAME_OVER', result: { outcome: 'aborted', reason: 'abort' } });
          break;

        case ACTION.GAMEOVER: {
          let outcome: GameResult['outcome'];
          if (msg.result === 'w') outcome = 'white-wins';
          else if (msg.result === 'b') outcome = 'black-wins';
          else outcome = 'draw';
          dispatch({ type: 'GAME_OVER', result: { outcome, reason: msg.reason } });
          break;
        }

        default:
          break;
      }
    },
    [isMyTurn],
  );

  const resign = useCallback((): ParsedMessage => {
    const s = stateRef.current;
    const result: GameResult = {
      outcome: s.myColor === 'white' ? 'black-wins' : 'white-wins',
      reason: 'resign',
    };
    dispatch({ type: 'GAME_OVER', result });
    return { action: ACTION.RESIGN, gameId: s.gameId };
  }, []);

  const offerDraw = useCallback((): ParsedMessage | null => {
    if (stateRef.current.drawOfferedBy === 'me') return null;
    dispatch({ type: 'DRAW_OFFERED', by: 'me' });
    return { action: ACTION.DRAW_OFFER, gameId: stateRef.current.gameId };
  }, []);

  const acceptDraw = useCallback((): ParsedMessage => {
    dispatch({ type: 'GAME_OVER', result: { outcome: 'draw', reason: 'agreement' } });
    return { action: ACTION.DRAW_ACCEPT, gameId: stateRef.current.gameId };
  }, []);

  const declineDraw = useCallback((): ParsedMessage => {
    dispatch({ type: 'DRAW_CLEARED' });
    return { action: ACTION.DRAW_DECLINE, gameId: stateRef.current.gameId };
  }, []);

  const abort = useCallback((): ParsedMessage => {
    dispatch({ type: 'GAME_OVER', result: { outcome: 'aborted', reason: 'abort' } });
    return { action: ACTION.ABORT, gameId: stateRef.current.gameId };
  }, []);

  const claimDisconnectWin = useCallback((): ParsedMessage => {
    const s = stateRef.current;
    const result: GameResult = {
      outcome: s.myColor === 'white' ? 'white-wins' : 'black-wins',
      reason: 'disconnect',
    };
    dispatch({ type: 'GAME_OVER', result });
    return {
      action: ACTION.GAMEOVER,
      gameId: s.gameId,
      result: s.myColor === 'white' ? 'w' : 'b',
      reason: 'disconnect',
    };
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return {
    state,
    initChallenge,
    setStatus,
    markDepositDone,
    makeMove,
    handleIncomingMessage,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    abort,
    claimDisconnectWin,
    reset,
  };
}
