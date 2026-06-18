import { useState, useCallback } from 'react';
import type { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import {
  ESCROW_NAMETAG,
  ENTRY_FEE,
  COIN_SYMBOL,
  UCT_COIN_ID_FALLBACK,
} from '../constants';

export interface UseWager {
  deposit: (gameId: string) => Promise<boolean>;
  requestPayout: (amount: number) => Promise<boolean>;
  getBalance: () => Promise<number>;
  uctCoinId: string | null;
}

export function useWager(client: ConnectClient | null): UseWager {
  const [uctCoinId, setUctCoinId] = useState<string | null>(null);

  const resolveUctCoinId = useCallback(async (): Promise<string> => {
    if (uctCoinId) return uctCoinId;
    if (!client) return UCT_COIN_ID_FALLBACK;

    try {
      const assets = await client.query<
        Array<{ coinId: string; symbol: string; totalAmount: string; decimals: number }>
      >('sphere_getBalance');

      if (Array.isArray(assets)) {
        const uct = assets.find((a) => a.symbol === COIN_SYMBOL);
        if (uct?.coinId) {
          setUctCoinId(uct.coinId);
          return uct.coinId;
        }
      }
    } catch {
      // fallback
    }

    setUctCoinId(UCT_COIN_ID_FALLBACK);
    return UCT_COIN_ID_FALLBACK;
  }, [client, uctCoinId]);

  const deposit = useCallback(
    async (gameId: string): Promise<boolean> => {
      if (!client) return false;

      try {
        const coinId = await resolveUctCoinId();
        console.log('[useWager] deposit: sending', { to: ESCROW_NAMETAG, amount: ENTRY_FEE, coinId, memo: `unichess:${gameId}` });
        const result = await client.intent(INTENT_ACTIONS.SEND, {
          to: ESCROW_NAMETAG,
          amount: ENTRY_FEE,
          coinId,
          memo: `unichess:${gameId}`,
        });
        console.log('[useWager] deposit: success', result);
        return true;
      } catch (err) {
        console.error('[useWager] deposit: failed', err);
        return false;
      }
    },
    [client, resolveUctCoinId],
  );

  // testnet2 has no faucet. Rewards (20 UCT to a winner) and refunds (10 UCT on
  // draw/abort/decline) are self-minted into the *connected* wallet via a MINT
  // intent — the wallet prompts the user to approve, then mints test UCT to
  // itself. Each client only ever pays itself, so the mint always targets the
  // connected wallet (no recipient param). The `amount` is the whole-UCT value;
  // the wallet renders/handles the decimals (same convention as the SEND intent).
  const requestPayout = useCallback(
    async (amount: number): Promise<boolean> => {
      if (!client) return false;
      if (amount <= 0) return false;

      try {
        const coinId = await resolveUctCoinId();
        console.log('[useWager] payout: minting reward', { amount, coinId });
        const result = await client.intent(INTENT_ACTIONS.MINT, {
          coinId,
          amount,
        });
        console.log('[useWager] payout: success', result);
        return true;
      } catch (err) {
        console.error('[useWager] payout: failed', err);
        return false;
      }
    },
    [client, resolveUctCoinId],
  );

  const getBalance = useCallback(async (): Promise<number> => {
    if (!client) return 0;

    try {
      const assets = await client.query<
        Array<{ coinId: string; symbol: string; totalAmount: string; decimals: number }>
      >('sphere_getBalance');

      if (Array.isArray(assets)) {
        const uct = assets.find((a) => a.symbol === COIN_SYMBOL);
        if (uct) {
          if (uct.coinId) setUctCoinId(uct.coinId);
          return Number(uct.totalAmount) / Math.pow(10, uct.decimals || 18);
        }
      }
    } catch {
      // return 0
    }

    return 0;
  }, [client]);

  return { deposit, requestPayout, getBalance, uctCoinId };
}
