const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
    if (process.env.CONFIRM_ACTIVATE !== "YES") {
        throw new Error("Set CONFIRM_ACTIVATE=YES to confirm game activation.");
    }

    const [signer] = await hre.ethers.getSigners();
    const network = await hre.ethers.provider.getNetwork();
    const deploymentPath = path.join(
        __dirname,
        "..",
        "deployments",
        `${network.chainId}.json`,
    );
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`Deployment file not found: ${deploymentPath}`);
    }

    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const game = await hre.ethers.getContractAt(
        "PEPURGE",
        process.env.PEPURGE_ADDRESS || deployment.contractAddress,
        signer,
    );
    if ((await game.owner()).toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error("The configured signer is not the PEPURGE owner.");
    }
    if (await game.gameActivated()) throw new Error("Game is already activated.");

    const minted = await game.totalMinted();
    let finalSupply = await game.collectionSize();
    if (minted < finalSupply) {
        if (process.env.CONFIRM_FINALIZE_SUPPLY !== "YES") {
            throw new Error(
                `Only ${minted}/${finalSupply} minted. Set ` +
                    "CONFIRM_FINALIZE_SUPPLY=YES to cap supply permanently.",
            );
        }
        await (
            await game.updatePublicDrop(deployment.seaDropAddress, {
                mintPrice: 0,
                startTime: 0,
                endTime: 0,
                maxTotalMintableByWallet: 0,
                feeBps: 0,
                restrictFeeRecipients: false,
            })
        ).wait();
        console.log("SeaDrop public mint disabled.");
        await (await game.setSupplyToMinted()).wait();
        finalSupply = await game.collectionSize();
        console.log("Supply finalized at:", finalSupply.toString());
    }

    const threshold = await game.endGameThreshold();
    const playerReserve = await hre.ethers.provider.getBalance(
        await game.getAddress(),
    );
    if (!process.env.EXPECTED_GAME_BALANCE_ETH) {
        throw new Error(
            "Set EXPECTED_GAME_BALANCE_ETH to the exact post-withdrawal balance before activation.",
        );
    }
    const expectedBalance = hre.ethers.parseEther(
        process.env.EXPECTED_GAME_BALANCE_ETH,
    );
    if (playerReserve !== expectedBalance) {
        throw new Error(
            `Contract balance is ${hre.ethers.formatEther(playerReserve)} ETH, ` +
                `not EXPECTED_GAME_BALANCE_ETH=${process.env.EXPECTED_GAME_BALANCE_ETH}.`,
        );
    }
    const killPool = playerReserve / 2n;
    const winnerPool = playerReserve - killPool;
    const rewardedKills = finalSupply / 4n - threshold + 1n;

    console.log("Final supply:", finalSupply.toString());
    console.log(
        "Game balance:",
        hre.ethers.formatEther(playerReserve),
        "ETH",
    );
    console.log("Kill pool:", hre.ethers.formatEther(killPool), "ETH");
    console.log("Winner pool:", hre.ethers.formatEther(winnerPool), "ETH");
    console.log("ETH-rewarded kills:", rewardedKills.toString());
    console.log(
        "Reward per paid kill:",
        hre.ethers.formatEther(killPool / rewardedKills),
        "ETH",
    );

    const transaction = await game.activateGame();
    await transaction.wait();

    deployment.collectionSize = Number(finalSupply);
    deployment.gameActivated = true;
    deployment.playerReserveWei = playerReserve.toString();
    deployment.killRewardPoolWei = killPool.toString();
    deployment.winnerRewardPoolWei = winnerPool.toString();
    deployment.activationTransaction = transaction.hash;
    fs.writeFileSync(deploymentPath, `${JSON.stringify(deployment, null, 2)}\n`);
    console.log("Game activated:", transaction.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
