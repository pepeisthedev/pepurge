const { ethers } = require("hardhat");
const hre = require("hardhat");

async function main() {
    console.log("Starting PEPURGE deployment and testing...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", await deployer.getAddress());
    console.log("Account nonce:", await deployer.getNonce());
    console.log("Network:", await ethers.provider.getNetwork());
   
/*    const Stats = await ethers.getContractFactory("contracts/tmp/statsv2_v2.sol:Stats");
    const stats = await Stats.deploy();
    await stats.waitForDeployment();
    console.log("Stats deployed to:", await stats.getAddress());
    if (network.name !== "localhost") {
        const deploymentTx = stats.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for stats deployment...");
            await deploymentTx.wait(2);
        }
    }

    // Initialize Stats with some test data
    console.log("\n--- Initializing Stats with test data ---");
    
    // Add attack values for types 0-23 (24 total)
    const attackValues = [0,5,6,7,9,1,8,8,7,1,7,1,10,8,1,6,8,3,5,8,3,7,8,2];
    await (await stats.addMeta(attackValues)).wait(); // Wait for confirmation
    
    // Add defense values for types 0-23 (24 total)  
    const defenseValues = [0,5,4,8,3,2,6,5,3,1,2,1,7,5,1,8,6,5,5,5,4,4,3,3];
    await (await stats.adddef(defenseValues)).wait(); // Wait for confirmation
    
    // Add max HP values for types 0-23 (24 total)
    const maxHpValues = [0,7,7,10,5,5,7,8,5,3,4,5,6,7,5,10,7,7,7,7,6,6,7,5];
    await (await stats.addmaxhp(maxHpValues)).wait(); // Wait for confirmation
    
    console.log("Stats initialized with test data");

    // Debug: Check array lengths after initialization
   
*/
    // Deploy PEPURGE contract
    console.log("\n--- Deploying PEPURGE Contract ---");
    const PEPURGE = await ethers.getContractFactory("contracts/tmp/pepurgewizv4.sol:PEPURGE");
    const pepurge = await PEPURGE.deploy(
        await deployer.getAddress(), // royalty receiver
        1000, // 10% royalty (1000/10000)
        "Pepurge", // name
        "PPG" // symbol
    );
    await pepurge.waitForDeployment();
    if (network.name !== "localhost") {
        const deploymentTx = pepurge.deploymentTransaction();
        if (deploymentTx) {
            console.log("Waiting for pepurge deployment...");
            await deploymentTx.wait(2);
        }
    }
    console.log("PEPURGE deployed to:", await pepurge.getAddress());
    
    // Verify contracts on non-localhost networks
    if (network.name !== "localhost" && network.chainId !== 31337n) {
        console.log("\n--- Verifying Contracts ---");
        
        // Wait a bit for the contract to be indexed
        console.log("Waiting for contract indexing...");
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
        
        try {
            // Verify Stats contract
            console.log("Verifying Stats contract...");
            await hre.run("verify:verify", {
                address: await stats.getAddress(),
                constructorArguments: []
            });
            console.log("Stats contract verified!");
        } catch (error) {
            console.log("Stats verification failed:", error.message);
        }
        
        try {
            // Verify PEPURGE contract
            console.log("Verifying PEPURGE contract...");
            await hre.run("verify:verify", {
                address: await pepurge.getAddress(),
                constructorArguments: [
                    await deployer.getAddress(), // royaltyReceiver_
                    1000, // royaltyFeeNumerator_ (10%)
                    "Pepurge", // name_
                    "PPG" // symbol_
                ]
            });
            console.log("PEPURGE contract verified!");
        } catch (error) {
            console.log("PEPURGE verification failed:", error.message);
        }
    }
    
    // Set the Stats contract address
    console.log("\n--- Setting Stats Contract ---");
    await pepurge.setCon("0xe9096ec234e2D15f2Cf6bc6c9cbD8e8A1dc4bd45");
    console.log("Stats contract set successfully");
  
    // Debug contract state
    console.log("\n--- Contract State Debug ---");
    console.log("Mint price:", await pepurge.mintPrice());
    console.log("Supply:", await pepurge.supply());
    console.log("Current token counter:", await pepurge.totalMinted());
    
    console.log("Final nonce:", await deployer.getNonce());

    // Test totalMinted function
    console.log("\n--- Testing totalMinted function ---");
    const totalMinted = await pepurge.totalMinted();
    console.log("Total minted tokens:", totalMinted.toString());

    // Test minting
    console.log("\n--- Testing Mint Function ---");
    const mintPrice = await pepurge.mintPrice();
    console.log("Attempting to mint with price:", ethers.formatEther(mintPrice), "ETH");
    
   

    console.log("\n--- Script completed successfully! ---");}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
