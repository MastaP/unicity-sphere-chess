import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ConnectClient,
  HOST_READY_TYPE,
  HOST_READY_TIMEOUT,
} from '@unicitylabs/sphere-sdk/connect';
import {
  PostMessageTransport,
  ExtensionTransport,
} from '@unicitylabs/sphere-sdk/connect/browser';
import type {
  ConnectTransport,
  PublicIdentity,
  PermissionScope,
} from '@unicitylabs/sphere-sdk/connect';
import { isInIframe, hasExtension } from '../lib/detection';
import { WALLET_URL } from '../constants';

const SESSION_KEY = 'unichess-session';

const PERMISSIONS: PermissionScope[] = [
  'identity:read',
  'balance:read',
  'dm:read',
  'dm:request',
  'transfer:request',
  'events:subscribe',
];

const DAPP_META = {
  name: 'Unicity Chess',
  description: 'P2P chess on Unicity Sphere',
  url: typeof window !== 'undefined' ? window.location.origin : '',
} as const;

function waitForHostReady(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener('message', handler);
      reject(new Error('Wallet did not respond in time'));
    }, HOST_READY_TIMEOUT);

    function handler(event: MessageEvent) {
      if (event.data?.type === HOST_READY_TYPE) {
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve();
      }
    }
    window.addEventListener('message', handler);
  });
}

export interface UseSphereConnect {
  isConnected: boolean;
  isConnecting: boolean;
  identity: PublicIdentity | null;
  client: ConnectClient | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useSphereConnect(): UseSphereConnect {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [identity, setIdentity] = useState<PublicIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ConnectClient | null>(null);
  const transportRef = useRef<ConnectTransport | null>(null);
  const popupRef = useRef<Window | null>(null);
  const popupMode = useRef(false);

  const cleanup = useCallback(() => {
    transportRef.current?.destroy();
    clientRef.current = null;
    transportRef.current = null;
    popupRef.current?.close();
    popupRef.current = null;
    popupMode.current = false;
  }, []);

  const connectIframe = useCallback(
    async (silent: boolean) => {
      if (silent) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', readyHandler);
            reject(new Error('Host not ready'));
          }, 5000);
          function readyHandler(e: MessageEvent) {
            if (e.data?.type === HOST_READY_TYPE) {
              clearTimeout(timer);
              window.removeEventListener('message', readyHandler);
              resolve();
            }
          }
          window.addEventListener('message', readyHandler);
        });
      }

      popupMode.current = false;
      const transport = PostMessageTransport.forClient();
      transportRef.current = transport;

      const client = new ConnectClient({
        transport,
        dapp: DAPP_META,
        permissions: PERMISSIONS,
        ...(silent ? { silent: true } : {}),
      });
      clientRef.current = client;

      const result = await client.connect();
      sessionStorage.setItem(SESSION_KEY, result.sessionId);
      setIdentity(result.identity);
      setIsConnected(true);
      setError(null);
    },
    [],
  );

  const connectExtension = useCallback(async (silent: boolean) => {
    popupMode.current = false;
    const transport = ExtensionTransport.forClient();
    transportRef.current = transport;

    const client = new ConnectClient({
      transport,
      dapp: DAPP_META,
      permissions: PERMISSIONS,
      ...(silent ? { silent: true } : {}),
    });
    clientRef.current = client;

    const result = await client.connect();
    setIdentity(result.identity);
    setIsConnected(true);
    setError(null);
  }, []);

  const connectPopup = useCallback(async () => {
    if (!popupRef.current || popupRef.current.closed) {
      const popup = window.open(
        WALLET_URL + '/connect?origin=' + encodeURIComponent(location.origin),
        'sphere-wallet',
        'width=420,height=650',
      );
      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      popupRef.current = popup;
    } else {
      popupRef.current.focus();
    }

    transportRef.current?.destroy();
    const transport = PostMessageTransport.forClient({
      target: popupRef.current,
      targetOrigin: WALLET_URL,
    });
    transportRef.current = transport;

    await waitForHostReady();

    const resumeSessionId = sessionStorage.getItem(SESSION_KEY) ?? undefined;
    const client = new ConnectClient({
      transport,
      dapp: DAPP_META,
      permissions: PERMISSIONS,
      resumeSessionId,
    });
    clientRef.current = client;
    popupMode.current = true;

    const result = await client.connect();
    sessionStorage.setItem(SESSION_KEY, result.sessionId);
    setIdentity(result.identity);
    setIsConnected(true);
    setError(null);
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      if (isInIframe()) {
        await connectIframe(false);
      } else if (hasExtension()) {
        await connectExtension(false);
      } else {
        await connectPopup();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, [connectIframe, connectExtension, connectPopup]);

  const disconnect = useCallback(async () => {
    try {
      await clientRef.current?.disconnect();
    } catch {
      // ignore
    }
    cleanup();
    sessionStorage.removeItem(SESSION_KEY);
    setIsConnected(false);
    setIdentity(null);
    setError(null);
  }, [cleanup]);

  // Poll for popup close
  useEffect(() => {
    if (!isConnected || !popupMode.current) return;

    const interval = setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        clearInterval(interval);
        cleanup();
        sessionStorage.removeItem(SESSION_KEY);
        setIsConnected(false);
        setIdentity(null);
        setError(null);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isConnected, cleanup]);

  // Silent auto-connect on mount
  useEffect(() => {
    const silentConnect = async () => {
      try {
        if (isInIframe()) {
          await connectIframe(true);
        } else if (hasExtension()) {
          await connectExtension(true);
        } else if (sessionStorage.getItem(SESSION_KEY)) {
          await connectPopup();
        }
      } catch {
        // Silent connect failed, clean up
        cleanup();
      }
    };

    silentConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isConnected,
    isConnecting,
    identity,
    client: clientRef.current,
    error,
    connect,
    disconnect,
  };
}
