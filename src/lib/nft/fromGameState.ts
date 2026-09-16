import type { GameState } from '../../types/game';
import { BOT_OPPONENTS } from '../bot-opponents';
import { playerLabel, type FinishedGame } from './gameRecord';

/** Every bot persona shares one nametag, so a bot is named by the persona its ELO selects. */
function botLabel(elo: number): string {
  const bot = BOT_OPPONENTS.find((b) => b.elo === elo);
  return bot ? `${bot.name} (bot)` : 'Chess bot';
}

/** The record of an ended game, from this player's side of it; null while it has no result. */
export function finishedGameFrom(
  state: GameState,
  me: { nametag?: string; chainPubkey: string } | null,
  endedAt: Date,
): FinishedGame | null {
  if (!state.result) return null;
  const myLabel = playerLabel(me?.nametag, me?.chainPubkey ?? '');
  const opponentLabel =
    state.botElo != null ? botLabel(state.botElo) : playerLabel(state.opponent?.nametag, state.opponent?.pubkey ?? '');
  return {
    gameId: state.gameId,
    moves: state.moveHistory.map((m) => m.san),
    result: state.result,
    timeControlMinutes: state.timeControlMinutes,
    white: state.myColor === 'white' ? myLabel : opponentLabel,
    black: state.myColor === 'white' ? opponentLabel : myLabel,
    botElo: state.botElo,
    endedAt,
  };
}
