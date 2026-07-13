# Pepurge contracts

## Local verification

```bash
npm install
npm run setup:seadrop
npm run build
npm test
```

`setup:seadrop` checks out the official OpenSea SeaDrop source at the pinned,
audited commit used by the contract. The checkout lives under ignored `vendor/`.

## Local game

Start a persistent Hardhat chain in the first terminal:

```bash
npm run node
```

Deploy an 8-token game and mint 4 Pepurges to each of Hardhat accounts 1 and 2
in a second terminal:

```bash
npm run setup:localhost
```

The setup uses a 60-second cooldown and a two-survivor ending, then writes the deployment to
`deployments/31337.json`. It also writes the local contract address and chain ID
to the website's ignored `.env.local`. Start or restart the website after setup:

```bash
cd ../website
npm run dev
```

Connect a browser wallet to `http://127.0.0.1:8545` (chain ID `31337`) and
import Hardhat account 1 or 2 using a private key printed by `npm run node`.

To test the ETH-reward phase with the normal ten-winner threshold, deploy 100
tokens and prepare 76 kills:

```bash
npm run setup:reward-localhost
```

This scenario uses zero cooldown, leaves 24 Pepurges alive, gives account 1 ten
attackers and account 2 fourteen targets, and updates the website environment.
The kills that leave 25 and 24 survivors have already credited ETH, while the
next attack remains available for testing another paid kill.

## Robinhood mainnet deployment

Copy the non-secret settings from `.env.example` into `.env`, add a funded
deployment key, then run:

```bash
npm run deploy:robinhood
```

The deploy script creates `Stats` and `PEPURGE`, verifies the canonical OpenSea
contracts have bytecode, deploys the immutable metadata renderer, fixes ERC-2981
royalties at 10% for the deployer, sets OpenSea's strict transfer validator, and
makes the NFT contract the SeaDrop creator payout address. Keeping primary
proceeds in the NFT contract funds kill and winner rewards. The production
cooldown is fixed at 12 hours; the local game keeps its 60-second test cooldown.
Deployment addresses are written to ignored `deployments/`.

## Finalize and activate

Combat remains disabled until the owner activates the game. If all tokens sold,
activate using the configured owner wallet:

```bash
CONFIRM_ACTIVATE=YES npm run activate:robinhood
```

If the collection did not sell out, stop the OpenSea drop first and permanently
cap supply at the number already minted while activating:

```bash
CONFIRM_ACTIVATE=YES CONFIRM_FINALIZE_SUPPLY=YES npm run activate:robinhood
```

At least 40 tokens must exist when the winner threshold is ten. Activation sends
20% of gross mint funds to the original deployer and locks the remaining balance
for the 40% kill pool and 40% final-winner pool. It also verifies the deployer's
10% royalty and strict validator, then renounces ownership so those settings and
the finalized supply cannot be changed after combat begins.

Robinhood mainnet configuration:

- Chain ID: `4663`
- Public RPC: `https://rpc.mainnet.chain.robinhood.com`
- Explorer: `https://robinhoodchain.blockscout.com`
- Canonical SeaDrop: `0x00005EA00Ac477B1030CE78506496e8C2dE24bf5`
- Strict royalty validator: `0xA000027A9B2802E1ddf7000061001e5c005A0000`

Robinhood testnet does not currently have the OpenSea SeaDrop or royalty
enforcement contracts, so the OpenSea launch scripts intentionally target
mainnet only.

## OpenSea public mint

Set `PEPURGE_ADDRESS` to the deployed address. Optionally set `MINT_START`,
`MINT_END`, and `MAX_MINTS_PER_WALLET`, then run:

```bash
npm run configure:seadrop
```

This configures a public SeaDrop stage at the contract's `mintPrice`, with the
NFT contract as payout receiver and no SeaDrop fee deduction. OpenSea Studio can
then publish the drop and configure creator earnings for the already assigned
strict transfer validator. Seaport restricted orders and its SignedZone enforce
the 10% creator earnings on supported sales.

After deployment, set the website's `VITE_CONTRACT_ADDRESS` to the new PEPURGE
address and rebuild the website.
