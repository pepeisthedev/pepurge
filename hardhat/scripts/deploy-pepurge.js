const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const CANONICAL_SEADROP = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";
const STRICT_ROYALTY_VALIDATOR =
    "0xA000027A9B2802E1ddf7000061001e5c005A0000";
const MAINNET_COOLDOWN_SECONDS = 12 * 60 * 60;

async function requireCode(address, label) {
    const code = await hre.ethers.provider.getCode(address);
    if (code === "0x") throw new Error(`${label} has no code at ${address}.`);
}

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();
    const isLocal = network.chainId === 31337n;
    const collectionSize = Number(process.env.COLLECTION_SIZE || "10000");
    const mintPrice = hre.ethers.parseEther(
        process.env.MINT_PRICE_ETH || "0.00025",
    );
    const cooldown = isLocal
        ? Number(process.env.COOLDOWN_SECONDS || "43200")
        : MAINNET_COOLDOWN_SECONDS;
    const endGameThreshold = Number(process.env.END_GAME_THRESHOLD || "10");
    const seaDrop = process.env.SEADROP_ADDRESS || CANONICAL_SEADROP;

    if (!isLocal) {
        if (network.chainId !== 4663n && network.chainId !== 46630n) {
            throw new Error(`Unsupported deployment chain ${network.chainId}.`);
        }
        await requireCode(seaDrop, "SeaDrop");
        await requireCode(STRICT_ROYALTY_VALIDATOR, "Royalty validator");
    }

    console.log("Network:", hre.network.name, network.chainId.toString());
    console.log("Deployer and royalty receiver:", deployer.address);

    const Stats = await hre.ethers.getContractFactory("Stats");
    const stats = await Stats.deploy();
    await stats.waitForDeployment();

    const Renderer = await hre.ethers.getContractFactory("PepurgeRenderer");
    const renderer = await Renderer.deploy(await stats.getAddress());
    await renderer.waitForDeployment();

    const Pepurge = await hre.ethers.getContractFactory("PEPURGE");
    const pepurge = await Pepurge.deploy(
        await stats.getAddress(),
        await renderer.getAddress(),
        collectionSize,
        mintPrice,
        cooldown,
        endGameThreshold,
        [seaDrop],
    );
    await pepurge.waitForDeployment();

    const contractAddress = await pepurge.getAddress();
    if (!isLocal) {
        const tx = await pepurge.updateCreatorPayoutAddress(
            seaDrop,
            contractAddress,
        );
        await tx.wait();
    }

    const output = {
        network: hre.network.name,
        chainId: network.chainId.toString(),
        deployer: deployer.address,
        royaltyReceiver: deployer.address,
        royaltyBps: 1000,
        statsAddress: await stats.getAddress(),
        rendererAddress: await renderer.getAddress(),
        contractAddress,
        seaDropAddress: seaDrop,
        strictRoyaltyValidator: STRICT_ROYALTY_VALIDATOR,
        collectionSize,
        mintPriceWei: mintPrice.toString(),
        cooldown,
        endGameThreshold,
        gameActivated: false,
    };

    const directory = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(directory, { recursive: true });
    const outputPath = path.join(directory, `${network.chainId}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

    console.log("Stats:", output.statsAddress);
    console.log("Renderer:", output.rendererAddress);
    console.log("PEPURGE:", contractAddress);
    console.log("Deployment state:", outputPath);

    if (!isLocal && process.env.VERIFY_CONTRACTS === "true") {
        await hre.run("verify:verify", {
            address: output.statsAddress,
            constructorArguments: [],
        });
        await hre.run("verify:verify", {
            address: output.rendererAddress,
            constructorArguments: [output.statsAddress],
        });
        await hre.run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                output.statsAddress,
                output.rendererAddress,
                collectionSize,
                mintPrice,
                cooldown,
                endGameThreshold,
                [seaDrop],
            ],
        });
        console.log("Contracts verified on Robinhood Blockscout.");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
