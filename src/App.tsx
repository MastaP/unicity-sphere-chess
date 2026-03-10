import { useSphereConnect } from './hooks/useSphereConnect.js';
import { GameProvider } from './context/GameContext.js';
import { ConnectButton } from './components/ConnectButton.js';
import { GameScreen } from './components/GameScreen.js';

export default function App() {
  const connection = useSphereConnect();

  if (!connection.isConnected) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-3xl font-bold text-white mb-2">Unicity Chess</h1>
        <p className="text-neutral-400 mb-8">P2P chess on Sphere — 10 UCT wager</p>
        <ConnectButton
          isConnecting={connection.isConnecting}
          onConnect={connection.connect}
          error={connection.error}
        />
      </div>
    );
  }

  return (
    <GameProvider connection={connection}>
      <GameScreen connection={connection} />
    </GameProvider>
  );
}
