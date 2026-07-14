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

Copy `.env.example` to `.env` and add a funded `ROBINHOOD_PRIVATE_KEY`.
`ROBINHOOD_RPC_URL` is recommended but has a public fallback. The production
deployment otherwise uses fixed or default settings: 10,000 maximum supply,
`0.0005633 ETH`, 12-hour cooldown, ten final winners, canonical SeaDrop, and the
strict royalty validator. Then run:

```bash
npm run deploy:robinhood
```

The deploy script creates `Stats` and `PEPURGE` with the fixed production mint
price of `0.0005633 ETH`, verifies the canonical OpenSea
contracts have bytecode, deploys the immutable metadata renderer, fixes ERC-2981
royalties at 10% for the deployer, sets OpenSea's strict transfer validator, and
makes the NFT contract the SeaDrop creator payout address. Keeping primary
proceeds in the NFT contract funds kill and winner rewards. The production
cooldown is fixed at 12 hours, and direct minting is disabled outside localhost;
the local game keeps its 60-second test cooldown.
Deployment addresses are written to ignored `deployments/`.

## Finalize and activate

Combat remains disabled until the owner activates the game. After the OpenSea
mint has stopped, withdraw the chosen owner allocation. For example, this sends
20% of the net proceeds received by the contract to the owner wallet:

```bash
CONFIRM_WITHDRAW=YES WITHDRAW_BPS=2000 npm run withdraw:robinhood
```

The withdrawal command prints the remaining contract balance. Activation sends
no ETH. It snapshots that entire remaining balance, assigns half to kill rewards
and half to final-winner rewards, and requires the expected balance to be stated
explicitly:

```bash
EXPECTED_GAME_BALANCE_ETH=<remaining-balance> CONFIRM_ACTIVATE=YES npm run activate:robinhood
```

If the collection did not sell out, stop the OpenSea stage first, make the owner
withdrawal, then permanently cap supply at the number actually minted and
activate with:

```bash
EXPECTED_GAME_BALANCE_ETH=<remaining-balance> CONFIRM_ACTIVATE=YES CONFIRM_FINALIZE_SUPPLY=YES npm run activate:robinhood
```

At least 40 tokens must exist when the winner threshold is ten. After activation,
the owner can withdraw any ETH that has not already been credited to a player.
Each withdrawal recalculates the future reward pools from the balance left in the
contract. Pending player claims remain reserved and cannot be withdrawn.
Activation also verifies the deployer's 10% royalty and strict validator. The
deployer remains the contract owner. Ownership can be renounced later with a
separate, irreversible transaction:

```bash
CONFIRM_RENOUNCE_OWNERSHIP=YES npm run renounce:robinhood
```

Renouncing ownership is optional and should only be done after all owner-only
configuration and operational controls are no longer needed.

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

This section is optional when the drop is configured entirely through OpenSea
Studio. In Studio, set the mint price to `0.0005633 ETH`, set the PEPURGE contract
as the primary-sale earnings receiver, and configure the supply, dates, and
per-wallet limit there.

Set `PEPURGE_ADDRESS` and `MAX_MINTS_PER_WALLET` to the deployed address and
your chosen explicit wallet cap. Optionally set `MINT_START` and `MINT_END`,
then run:

```bash
npm run configure:seadrop
```

This configures a public SeaDrop stage at the contract's `mintPrice`, with the
NFT contract as payout receiver and no SeaDrop fee deduction. OpenSea Studio can
also configure the item limit, mint price, stage dates, and per-wallet limit. If
Studio is used, set the price to exactly `0.0005633 ETH` and the primary-sale
earnings receiver to the PEPURGE contract. Ending the OpenSea stage stops public
minting, but an undersubscribed game still requires `setSupplyToMinted()` before
activation; the guarded activation script performs that finalization.

OpenSea currently documents a 10% platform fee for primary drops. PEPURGE uses
the net ETH that actually reaches the contract. With a 20% pre-activation owner
withdrawal, net proceeds are allocated 20% to the owner, 40% to kill rewards,
and 40% to final winners. Seaport restricted orders and its SignedZone enforce
the separate 10% creator earnings on supported secondary sales.

Hide actions and hidden protection are disabled once the alive supply reaches
25% of the finalized collection size. Any character still hidden at that
transition becomes immediately attackable during the ETH-reward phase.

After deployment, set the website's `VITE_CONTRACT_ADDRESS` to the new PEPURGE
address and rebuild the website.
