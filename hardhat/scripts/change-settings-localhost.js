const { ethers } = require("hardhat");

async function main() {
    // Use the first signer (deployer/owner)
    const [deployer] = await ethers.getSigners();
    console.log("Deployer address:", await deployer.getAddress());

    // Update with your deployed contract address
    const PEPURGE_ADDRESS = "0x4288AFE0CeF1a8D2B1BA80AD5d82fC65a9917f47";
    const PEPURGE = await ethers.getContractAt("contracts/tmp/pepurgewizv4.sol:PEPURGE", PEPURGE_ADDRESS);
    const pepurgeAsOwner = PEPURGE.connect(deployer);

    // Desired settings
    const mintPrice = ethers.parseEther("0.00025");
    const supply = 143;
    const CID = "ipfs://bafybeihbso5n53jblaianewxlwtyg75cszy5aqbfu7fa3otvurzbzprdmi/";
    const coolDown = 43200;
    const whenCollect = 10;
    const collect = 118;

    // Change settings
    console.log("Changing settings on localhost...");
    const tx = await pepurgeAsOwner.setting1(
        supply,
        mintPrice,
        CID,
        coolDown,
        whenCollect,
        collect
    );
    await tx.wait();
    console.log("Settings updated successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
