import { createAppKit } from '@reown/appkit/react'
import { hardhat, robinhood } from '@reown/appkit/networks'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient(); 

const metadata = { // optional app metadata
  name: 'Pepurge',
  description: 'Pepurge NFT battle game',
  url: window.location.origin,
  icons: [`${window.location.origin}/favicon.ico`]
};

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID; //Reown project ID
const activeNetwork = import.meta.env.VITE_CHAIN_ID === '31337' ? hardhat : robinhood;

// Initialize Reown AppKit (modal instance)
export const modal = createAppKit({
  adapters: [new EthersAdapter()],       // use Ethers for EVM wallets
  networks: [activeNetwork],
  defaultNetwork: activeNetwork,
  metadata,                              // app metadata (for wallet UIs)
  projectId,                             // your Reown/WalletConnect project ID
  features: {
    analytics: true                     // enable Reown analytics (optional)
  }
});
