interface ConnectButtonProps {
  isConnecting: boolean;
  onConnect: () => Promise<void>;
  error: string | null;
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

export function ConnectButton({ isConnecting, onConnect, error }: ConnectButtonProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={onConnect}
        disabled={isConnecting}
        className="px-8 py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-500/50
                   text-white font-semibold rounded-xl text-lg
                   transition-colors cursor-pointer disabled:cursor-not-allowed"
      >
        {isConnecting ? (
          <span className="flex items-center gap-2">
            <Spinner />
            Connecting...
          </span>
        ) : (
          'Connect Sphere Wallet'
        )}
      </button>

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 text-red-400 px-4 py-2 rounded-xl max-w-sm text-center text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
