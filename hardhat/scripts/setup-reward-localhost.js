const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const COLLECTION_SIZE = 100;
const ACCOUNT_1_TOKENS = 10;
const ACCOUNT_2_TOKENS = COLLECTION_SIZE - ACCOUNT_1_TOKENS;
const PREPARED_KILLS = 76;
const END_GAME_THRESHOLD = 10;
const COOLDOWN = 0;

function updateWebsiteEnvironment(contractAddress) {
    const environmentPath = path.join(
        __dirname,
        "..",
        "..",
        "website",
        ".env.local",
    );
    const values = {
        VITE_CONTRACT_ADDRESS: contractAddress,
        VITE_CHAIN_ID: "31337",
    };
    const existing = fs.existsSync(environmentPath)
        ? fs.readFileSync(environmentPath, "utf8").split(/\r?\n/)
        : [];
    const updatedKeys = new Set();
    const lines = existing
        .filter(Boolean)
        .map((line) => {
            const separator = line.indexOf("=");
            const key = separator === -1 ? line : line.slice(0, separator);
            if (!(key in values)) return line;
            updatedKeys.add(key);
            return `${key}=${values[key]}`;
        });

    for (const [key, value] of Object.entries(values)) {
        if (!updatedKeys.has(key)) lines.push(`${key}=${value}`);
    }
    fs.writeFileSync(environmentPath, `${lines.join("\n")}\n`);
    return environmentPath;
}

async function installLocalValidator(game) {
    const validatorAddress = await game.STRICT_ROYALTY_VALIDATOR();
    const validatorArtifact = await hre.artifacts.readArtifact(
        "LocalTransferValidator",
    );
    await hre.network.provider.send("hardhat_setCode", [
        validatorAddress,
        validatorArtifact.deployedBytecode,
    ]);
    return validatorAddress;
}

async function main() {
    const network = await hre.ethers.provider.getNetwork();
    if (network.chainId !== 31337n) {
        throw new Error(
            `Reward setup requires chain 31337, received ${network.chainId}.`,
        );
    }

    const [deployer, wallet1, wallet2, localSeaDrop] =
        await hre.ethers.getSigners();
    const mintPrice = hre.ethers.parseEther(
        process.env.LOCAL_MINT_PRICE_ETH || "0.00025",
    );

    console.log("Deploying the 100-token reward test game...");
    const Stats = await hre.ethers.getContractFactory("Stats", deployer);
    const stats = await Stats.deploy();
    await stats.waitForDeployment();

    const Renderer = await hre.ethers.getContractFactory(
        "PepurgeRenderer",
        deployer,
    );
    const renderer = await Renderer.deploy(await stats.getAddress());
    await renderer.waitForDeployment();

    const Pepurge = await hre.ethers.getContractFactory("PEPURGE", deployer);
    const game = await Pepurge.deploy(
        await stats.getAddress(),
        await renderer.getAddress(),
        COLLECTION_SIZE,
        mintPrice,
        COOLDOWN,
        END_GAME_THRESHOLD,
        [localSeaDrop.address],
    );
    await game.waitForDeployment();

    const contractAddress = await game.getAddress();
    const validatorAddress = await installLocalValidator(game);
    await (
        await game
            .connect(localSeaDrop)
            .mintSeaDrop(wallet1.address, ACCOUNT_1_TOKENS)
    ).wait();
    await (
        await game
            .connect(localSeaDrop)
            .mintSeaDrop(wallet2.address, ACCOUNT_2_TOKENS)
    ).wait();

    const grossMintFunds = mintPrice * BigInt(COLLECTION_SIZE);
    await (
        await deployer.sendTransaction({
            to: contractAddress,
            value: grossMintFunds,
        })
    ).wait();
    const ownerWithdrawal = grossMintFunds / 5n;
    await (
        await game.withdrawFunds(deployer.address, ownerWithdrawal)
    ).wait();
    await (await game.activateGame()).wait();

    const attackerTokenIds = Array.from(
        { length: ACCOUNT_1_TOKENS },
        (_, index) => index + 1,
    );
    for (let index = 0; index < PREPARED_KILLS; index += 1) {
        const targetTokenId = ACCOUNT_1_TOKENS + index + 1;
        await (
            await game
                .connect(wallet1)
                .Attack(attackerTokenIds, targetTokenId)
        ).wait();
        if ((index + 1) % 10 === 0 || index + 1 === PREPARED_KILLS) {
            console.log(`Prepared kills: ${index + 1}/${PREPARED_KILLS}`);
        }
    }

    const playerReserve = grossMintFunds - ownerWithdrawal;
    const killPool = playerReserve / 2n;
    const rewardedKills =
        BigInt(Math.floor(COLLECTION_SIZE / 4)) -
        BigInt(END_GAME_THRESHOLD) +
        1n;
    const expectedAlive = COLLECTION_SIZE - PREPARED_KILLS;
    const expectedPaidKills =
        Math.floor(COLLECTION_SIZE / 4) - expectedAlive + 1;
    let remainingKillPool = killPool;
    let remainingPaidKills = rewardedKills;
    let expectedPendingReward = 0n;
    for (let index = 0; index < expectedPaidKills; index += 1) {
        const reward = remainingKillPool / remainingPaidKills;
        expectedPendingReward += reward;
        remainingKillPool -= reward;
        remainingPaidKills -= 1n;
    }
    const nextKillReward = remainingKillPool / remainingPaidKills;
    const [alive, wallet1Balance, wallet2Balance, pendingReward, activated] =
        await Promise.all([
            game.aliveCount(),
            game.balanceOf(wallet1.address),
            game.balanceOf(wallet2.address),
            game.pendingRewards(wallet1.address),
            game.gameActivated(),
        ]);

    if (
        alive !== BigInt(expectedAlive) ||
        wallet1Balance !== BigInt(ACCOUNT_1_TOKENS) ||
        wallet2Balance !== BigInt(ACCOUNT_2_TOKENS - PREPARED_KILLS) ||
        pendingReward !== expectedPendingReward ||
        !activated
    ) {
        throw new Error("Reward-stage preparation verification failed.");
    }

    const deployment = {
        network: "localhost",
        scenario: "reward-threshold",
        chainId: "31337",
        deployer: deployer.address,
        royaltyReceiver: deployer.address,
        royaltyBps: 1000,
        statsAddress: await stats.getAddress(),
        rendererAddress: await renderer.getAddress(),
        contractAddress,
        seaDropAddress: localSeaDrop.address,
        strictRoyaltyValidator: validatorAddress,
        collectionSize: COLLECTION_SIZE,
        totalMinted: COLLECTION_SIZE,
        aliveCount: expectedAlive,
        mintPriceWei: mintPrice.toString(),
        cooldown: COOLDOWN,
        endGameThreshold: END_GAME_THRESHOLD,
        gameActivated: true,
        preparedKills: PREPARED_KILLS,
        paidKillsPrepared: expectedPaidKills,
        killRewardWei: nextKillReward.toString(),
        pendingRewardWei: pendingReward.toString(),
        nextTargetTokenId: ACCOUNT_1_TOKENS + PREPARED_KILLS + 1,
        wallet1: wallet1.address,
        wallet1Tokens: Number(wallet1Balance),
        wallet2: wallet2.address,
        wallet2Tokens: Number(wallet2Balance),
    };
    const deploymentDirectory = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentDirectory, { recursive: true });
    const deploymentPath = path.join(deploymentDirectory, "31337.json");
    fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
    const environmentPath = updateWebsiteEnvironment(contractAddress);

    console.log("\nReward-stage game ready");
    console.log("PEPURGE:", contractAddress);
    console.log("Alive:", `${expectedAlive}/${COLLECTION_SIZE}`);
    console.log("Wallet 1 attackers:", wallet1Balance.toString());
    console.log("Wallet 2 targets:", wallet2Balance.toString());
    console.log("Next target token:", deployment.nextTargetTokenId);
    console.log(
        "Reward per kill:",
        hre.ethers.formatEther(nextKillReward),
        "ETH",
    );
    console.log(
        "Wallet 1 pending reward:",
        hre.ethers.formatEther(pendingReward),
        "ETH",
    );
    console.log("Deployment state:", deploymentPath);
    console.log("Website environment:", environmentPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
