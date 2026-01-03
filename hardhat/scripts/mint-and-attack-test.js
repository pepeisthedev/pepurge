const { ethers } = require("hardhat");

async function main() {
    console.log("Starting mint and attack test script...");
    
    // Get deployer (owner) and victim for localhost
    const [deployer, victim] = await ethers.getSigners();
    console.log("Deployer (attacker) address:", await deployer.getAddress());
    console.log("Victim address:", await victim.getAddress());

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
    const pepurgeAsVictim = pepurge.connect(victim);

    // Set settings for attacks (supply = 20, collect >= whenCollect)
    console.log("\n--- Setting Attack Configurations ---");
    const mintPrice = ethers.parseEther("0.00005");
    
    await pepurgeAsOwner.setting1(
        20, // supply = 20 total tokens
        mintPrice,
        "ipfs://bafybeihbso5n53jblaianewxlwtyg75cszy5aqbfu7fa3otvurzbzprdmi/",
        0, // coolDown = 0 for testing
        10, // whenCollect
        10000 // collect >= whenCollect allows attacks
    );
    console.log("Settings configured for attacks");

    // Mint 10 tokens with deployer
    console.log("\n--- Minting 10 Tokens with Deployer (Attacker) ---");
    let attackerTokens = [];
    
    for (let i = 1; i <= 10; i++) {
        try {
            const totalBefore = await pepurgeAsOwner.totalMinted();
            const newTokenId = totalBefore;
            
            const tx = await pepurgeAsOwner.mint({ value: mintPrice });
            await tx.wait();
            
            console.log(`  Attacker token ${newTokenId} minted`);
            attackerTokens.push(newTokenId);
            
        } catch (error) {
            console.log(`  Attacker mint ${i} failed:`, error.message);
            break;
        }
    }

    // Mint 10 tokens with victim
    console.log("\n--- Minting 10 Tokens with Victim ---");
    let victimTokens = [];
    
    for (let i = 1; i <= 10; i++) {
        try {
            const totalBefore = await pepurgeAsVictim.totalMinted();
            const newTokenId = totalBefore;
            
            const tx = await pepurgeAsVictim.mint({ value: mintPrice });
            await tx.wait();
            
            console.log(`  Victim token ${newTokenId} minted`);
            victimTokens.push(newTokenId);
            
        } catch (error) {
            console.log(`  Victim mint ${i} failed:`, error.message);
            break;
        }
    }

    // Test Attack function - each attacker token attacks a victim token
    console.log("\n--- Testing Attack Function ---");
    let attackResults = [];
    
    for (let i = 0; i < Math.min(attackerTokens.length, victimTokens.length); i++) {
        const attackerToken = attackerTokens[i];
        const victimToken = victimTokens[i];
        
        try {
            console.log(`Testing Attack: Token ${attackerToken} attacking Token ${victimToken}...`);
            
            // Get stats before attack for display
            const attackerType = await pepurge.pepeType(attackerToken);
            const victimType = await pepurge.pepeType(victimToken);
            const attackPower = await stats.attRead(attackerType);
            const defensePower = await stats.defRead(victimType);
            
            console.log(`  Attacker Type ${attackerType} (ATT: ${attackPower}) vs Victim Type ${victimType} (DEF: ${defensePower})`);
            
            const tx = await pepurgeAsOwner.Attack(attackerToken, victimToken, {
                gasLimit: 200000
            });
            const receipt = await tx.wait();
            
            // Look for AttackResult event
            const attackEvent = receipt.logs.find(log => {
                try {
                    const parsed = pepurgeAsOwner.interface.parseLog(log);
                    return parsed.name === "AttackResult";
                } catch {
                    return false;
                }
            });
            
            if (attackEvent) {
                const parsed = pepurgeAsOwner.interface.parseLog(attackEvent);
                const { damage, victimHPBefore, victimHPAfter, killed } = parsed.args;
                
                console.log(`  Victim HP: ${victimHPBefore} → ${victimHPAfter} (${damage} damage)`);
                console.log(`  Attack successful! Killed: ${killed}`);
                
                attackResults.push({ 
                    attackerToken, 
                    victimToken, 
                    damage: damage.toString(),
                    victimHPBefore: victimHPBefore.toString(),
                    victimHPAfter: victimHPAfter.toString(),
                    killed,
                    success: true 
                });
            } else {
                console.log(`  Attack event not found`);
                attackResults.push({ 
                    attackerToken, 
                    victimToken, 
                    success: false, 
                    error: "Event not found" 
                });
            }
            
        } catch (error) {
            console.log(`  Attack failed: ${error.message}`);
            attackResults.push({ 
                attackerToken, 
                victimToken, 
                success: false, 
                error: error.message 
            });
        }
    }

    // Summary
    console.log("\n--- ATTACK TEST SUMMARY ---");
    const successCount = attackResults.filter(r => r.success).length;
    const failCount = attackResults.filter(r => !r.success).length;
    const killCount = attackResults.filter(r => r.success && r.killed).length;
    
    console.log(`Total attacks attempted: ${attackResults.length}`);
    console.log(`Successful attacks: ${successCount}`);
    console.log(`Failed attacks: ${failCount}`);
    console.log(`Tokens killed: ${killCount}`);
    console.log(`Attack success rate: ${((successCount / attackResults.length) * 100).toFixed(2)}%`);
    console.log(`Kill rate: ${killCount > 0 ? ((killCount / successCount) * 100).toFixed(2) : 0}%`);
    
    console.log("\nDetailed results:");
    attackResults.forEach(result => {
        if (result.success) {
            console.log(`  Token ${result.attackerToken} → Token ${result.victimToken}: ✅ ${result.damage} damage (${result.victimHPBefore}→${result.victimHPAfter})${result.killed ? " (KILLED)" : ""}`);
        } else {
            console.log(`  Token ${result.attackerToken} → Token ${result.victimToken}: ❌ FAILED (${result.error})`);
        }
    });

    console.log("\n--- Script completed! ---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
