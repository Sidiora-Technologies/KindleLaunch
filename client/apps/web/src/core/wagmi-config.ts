import { http, fallback, createConfig, createStorage, cookieStorage, type CreateConnectorFn } from 'wagmi';
import { type Chain } from 'viem';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';
import { paxeerEmbeddedConnector } from './wallet-sdk/paxeerConnector';
import { getPaxeerWallet, resolvePaxeerConfig } from './wallet-sdk/client';

export const paxeer = {
  id: 125,
  name: 'Paxeer Network',
  nativeCurrency: { name: 'USDL', symbol: 'USDL', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://public-mainnet.rpcpaxeer.online/evm'],
    },
  },
  blockExplorers: {
    default: { name: 'Paxscan', url: 'https://paxscan.paxeer.app' },
  },
} as const satisfies Chain;

// ── RPC Transport with batching + fallback ─────────────────────
const primaryRpc = http(
  process.env.NEXT_PUBLIC_RPC_URL || 'https://public-mainnet.rpcpaxeer.online/evm',
  {
    batch: { batchSize: 1024, wait: 16 },
    retryCount: 2,
  },
);

const fallbackRpcUrl = process.env.NEXT_PUBLIC_RPC_URL_FALLBACK;
const transports = fallbackRpcUrl
  ? fallback(
      [
        primaryRpc,
        http(fallbackRpcUrl, { batch: true, retryCount: 1 }),
      ],
      { rank: { interval: 60_000 } },
    )
  : primaryRpc;

// ── Connectors ─────────────────────────────────────────────────
// IMPORTANT: keep order stable across SSR/CSR so wagmi's cookie-restored state
// matches the client-side connector list. The Paxeer embedded connector is
// added unconditionally; on the server it's a placeholder that no-ops because
// `getPaxeerWallet()` returns null and the SDK lazily resolves on first use.
const connectors = (() => {
  const list: CreateConnectorFn[] = [];

  // 1) Paxeer Embedded Wallet (Supabase-backed: Email / Google / GitHub / X)
  const paxCfg = resolvePaxeerConfig();
  if (paxCfg) {
    const paxWallet = getPaxeerWallet();
    if (paxWallet) {
      list.push(
        paxeerEmbeddedConnector({
          wallet: paxWallet,
          chainId: paxCfg.chainId,
          rpcUrl: paxCfg.rpcUrl,
        }) as unknown as CreateConnectorFn,
      );
    }
  }

  // 2) Injected (MetaMask, Rabby, etc.)
  list.push(injected());

  const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (wcProjectId) {
    list.push(
      walletConnect({
        projectId: wcProjectId,
        metadata: {
          name: 'Sidiora',
          description: 'Token Launchpad on Paxeer Network',
          url: 'https://sidiora.fun',
          icons: ['https://sidiora.fun/sid-fun-icon.png'],
        },
      }),
    );
  } else if (typeof window !== 'undefined') {
    console.warn(
      '[Sidiora] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. WalletConnect disabled.',
    );
  }

  list.push(coinbaseWallet({ appName: 'Sidiora' }));

  return list;
})();

export const wagmiConfig = createConfig({
  chains: [paxeer],
  connectors,
  storage: createStorage({ storage: cookieStorage }),
  transports: {
    [paxeer.id]: transports,
  },
  ssr: true,
});
