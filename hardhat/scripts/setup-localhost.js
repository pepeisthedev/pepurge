const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const TOKENS_PER_WALLET = 4;
const COLLECTION_SIZE = TOKENS_PER_WALLET * 2;

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

async function mintTokens(game, wallet, count, mintPrice, label) {
    for (let i = 0; i < count; i += 1) {
        await (await game.connect(wallet).mint({ value: mintPrice })).wait();
        if ((i + 1) % 5 === 0 || i + 1 === count) {
            console.log(`${label}: minted ${i + 1}/${count}`);
        }
    }
}

async function main() {
    const network = await hre.ethers.provider.getNetwork();
    if (network.chainId !== 31337n) {
        throw new Error(`Local setup requires chain 31337, received ${network.chainId}.`);
    }

    const [deployer, wallet1, wallet2, localSeaDrop] =
        await hre.ethers.getSigners();
    const mintPrice = hre.ethers.parseEther(
        process.env.LOCAL_MINT_PRICE_ETH || "0.00025",
    );
    const cooldown = Number(process.env.LOCAL_COOLDOWN_SECONDS || "60");
    const endGameThreshold = Number(process.env.LOCAL_END_GAME_THRESHOLD || "2");

    console.log("Deploying the local Pepurge game...");
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
        cooldown,
        endGameThreshold,
        [localSeaDrop.address],
    );
    await game.waitForDeployment();

    const contractAddress = await game.getAddress();
    const validatorAddress = await game.STRICT_ROYALTY_VALIDATOR();
    const validatorArtifact = await hre.artifacts.readArtifact(
        "LocalTransferValidator",
    );
    await hre.network.provider.send("hardhat_setCode", [
        validatorAddress,
        validatorArtifact.deployedBytecode,
    ]);
    await mintTokens(game, wallet1, TOKENS_PER_WALLET, mintPrice, "Wallet 1");
    await mintTokens(game, wallet2, TOKENS_PER_WALLET, mintPrice, "Wallet 2");
    const grossMintFunds = mintPrice * BigInt(COLLECTION_SIZE);
    const ownerWithdrawal = grossMintFunds / 5n;
    await (
        await game.withdrawFunds(deployer.address, ownerWithdrawal)
    ).wait();
    await (await game.connect(deployer).activateGame()).wait();

    const expectedPlayerReserve = grossMintFunds - ownerWithdrawal;
    const [
        wallet1Balance,
        wallet2Balance,
        totalMinted,
        aliveCount,
        activated,
        requiredReserve,
        contractBalance,
    ] =
        await Promise.all([
            game.balanceOf(wallet1.address),
            game.balanceOf(wallet2.address),
            game.totalMinted(),
            game.aliveCount(),
            game.gameActivated(),
            game.requiredReserve(),
            hre.ethers.provider.getBalance(contractAddress),
        ]);
    if (
        wallet1Balance !== BigInt(TOKENS_PER_WALLET) ||
        wallet2Balance !== BigInt(TOKENS_PER_WALLET) ||
        totalMinted !== BigInt(COLLECTION_SIZE) ||
        aliveCount !== BigInt(COLLECTION_SIZE) ||
        !activated ||
        requiredReserve !== expectedPlayerReserve ||
        contractBalance !== expectedPlayerReserve
    ) {
        throw new Error("Local mint verification failed.");
    }

    const deployment = {
        network: "localhost",
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
        mintPriceWei: mintPrice.toString(),
        cooldown,
        endGameThreshold,
        gameActivated: true,
        playerReserveWei: expectedPlayerReserve.toString(),
        wallet1: wallet1.address,
        wallet2: wallet2.address,
        tokensPerWallet: TOKENS_PER_WALLET,
    };
    const deploymentDirectory = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(deploymentDirectory, { recursive: true });
    const deploymentPath = path.join(deploymentDirectory, "31337.json");
    fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
    const environmentPath = updateWebsiteEnvironment(contractAddress);

    console.log("\nLocal game ready");
    console.log("PEPURGE:", contractAddress);
    console.log(
        "Wallet 1:",
        wallet1.address,
        `(${TOKENS_PER_WALLET} Pepurges)`,
    );
    console.log(
        "Wallet 2:",
        wallet2.address,
        `(${TOKENS_PER_WALLET} Pepurges)`,
    );
    console.log("Cooldown:", `${cooldown} seconds`);
    console.log("Deployment state:", deploymentPath);
    console.log("Website environment:", environmentPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
