const hre = require("hardhat");

const CANONICAL_SEADROP = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";

async function main() {
    const contractAddress = process.env.PEPURGE_ADDRESS;
    if (!contractAddress) throw new Error("Set PEPURGE_ADDRESS.");

    const pepurge = await hre.ethers.getContractAt("PEPURGE", contractAddress);
    const seaDrop = process.env.SEADROP_ADDRESS || CANONICAL_SEADROP;
    const latestBlock = await hre.ethers.provider.getBlock("latest");
    const startTime = Number(
        process.env.MINT_START || latestBlock.timestamp + 15 * 60,
    );
    const endTime = Number(
        process.env.MINT_END || startTime + 30 * 24 * 60 * 60,
    );
    const maxPerWallet = Number(process.env.MAX_MINTS_PER_WALLET || "10000");
    const mintPrice = await pepurge.mintPrice();

    if (endTime <= startTime) throw new Error("MINT_END must follow MINT_START.");
    if (maxPerWallet < 1 || maxPerWallet > 65535) {
        throw new Error("MAX_MINTS_PER_WALLET must be between 1 and 65535.");
    }

    await (
        await pepurge.updateCreatorPayoutAddress(seaDrop, contractAddress)
    ).wait();
    await (
        await pepurge.updatePublicDrop(seaDrop, {
            mintPrice,
            startTime,
            endTime,
            maxTotalMintableByWallet: maxPerWallet,
            feeBps: 0,
            restrictFeeRecipients: false,
        })
    ).wait();

    console.log("SeaDrop configured for:", contractAddress);
    console.log("Mint price:", hre.ethers.formatEther(mintPrice), "ETH");
    console.log("Mint window:", startTime, "to", endTime);
    console.log("Creator payout/game reserve:", contractAddress);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
