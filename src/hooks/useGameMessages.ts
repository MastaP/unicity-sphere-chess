import { useCallback, useEffect, useRef } from 'react';
import type { ConnectClient } from '@unicitylabs/sphere-sdk/connect';
import { INTENT_ACTIONS } from '@unicitylabs/sphere-sdk/connect';
import { parseMessage, encodeMessage } from '../lib/protocol';
import { PROTOCOL_PREFIX } from '../constants';
import type { ParsedMessage } from '../types/protocol';

interface DirectMessage {
  id: string;
  content: string;
  senderPubkey: string;
  recipientPubkey: string;
  timestamp: number;
}

type MessageHandler = (msg: ParsedMessage, senderPubkey: string) => void;

const DM_RETRY_COUNT = 1;
const DM_RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseGameMessages {
  sendMessage: (
    opponentNametag: string,
    msg: ParsedMessage,
  ) => Promise<void>;
  loadHistory: (
    opponentPubkey: string,
    gameId: string,
  ) => Promise<ParsedMessage[]>;
}

export function useGameMessages(
  client: ConnectClient | null,
  gameId: string | null,
  onMessage: MessageHandler | null,
): UseGameMessages {
  const handlerRef = useRef<MessageHandler | null>(onMessage);
  handlerRef.current = onMessage;

  const gameIdRef = useRef(gameId);
  gameIdRef.current = gameId;

  const seenDmIds = useRef(new Set<string>());

  useEffect(() => {
    if (!client) return;

    const unsub = client.on('message:dm', (data: unknown) => {
      const dm = data as DirectMessage;
      if (!dm.content?.startsWith(`${PROTOCOL_PREFIX}:`)) return;

      // Deduplicate: skip DMs we've already processed
      if (seenDmIds.current.has(dm.id)) return;
      seenDmIds.current.add(dm.id);
      // Prevent unbounded growth — prune when set gets large
      if (seenDmIds.current.size > 500) {
        const entries = [...seenDmIds.current];
        seenDmIds.current = new Set(entries.slice(-200));
      }

      const parsed = parseMessage(dm.content);
      if (!parsed) return;

      if (gameIdRef.current && parsed.gameId !== gameIdRef.current) {
        if (parsed.action !== 'ch') return;
      }

      handlerRef.current?.(parsed, dm.senderPubkey);
    });

    return unsub;
  }, [client]);

  const sendMessage = useCallback(
    async (opponentNametag: string, msg: ParsedMessage): Promise<void> => {
      if (!client) throw new Error('Not connected');

      const to = opponentNametag.startsWith('@')
        ? opponentNametag
        : `@${opponentNametag}`;
      const message = encodeMessage(msg);

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < DM_RETRY_COUNT; attempt++) {
        try {
          await client.intent(INTENT_ACTIONS.DM, { to, message });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error('DM send failed');
          if (attempt < DM_RETRY_COUNT - 1) {
            await sleep(DM_RETRY_DELAY_MS);
          }
        }
      }

      throw lastError;
    },
    [client],
  );

  const loadHistory = useCallback(
    async (
      opponentPubkey: string,
      targetGameId: string,
    ): Promise<ParsedMessage[]> => {
      if (!client) return [];

      try {
        const result = await client.query<{ messages: DirectMessage[] }>(
          'sphere_getMessages',
          { peerPubkey: opponentPubkey, limit: 100 },
        );

        const messages: ParsedMessage[] = [];
        for (const dm of result.messages) {
          if (!dm.content.startsWith(`${PROTOCOL_PREFIX}:`)) continue;
          const parsed = parseMessage(dm.content);
          if (parsed && parsed.gameId === targetGameId) {
            messages.push(parsed);
          }
        }

        return messages;
      } catch {
        return [];
      }
    },
    [client],
  );

  return { sendMessage, loadHistory };
}
