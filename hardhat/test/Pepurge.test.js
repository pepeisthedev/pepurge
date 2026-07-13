const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("PEPURGE", function () {
    const PRICE = ethers.parseEther("0.01");
    const COOLDOWN = 3600;

    async function deployGame(
        collectionSize = 4,
        threshold = 1,
        cooldown = COOLDOWN,
    ) {
        const [deployer, alice, bob, carol, seaDrop] =
            await ethers.getSigners();
        const Stats = await ethers.getContractFactory("Stats");
        const stats = await Stats.deploy();
        const Renderer = await ethers.getContractFactory("PepurgeRenderer");
        const renderer = await Renderer.deploy(await stats.getAddress());
        const Game = await ethers.getContractFactory("TestablePEPURGE");
        const game = await Game.deploy(
            await stats.getAddress(),
            await renderer.getAddress(),
            collectionSize,
            PRICE,
            cooldown,
            threshold,
            [seaDrop.address],
        );
        return { game, stats, renderer, deployer, alice, bob, carol, seaDrop };
    }

    async function mint(game, signer, count) {
        for (let i = 0; i < count; i += 1) {
            await game.connect(signer).mint({ value: PRICE });
        }
    }

    async function killWithOneAttacker(game, signer, attackerId, targetId) {
        while ((await game.HP(targetId)) > 0n) {
            if ((await game.timestamp(attackerId)) !== 0n) {
                await time.increase(COOLDOWN);
            }
            await game.connect(signer).Attack([attackerId], targetId);
        }
    }

    it("sets 10% deployer royalties and the OpenSea enforcement validator", async function () {
        const { game, deployer } = await deployGame();
        const [receiver, royalty] = await game.royaltyInfo(1, 10_000);
        expect(receiver).to.equal(deployer.address);
        expect(royalty).to.equal(1_000);
        expect(await game.getTransferValidator()).to.equal(
            await game.STRICT_ROYALTY_VALIDATOR(),
        );
        expect(await game.deployerWallet()).to.equal(deployer.address);
    });

    it("supports SeaDrop minting and preserves dynamic metadata", async function () {
        const { game, alice, seaDrop } = await deployGame();
        await game.connect(seaDrop).mintSeaDrop(alice.address, 2);
        expect(await game.totalMinted()).to.equal(2);
        expect(await game.aliveCount()).to.equal(2);
        expect(await game.ownerOf(1)).to.equal(alice.address);

        const tokenUri = await game.tokenURI(1);
        const metadata = JSON.parse(
            Buffer.from(tokenUri.split(",")[1], "base64").toString("utf8"),
        );
        expect(metadata.name).to.equal("Pepurge #1");
        expect(metadata.attributes).to.have.length(5);
    });

    it("refuses activation until all owner and player allocations are funded", async function () {
        const { game, deployer, alice, seaDrop } = await deployGame();
        await game.connect(seaDrop).mintSeaDrop(alice.address, 4);

        await expect(game.activateGame())
            .to.be.revertedWithCustomError(game, "InsufficientReserve");
        await deployer.sendTransaction({
            to: await game.getAddress(),
            value: PRICE * 4n,
        });
        await expect(game.activateGame()).to.emit(game, "GameActivated");
    });

    it("lets the owner cap an undersubscribed collection before activation", async function () {
        const { game, deployer, alice } = await deployGame(8, 1);
        await mint(game, alice, 4);

        await expect(game.connect(alice).Attack([1], 2))
            .to.be.revertedWithCustomError(game, "GameNotActivated");
        await expect(game.activateGame())
            .to.be.revertedWithCustomError(game, "CollectionStillMinting");

        await expect(game.setSupplyToMinted())
            .to.emit(game, "MaxSupplyUpdated")
            .withArgs(4);
        expect(await game.collectionSize()).to.equal(4);
        expect(await game.maxSupply()).to.equal(4);

        const gross = PRICE * 4n;
        const deployerShare = gross / 5n;
        const playerReserve = (gross * 4n) / 5n;
        await expect(game.activateGame())
            .to.emit(game, "GameActivated")
            .withArgs(4, deployerShare, playerReserve);
        expect(await game.gameActivated()).to.equal(true);
        expect(await game.owner()).to.equal(ethers.ZeroAddress);
        expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
            playerReserve,
        );
        await expect(game.setSupplyToMinted())
            .to.be.revertedWithCustomError(game, "OnlyOwner");
        await expect(game.connect(alice).mint({ value: PRICE }))
            .to.be.revertedWithCustomError(game, "MintQuantityExceedsMaxSupply");
    });

    it("refuses activation if the fixed royalty configuration was changed", async function () {
        const { game, alice } = await deployGame();
        await mint(game, alice, 4);
        await game.setRoyaltyInfo({
            royaltyAddress: alice.address,
            royaltyBps: 500,
        });

        await expect(game.activateGame())
            .to.be.revertedWithCustomError(game, "InvalidConfiguration");
    });

    it("automatically exposes a manually hidden token at its fixed expiry", async function () {
        const { game, alice, bob } = await deployGame();
        await mint(game, alice, 2);
        await mint(game, bob, 2);
        await game.activateGame();
        await game.setForcedRandom(0);

        await expect(game.connect(bob).Hide(3))
            .to.emit(game, "HideAttempt")
            .withArgs(3, bob.address, true, anyValue, 0);
        expect(await game.isHidden(3)).to.equal(true);
        await expect(game.connect(alice).Attack([1], 3))
            .to.be.revertedWithCustomError(game, "PepurgeHidden");

        await time.increase(COOLDOWN);
        expect(await game.isHidden(3)).to.equal(false);
        await expect(game.connect(alice).Attack([1], 3)).to.emit(
            game,
            "AttackResult",
        );
    });

    it("allows zero cooldown only for localhost test games", async function () {
        const { game, alice, bob } = await deployGame(4, 1, 0);
        await mint(game, alice, 1);
        await mint(game, bob, 3);
        await game.activateGame();
        await game.setForcedRandom(0);

        await game.connect(alice).Hide(1);
        expect(await game.isHidden(1)).to.equal(false);
        await expect(game.connect(alice).Hide(1)).to.emit(game, "HideAttempt");
    });

    it("combines unique owned attackers and blocks invalid combat states", async function () {
        const { game, alice, bob } = await deployGame();
        await mint(game, alice, 2);
        await mint(game, bob, 2);
        await game.activateGame();

        await expect(game.connect(alice).Attack([], 3))
            .to.be.revertedWithCustomError(game, "EmptyAttackGroup");
        await expect(game.connect(alice).Attack([1, 1], 3))
            .to.be.revertedWithCustomError(game, "DuplicateAttacker")
            .withArgs(1);
        await expect(game.connect(alice).Attack([1], 2))
            .to.be.revertedWithCustomError(game, "OwnTokenTarget")
            .withArgs(2);
        await expect(game.connect(alice).Attack([3], 4))
            .to.be.revertedWithCustomError(game, "NotTokenOwner")
            .withArgs(3);

        await expect(game.connect(alice).Attack([1, 2], 3))
            .to.emit(game, "AttackResult")
            .withArgs(alice.address, 3, [1, 2], 4, 7, 3, false);
    });

    it("auto-hides one random attacker for an early-phase kill", async function () {
        const { game, alice, bob } = await deployGame(8, 1);
        await mint(game, alice, 4);
        await mint(game, bob, 4);
        await game.activateGame();
        await game.setForcedRandom(2);

        await expect(game.connect(alice).Attack([1, 2, 3, 4], 5))
            .to.emit(game, "AutoHideReward")
            .withArgs(3, anyValue);
        expect(await game.aliveCount()).to.equal(7);
        expect(await game.isHidden(3)).to.equal(true);
        expect(await game.pendingRewards(alice.address)).to.equal(0);
    });

    it("allocates 20% to the deployer and 40% each to kills and winners", async function () {
        const { game, alice, bob } = await deployGame();
        await mint(game, alice, 1);
        await mint(game, bob, 3);

        const gross = PRICE * 4n;
        const deployerShare = gross / 5n;
        const killPool = (gross * 2n) / 5n;
        const winnerPool = (gross * 2n) / 5n;
        await game.activateGame();
        expect(await game.winnerReward()).to.equal(winnerPool);
        expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(
            killPool + winnerPool,
        );
        expect(await game.requiredReserve()).to.equal(killPool + winnerPool);

        await killWithOneAttacker(game, alice, 1, 2);
        expect(await game.pendingRewards(alice.address)).to.equal(0);
        await killWithOneAttacker(game, alice, 1, 3);
        expect(await game.pendingRewards(alice.address)).to.equal(0);
        await killWithOneAttacker(game, alice, 1, 4);

        expect(await game.aliveCount()).to.equal(1);
        expect(await game.pendingRewards(alice.address)).to.equal(killPool);
        await game.connect(alice).cashIn(1);
        expect(await game.pendingRewards(alice.address)).to.equal(
            killPool + winnerPool,
        );
        expect(await game.requiredReserve()).to.equal(killPool + winnerPool);
        await game.connect(alice).claimRewards();
        expect(await ethers.provider.getBalance(await game.getAddress())).to.equal(0);
        expect(deployerShare + killPool + winnerPool).to.equal(gross);
    });

    it("disables inherited direct burns that would desync aliveCount", async function () {
        const { game, alice } = await deployGame();
        await mint(game, alice, 1);
        await expect(game.connect(alice).burn(1))
            .to.be.revertedWithCustomError(game, "DirectBurnDisabled");
        expect(await game.aliveCount()).to.equal(1);
    });

    it("covers every random value exactly once and keeps balanced ceilings", async function () {
        const { stats } = await deployGame();
        const counts = Array(24).fill(0);
        for (let random = 0; random < 10_000; random += 1) {
            counts[Number(await stats.assignType(random))] += 1;
        }
        expect(counts.slice(1).reduce((sum, count) => sum + count, 0)).to.equal(
            10_000,
        );
        expect(counts[23]).to.equal(500);

        for (let type = 1; type <= 23; type += 1) {
            expect(await stats.attRead(type)).to.be.at.most(8);
            expect(await stats.defRead(type)).to.be.at.most(7);
            expect(await stats.maxhpRead(type)).to.be.at.most(8);
        }
    });
});
