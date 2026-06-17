/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Nametag of the chess bot service. Defaults to `chess-bot` when unset. */
  readonly VITE_CHESS_BOT_NAMETAG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
