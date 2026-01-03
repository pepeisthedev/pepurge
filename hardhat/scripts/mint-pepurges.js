const { ethers } = require("hardhat");

async function main() {
    console.log("Starting Pepurge minting script...");
    
    // For Sepolia/Base, use the wallet from private key
    let minter;
    const network = await ethers.provider.getNetwork();
    console.log("Network:", network.name, "Chain ID:", network.chainId);
    
    if (network.chainId === 8453n || network.chainId === 84532n) { // Base mainnet or Base Sepolia
        // Use the private key from hardhat config
        const privateKey = process.env.BASE_SEPOLIA_PRIVATE_KEY;
        if (!privateKey) {
            throw new Error("BASE_SEPOLIA_PRIVATE_KEY not found in environment variables");
        }
        minter = new ethers.Wallet(privateKey, ethers.provider);
        console.log("Using wallet from private key");
    } else {
        // For localhost, use second signer
        const [deployer, localMinter] = await ethers.getSigners();
        minter = localMinter;
        console.log("Using local signer");
    }
    
    console.log("Minter address:", await minter.getAddress());
    console.log("Minter balance:", ethers.formatEther(await ethers.provider.getBalance(minter.address)), "ETH");

    // Contract addresses (update these with your deployed contract addresses)
    const PEPURGE_ADDRESS = "0x83e821A0828a153cF948bf59b9A24599EdA34C8c" // Update for each network
    // Connect to deployed contract with minter wallet
    const PEPURGE = await ethers.getContractAt("contracts/tmp/pepurgewizv4.sol:PEPURGE", PEPURGE_ADDRESS);
    const pepurge = PEPURGE.connect(minter);

    // Debug contract state before minting
    console.log("\n--- Contract State Debug ---");
    try {
        const mintPrice = await pepurge.mintPrice();
        const supply = await pepurge.supply();
        const totalMinted = await pepurge.totalMinted();
        
        console.log("Mint price:", ethers.formatEther(mintPrice), "ETH");
        console.log("Supply:", supply.toString());
        console.log("Total minted:", totalMinted.toString());
        console.log("Remaining supply:", (supply - totalMinted).toString());
        
        // Check if we have enough balance
        const minterBalance = await ethers.provider.getBalance(minter.address);
        console.log("Required for mint:", ethers.formatEther(mintPrice), "ETH");
        console.log("Minter balance:", ethers.formatEther(minterBalance), "ETH");
        console.log("Can afford mint:", minterBalance >= mintPrice);
        
    } catch (error) {
        console.log("Error checking contract state:", error.message);
        return;
    }

    // Mint 10 tokens
    console.log("\n--- Minting 10 Pepurges ---");
    let successfulMints = 0;
    let failedMints = 0;
    let typeCount = {}; // Track count of each type
    
    for (let i = 1; i <= 20; i++) {
        try {
            console.log(`Minting token ${i}/20...`);
            const mintPrice = await pepurge.mintPrice();
            
            // Get total minted before transaction to know the new token ID
            const totalBeforeMint = await pepurge.totalMinted();
            const newTokenId = totalBeforeMint; // Next token ID will be current total
            
            // Estimate gas and add buffer
            const estimatedGas = await pepurge.mint.estimateGas({ value: mintPrice });
            const gasLimit = estimatedGas * 120n / 100n; // Add 20% buffer
            
            const tx = await pepurge.mint({ 
                value: mintPrice,
                gasLimit: gasLimit
            });
            console.log(`  Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`  Confirmed in block: ${receipt.blockNumber}`);
            
            // Get current total minted
            const newTotalMinted = await pepurge.totalMinted();
            console.log(`  Total minted now: ${newTotalMinted.toString()}`);
            
            // Get the type of the newly minted token
            const tokenType = await pepurge.pepeType(newTokenId);
            console.log(`  Token ${newTokenId} is type: ${tokenType.toString()}`);
            
            // Debug: Check if this type has valid stats
            if (tokenType.toString() === "0") {
                console.log(`  ⚠️  WARNING: Token has type 0 - this should not happen!`);
            }
            
            // Track type count
            const typeStr = tokenType.toString();
            typeCount[typeStr] = (typeCount[typeStr] || 0) + 1;
            
            successfulMints++;
            
        } catch (error) {
            console.log(`  Mint ${i} failed:`, error.message);
            failedMints++;
            break;
        }
    }

    // Summary
    console.log("\n--- MINT SUMMARY ---");
    console.log(`✅ Successful mints: ${successfulMints}`);
    console.log(`❌ Failed mints: ${failedMints}`);
    console.log(`📊 Success rate: ${((successfulMints / (successfulMints + failedMints)) * 100).toFixed(2)}%`);
    
    if (successfulMints > 0) {
        const finalBalance = await pepurge.balanceOf(minter.address);
        console.log(`🏆 Minter now owns: ${finalBalance.toString()} tokens`);
        
        // Print type distribution
        console.log("\n--- TYPE DISTRIBUTION ---");
        const sortedTypes = Object.keys(typeCount).sort((a, b) => parseInt(a) - parseInt(b));
        for (const type of sortedTypes) {
            const count = typeCount[type];
            const percentage = ((count / successfulMints) * 100).toFixed(2);
            console.log(`Type ${type}: ${count} tokens (${percentage}%)`);
        }
    }

    console.log("\n--- Minting script completed! ---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
