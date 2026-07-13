# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PePurge is a blockchain-based NFT battle game on the Base network. It's a monorepo containing:
- `/website` - React + Vite frontend for NFT minting and gameplay
- `/hardhat` - Solidity smart contracts for game logic

## Development Commands

### Website (React/Vite)

```bash
cd website
npm run dev      # Start dev server at localhost:5173
npm run build    # Production build
npm run lint     # ESLint
```

### Smart Contracts (Hardhat)

```bash
cd hardhat
npm run compile              # Compile contracts
npm run build                # Compile + extract ABIs
npm test                     # Run tests
npm run node                 # Start local Hardhat node

# Deployment
npm run setup:seadrop
npm run deploy:local
npm run deploy:robinhood
npm run configure:seadrop
```

After contract deployment, ABIs are extracted to `/website/src/assets/` for frontend use.

## Architecture

### Frontend
- **Wallet Connection**: Reown AppKit (WalletConnect v2) configured in `appkitConfig.tsx`
- **UI**: Tailwind CSS v4 with shadcn/ui components (Radix UI primitives)
- **State**: React Query (TanStack) for async state
- **Main Views**: `MainPage.tsx` (landing), `MintPage.tsx` (minting), `NightmarePage.tsx` (battles)

### Smart Contracts
- **pepurge.sol**: Main ERC721SeaDrop NFT contract with ERC721-C transfer validation and battle mechanics
  - Minting at 0.00025 ETH per NFT
  - Battle system: attack other NFTs
  - Hide mechanic with 12-hour cooldown
  - NFT stats: attack, defense, HP
- **statsv2_v2.sol**: Stores fixed base attributes for 23 Pepe types

### Networks
- Local: chainId 31337
- Robinhood Chain Testnet: chainId 46630 (OpenSea contracts unavailable)
- Robinhood Chain Mainnet: chainId 4663

## Environment Variables

Both `/website/.env` and `/hardhat/.env` contain contract addresses, RPC URLs, and deployment keys. Copy from existing `.env` files when setting up.
