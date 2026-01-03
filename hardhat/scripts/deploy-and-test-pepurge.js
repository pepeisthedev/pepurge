const { ethers } = require("hardhat");

async function main() {
    console.log("Starting PEPURGE deployment and testing...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", await deployer.getAddress());



    // Deploy Stats contract
    console.log("\n--- Deploying Stats Contract ---");
    const Stats = await ethers.getContractFactory("contracts/tmp/statsv2.sol:Stats");
    const stats = await Stats.deploy();
    await stats.waitForDeployment();
    console.log("Stats deployed to:", await stats.getAddress());

    // Initialize Stats with some test data
    console.log("\n--- Initializing Stats with test data ---");
    
    // Add attack values for types 1-25
    const attackValues = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130];
    await stats.addMeta(attackValues);
    
    // Add defense values for types 1-25
    const defenseValues = [0, 5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 48, 50, 52, 55, 58, 60, 62, 65];
    await stats.adddef(defenseValues);
    
    // Add max HP values for types 1-25
    const maxHpValues = [0, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250, 260, 270, 280, 290, 300, 310, 320, 330, 340];
    await stats.addmaxhp(maxHpValues);
    
    console.log("Stats initialized with test data");

    // Deploy PEPURGE contract
    console.log("\n--- Deploying PEPURGE Contract ---");
    const PEPURGE = await ethers.getContractFactory("contracts/tmp/pepurgewiz_v2.sol:PEPURGE");
    const pepurge = await PEPURGE.deploy(
        await deployer.getAddress(), // royalty receiver
        250, // 2.5% royalty (250/10000)
        "Pepurge", // name
        "PPG" // symbol
    );
    await pepurge.waitForDeployment();
    console.log("PEPURGE deployed to:", await pepurge.getAddress());

    // Set the Stats contract address
    console.log("\n--- Setting Stats Contract ---");
    await pepurge.setCon(await stats.getAddress());
    console.log("Stats contract set successfully");

    // Get mint price
    const mintPrice = ethers.parseEther("0.00025");
    
    console.log("Mint price:", mintPrice, "ETH");

    // Mint 5 tokens
    console.log("\n--- Minting 5 Tokens ---");
    for (let i = 1; i <= 5; i++) {
        console.log(`Minting token ${i}...`);
        const tx = await pepurge.mint({ value: mintPrice });
        await tx.wait();
        console.log(`Token ${i} minted successfully`);
    }

    // Get second signer for additional minting
    const [, secondSigner] = await ethers.getSigners();
    console.log("\n--- Minting 3 tokens with second address ---");
    console.log("Second address:", await secondSigner.getAddress());
    
    // Mint 3 tokens with second address
    for (let i = 1; i <= 3; i++) {
        console.log(`Minting token ${i} with second address...`);
        const tx = await pepurge.connect(secondSigner).mint({ value: mintPrice });
        await tx.wait();
        console.log(`Token ${i} minted successfully with second address`);
    }

    // Get token URIs
    console.log("\n--- Token URIs ---");
    for (let i = 1; i <= 5; i++) {
        try {
            const tokenURI = await pepurge.tokenURI(i);
            console.log(`\nToken ${i} URI:`);
            
            // Decode base64 JSON
            const base64Data = tokenURI.replace("data:application/json;base64,", "");
            const jsonString = Buffer.from(base64Data, 'base64').toString('utf-8');
            const metadata = JSON.parse(jsonString);
            
            console.log("Name:", metadata.name);
            console.log("Description:", metadata.description);
            console.log("Image:", metadata.image);
            console.log("Attributes:", JSON.stringify(metadata.attributes, null, 2));
        } catch (error) {
            console.log(`Error getting tokenURI for token ${i}:`, error.message);
        }
    }

    // Call getOwnedPepurges
    console.log("\n--- Getting Owned Pepurges ---");
    try {
        const ownedPepurges = await pepurge.getOwnedPepurges(await deployer.getAddress());

        console.log("Owned Pepurges Data:");
        console.log("Token IDs:", ownedPepurges[0].map(id => id.toString()));
        console.log("Types:", ownedPepurges[1].map(type => type.toString()));
        console.log("HPs:", ownedPepurges[2].map(hp => hp.toString()));
        console.log("Hidden Status:", ownedPepurges[3]);
        console.log("Timestamps:", ownedPepurges[4].map(ts => ts.toString()));
        console.log("Attacks:", ownedPepurges[5].map(att => att.toString()));
        console.log("Defenses:", ownedPepurges[6].map(def => def.toString()));
        console.log("Max HPs:", ownedPepurges[7].map(maxHp => maxHp.toString()));
        
        // Format nicely
        console.log("\n--- Formatted Pepurge Data ---");
        for (let i = 0; i < ownedPepurges[0].length; i++) {
            console.log(`\nPepurge #${ownedPepurges[0][i]}:`);
            console.log(`  Type: ${ownedPepurges[1][i]}`);
            console.log(`  HP: ${ownedPepurges[2][i]}/${ownedPepurges[7][i]}`);
            console.log(`  Attack: ${ownedPepurges[5][i]}`);
            console.log(`  Defense: ${ownedPepurges[6][i]}`);
            console.log(`  Hidden: ${ownedPepurges[3][i]}`);
            console.log(`  Timestamp: ${ownedPepurges[4][i]}`);
        }
        
    } catch (error) {
        console.log("Error getting owned pepurges:", error.message);
    }

    // Call aliveAndNotHiddenPepes
    console.log("\n--- Getting Alive and Not Hidden Pepes ---");
    try {
        const aliveTokens = await pepurge.aliveAndNotHiddenPepes();
        
        console.log("Alive and Not Hidden Pepes Data:");
        console.log("Token IDs:", aliveTokens[0].map(id => id.toString()));
        console.log("Types:", aliveTokens[1].map(type => type.toString()));
        console.log("HPs:", aliveTokens[2].map(hp => hp.toString()));
        console.log("Timestamps:", aliveTokens[3].map(ts => ts.toString()));
        console.log("Attacks:", aliveTokens[4].map(att => att.toString()));
        console.log("Defenses:", aliveTokens[5].map(def => def.toString()));
        console.log("Max HPs:", aliveTokens[6].map(maxHp => maxHp.toString()));
        
        // Format nicely
        console.log("\n--- Formatted Alive Pepe Data ---");
        for (let i = 0; i < aliveTokens[0].length; i++) {
            const owner = await pepurge.ownerOf(aliveTokens[0][i]);
            console.log(`\nPepurge #${aliveTokens[0][i]}:`);
            console.log(`  Owner: ${owner}`);
            console.log(`  Type: ${aliveTokens[1][i]}`);
            console.log(`  HP: ${aliveTokens[2][i]}/${aliveTokens[6][i]}`);
            console.log(`  Attack: ${aliveTokens[4][i]}`);
            console.log(`  Defense: ${aliveTokens[5][i]}`);
            console.log(`  Timestamp: ${aliveTokens[3][i]}`);
        }
        
    } catch (error) {
        console.log("Error getting alive and not hidden pepes:", error.message);
    }

    console.log("\n--- Script completed successfully! ---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
