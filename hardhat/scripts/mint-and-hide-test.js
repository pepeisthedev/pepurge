const { ethers } = require("hardhat");

async function main() {
    console.log("Starting mint and hide test script...");
    
    // Get deployer (owner) and minter for localhost
    const [deployer, minter] = await ethers.getSigners();
    console.log("Deployer address:", await deployer.getAddress());
    console.log("Minter address:", await minter.getAddress());

    // Deploy contracts first
    console.log("\n--- Deploying Contracts ---");
    
    // Deploy Stats
    const Stats = await ethers.getContractFactory("contracts/tmp/statsv2_v2.sol:Stats");
    const stats = await Stats.deploy();
    await stats.waitForDeployment();
    console.log("Stats deployed to:", await stats.getAddress());

    // Initialize Stats with test data
    const attackValues = [0,5,6,7,9,1,8,8,7,1,7,1,10,8,1,6,8,3,5,8,3,7,8,2];
    await stats.addMeta(attackValues);
    const defenseValues = [0,5,4,8,3,2,6,5,3,1,2,1,7,5,1,8,6,5,5,5,4,4,3,3];
    await stats.adddef(defenseValues);
    const maxHpValues = [0,7,7,10,5,5,7,8,5,3,4,5,6,7,5,10,7,7,7,7,6,6,7,5];
    await stats.addmaxhp(maxHpValues);

    // Deploy PEPURGE
    const PEPURGE = await ethers.getContractFactory("contracts/tmp/pepurgewizv4.sol:SMARTYPANTS");
    const pepurge = await PEPURGE.deploy(
        await deployer.getAddress(),
        250,
        "Pepurge",
        "PPG"
    );
    await pepurge.waitForDeployment();
    console.log("PEPURGE deployed to:", await pepurge.getAddress());

    // Set Stats contract
    await pepurge.setCon(await stats.getAddress());
    console.log("Stats contract set");

    const pepurgeAsOwner = pepurge.connect(deployer);
    const pepurgeAsWallet = pepurge.connect(minter);

    // Modify settings to allow hiding
    console.log("\n--- Modifying Settings to Allow Hide ---");
    const mintPrice = ethers.parseEther("0.00005");
    
    await pepurgeAsOwner.setting1(
        10, // supply = 0 to allow hiding
        mintPrice,
        "ipfs://bafybeihbso5n53jblaianewxlwtyg75cszy5aqbfu7fa3otvurzbzprdmi/",
        43200, // coolDown
        10, // whenCollect
        10000 // collect
    );
    console.log("Settings updated to allow hiding");

    // Mint tokens
    console.log("\n--- Minting Tokens ---");
    const tokensToMint = 10;
    let mintedTokens = [];
    
    for (let i = 1; i <= tokensToMint; i++) {
        try {
            console.log(`Minting token ${i}...`);
            const totalBefore = await pepurgeAsWallet.totalMinted();
            const newTokenId = totalBefore;
            
            const estimatedGas = await pepurgeAsWallet.mint.estimateGas({ value: mintPrice });
            const gasLimit = estimatedGas * 120n / 100n;
            
            const tx = await pepurgeAsWallet.mint({ 
                value: mintPrice,
                gasLimit: gasLimit
            });
            const receipt = await tx.wait();
            
            console.log(`  Token ${newTokenId} minted in block ${receipt.blockNumber}`);
            mintedTokens.push(newTokenId);
            
        } catch (error) {
            console.log(`  Mint ${i} failed:`, error.message);
            break;
        }
    }

    // Test Hide function on each minted token
    console.log("\n--- Testing Hide Function ---");
    let hideResults = [];
    
    for (const tokenId of mintedTokens) {
        try {
            console.log(`Testing Hide on token ${tokenId}...`);
            
            const tx = await pepurgeAsWallet.Hide(tokenId, {
                gasLimit: 150000
            });
            const receipt = await tx.wait();
            
            // Look for HideAttempt event
            const hideEvent = receipt.logs.find(log => {
                try {
                    const parsed = pepurgeAsWallet.interface.parseLog(log);
                    return parsed.name === "HideAttempt";
                } catch {
                    return false;
                }
            });
            
            if (hideEvent) {
                const parsed = pepurgeAsWallet.interface.parseLog(hideEvent);
                const success = parsed.args.success;
                console.log(`  Token ${tokenId} hide result: ${success ? "SUCCESS" : "FAILED"}`);
                hideResults.push({ tokenId, success });
            } else {
                console.log(`  Token ${tokenId} hide event not found`);
                hideResults.push({ tokenId, success: false });
            }
            
        } catch (error) {
            console.log(`  Hide failed for token ${tokenId}:`, error.message);
            hideResults.push({ tokenId, success: false, error: error.message });
        }
    }

    // Summary
    console.log("\n--- HIDE TEST SUMMARY ---");
    const successCount = hideResults.filter(r => r.success).length;
    const failCount = hideResults.filter(r => !r.success).length;
    
    console.log(`Total tokens tested: ${hideResults.length}`);
    console.log(`Successful hides: ${successCount}`);
    console.log(`Failed hides: ${failCount}`);
    console.log(`Success rate: ${((successCount / hideResults.length) * 100).toFixed(2)}%`);
    
    console.log("\nDetailed results:");
    hideResults.forEach(result => {
        console.log(`  Token ${result.tokenId}: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}${result.error ? ` (${result.error})` : ""}`);
    });

    console.log("\n--- Script completed! ---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

