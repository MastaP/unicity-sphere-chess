export const ESCROW_NAMETAG = '@unichess';
export const ENTRY_FEE = 10;
export const COIN_SYMBOL = 'UCT';
// testnet2 UCT coinId (unicity-ids.testnet2.json). Fallback only — the live
// value normally comes from the wallet via sphere_getBalance.
export const UCT_COIN_ID_FALLBACK =
  'f581d30f593e4b369d684a4563b5246f07b1d265f7178a2c0a82b81f39c24dc0';

export const WALLET_URL = 'https://sphere.unicity.network';

export const TIME_CONTROLS = [3, 5, 10] as const;

export const PROTOCOL_PREFIX = 'unichess';
export const HEARTBEAT_INTERVAL_MS = 5_000;
export const CHALLENGE_TIMEOUT_MS = 300_000;
export const GAME_ID_LENGTH = 8;

export const CLOCK_UPDATE_FPS = 10;
