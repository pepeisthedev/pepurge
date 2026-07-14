const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
    if (process.env.CONFIRM_RENOUNCE_OWNERSHIP !== "YES") {
        throw new Error(
            "Set CONFIRM_RENOUNCE_OWNERSHIP=YES to confirm permanent ownership renunciation.",
        );
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
    const owner = await game.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error("The configured signer is not the PEPURGE owner.");
    }

    const transaction = await game.renounceOwnership();
    await transaction.wait();
    console.log("Ownership renounced:", transaction.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
