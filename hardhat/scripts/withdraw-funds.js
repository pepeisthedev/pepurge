const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
    if (process.env.CONFIRM_WITHDRAW !== "YES") {
        throw new Error("Set CONFIRM_WITHDRAW=YES to confirm the withdrawal.");
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

    const amountSetting = process.env.WITHDRAW_AMOUNT_ETH;
    const bpsSetting = process.env.WITHDRAW_BPS;
    if (Boolean(amountSetting) === Boolean(bpsSetting)) {
        throw new Error("Set exactly one of WITHDRAW_AMOUNT_ETH or WITHDRAW_BPS.");
    }

    const available = await game.withdrawableBalance();
    let amount;
    if (amountSetting) {
        amount = hre.ethers.parseEther(amountSetting);
    } else {
        const bps = Number(bpsSetting);
        if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) {
            throw new Error("WITHDRAW_BPS must be an integer from 1 to 10000.");
        }
        amount = (available * BigInt(bps)) / 10_000n;
    }
    if (amount === 0n || amount > available) {
        throw new Error(
            `Requested ${hre.ethers.formatEther(amount)} ETH, but only ` +
                `${hre.ethers.formatEther(available)} ETH is withdrawable.`,
        );
    }

    const recipient = process.env.WITHDRAW_RECIPIENT || signer.address;
    if (!hre.ethers.isAddress(recipient)) {
        throw new Error("WITHDRAW_RECIPIENT is not a valid address.");
    }

    const transaction = await game.withdrawFunds(recipient, amount);
    await transaction.wait();
    const remaining = await hre.ethers.provider.getBalance(
        await game.getAddress(),
    );
    console.log("Recipient:", recipient);
    console.log("Amount:", hre.ethers.formatEther(amount), "ETH");
    console.log("Remaining contract balance:", hre.ethers.formatEther(remaining), "ETH");
    console.log("Withdrawal:", transaction.hash);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
