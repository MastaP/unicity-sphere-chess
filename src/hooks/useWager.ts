import { useState, useRef, useCallback } from 'react';
import type { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import {
  ESCROW_NAMETAG,
  ENTRY_FEE,
  COIN_SYMBOL,
  UCT_COIN_ID_FALLBACK,
  UCT_DECIMALS,
} from '../constants';

export interface UseWager {
  deposit: (gameId: string) => Promise<boolean>;
  requestPayout: (amount: number) => Promise<boolean>;
  getBalance: () => Promise<number>;
  uctCoinId: string | null;
}

/**
 * Whole-token amount → base-unit string. The SEND and MINT intents both take
 * the amount in the token's smallest indivisible unit, as a string (see
 * docs/CONNECT.md; equivalent to the SDK's parseTokenAmount). Our amounts are
 * whole integers (10 / 20 UCT), so plain BigInt math is exact.
 */
function toBaseUnits(whole: number, decimals: number): string {
  return (BigInt(Math.round(whole)) * 10n ** BigInt(decimals)).toString();
}

export function useWager(client: ConnectClient | null): UseWager {
  const [uctCoinId, setUctCoinId] = useState<string | null>(null);
  const uctDecimalsRef = useRef<number>(UCT_DECIMALS);

  const resolveUctAsset = useCallback(async (): Promise<{ coinId: string; decimals: number }> => {
    if (uctCoinId) return { coinId: uctCoinId, decimals: uctDecimalsRef.current };
    if (!client) return { coinId: UCT_COIN_ID_FALLBACK, decimals: UCT_DECIMALS };

    try {
      const assets = await client.query<
        Array<{ coinId: string; symbol: string; totalAmount: string; decimals: number }>
      >('sphere_getBalance');

      if (Array.isArray(assets)) {
        const uct = assets.find((a) => a.symbol === COIN_SYMBOL);
        if (uct?.coinId) {
          // Use the wallet's own decimals so our base-unit math matches how it
          // formats the amount in the confirm dialog.
          const decimals = uct.decimals || UCT_DECIMALS;
          setUctCoinId(uct.coinId);
          uctDecimalsRef.current = decimals;
          return { coinId: uct.coinId, decimals };
        }
      }
    } catch {
      // fallback
    }

    setUctCoinId(UCT_COIN_ID_FALLBACK);
    return { coinId: UCT_COIN_ID_FALLBACK, decimals: UCT_DECIMALS };
  }, [client, uctCoinId]);

  const deposit = useCallback(
    async (gameId: string): Promise<boolean> => {
      if (!client) return false;

      try {
        const { coinId, decimals } = await resolveUctAsset();
        const amount = toBaseUnits(ENTRY_FEE, decimals);
        console.log('[useWager] deposit: sending', { to: ESCROW_NAMETAG, entryFee: ENTRY_FEE, amount, coinId, memo: `unichess:${gameId}` });
        const result = await client.intent(INTENT_ACTIONS.SEND, {
          to: ESCROW_NAMETAG,
          amount,
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
    [client, resolveUctAsset],
  );

  // testnet2 has no faucet. Rewards (20 UCT to a winner) and refunds (10 UCT on
  // draw/abort/decline) are self-minted into the *connected* wallet via a MINT
  // intent — the wallet prompts the user to approve, then mints test UCT to
  // itself. Each client only ever pays itself, so the mint always targets the
  // connected wallet (no recipient param). Per the Connect contract the MINT
  // intent takes { coinId (lowercase hex), amount (base units, as a string) }.
  const requestPayout = useCallback(
    async (whole: number): Promise<boolean> => {
      if (!client) return false;
      if (whole <= 0) return false;

      try {
        const { coinId, decimals } = await resolveUctAsset();
        const amount = toBaseUnits(whole, decimals);
        console.log('[useWager] payout: minting reward', { whole, amount, coinId });
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
    [client, resolveUctAsset],
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
