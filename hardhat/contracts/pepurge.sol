// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {ERC721SeaDrop} from "seadrop/ERC721SeaDrop.sol";

interface IPepurgeStats {
    function attRead(uint256 pepeType) external view returns (uint256);

    function defRead(uint256 pepeType) external view returns (uint256);

    function maxhpRead(uint256 pepeType) external view returns (uint256);

    function assignType(uint256 random) external pure returns (uint256);
}

interface IPepurgeRenderer {
    function tokenURI(
        uint256 tokenId,
        uint256 tokenType,
        uint256 hp
    ) external view returns (string memory);
}

contract PEPURGE is ERC721SeaDrop {
    address public constant STRICT_ROYALTY_VALIDATOR =
        0xA000027A9B2802E1ddf7000061001e5c005A0000;
    uint96 private constant ROYALTY_BPS = 1_000;
    uint256 private constant MAX_ATTACKERS = 20;
    uint256 private constant HIDE_HEAL = 2;

    IPepurgeStats public immutable stats;
    IPepurgeRenderer public immutable renderer;
    address public immutable deployerWallet;
    uint256 public collectionSize;
    uint256 public immutable mintPrice;
    uint256 public immutable coolDown;
    uint256 public immutable endGameThreshold;

    uint256 public aliveCount;
    uint256 private _randomNonce;
    bool private _gameBurn;
    bool public gameActivated;
    uint256 public totalPendingRewards;

    mapping(uint256 => uint256) public pepeType;
    mapping(uint256 => uint256) public HP;
    mapping(uint256 => uint256) public hiddenUntil;
    mapping(uint256 => uint256) public timestamp;
    mapping(address => uint256) public pendingRewards;

    struct PepurgeView {
        uint256 tokenId;
        address tokenOwner;
        uint256 pepeType;
        uint256 hp;
        uint256 lastActionAt;
        uint256 hiddenUntil;
        uint256 attack;
        uint256 defense;
        uint256 maxHp;
    }

    error CollectionStillMinting();
    error DirectBurnDisabled();
    error DuplicateAttacker(uint256 tokenId);
    error EmptyAttackGroup();
    error GameAlreadyActivated();
    error GameIsOver();
    error GameNotActivated();
    error GameStillRunning();
    error InsufficientReserve();
    error InvalidConfiguration();
    error InvalidMintPayment();
    error InvalidPageSize();
    error NoRewardAvailable();
    error NotTokenOwner(uint256 tokenId);
    error OwnTokenTarget(uint256 tokenId);
    error PepurgeHidden(uint256 tokenId);
    error PepurgeOnCooldown(uint256 tokenId);
    error RewardTransferFailed();
    error TooManyAttackers();

    event AttackResult(
        address indexed attacker,
        uint256 indexed victimTokenId,
        uint256[] attackerTokenIds,
        uint256 damage,
        uint256 victimHPBefore,
        uint256 victimHPAfter,
        bool killed
    );
    event AutoHideReward(uint256 indexed tokenId, uint256 hiddenUntil);
    event CashIn(
        uint256 indexed tokenId,
        address indexed tokenOwner,
        uint256 reward
    );
    event HideAttempt(
        uint256 indexed tokenId,
        address indexed tokenOwner,
        bool success,
        uint256 hiddenUntil,
        uint256 healed
    );
    event GameActivated(
        uint256 collectionSize,
        uint256 deployerShare,
        uint256 playerReserve
    );
    event MetadataUpdate(uint256 indexed tokenId);
    event RewardClaimed(address indexed account, uint256 amount);
    event RewardCredited(address indexed account, uint256 amount);
    event TokenMinted(
        uint256 indexed tokenId,
        uint256 indexed pepeType,
        uint256 attack,
        uint256 defense,
        uint256 maxHP
    );

    constructor(
        address stats_,
        address renderer_,
        uint256 collectionSize_,
        uint256 mintPrice_,
        uint256 coolDown_,
        uint256 endGameThreshold_,
        address[] memory allowedSeaDrop
    ) ERC721SeaDrop("Pepurge", "PPG", allowedSeaDrop) {
        if (
            stats_ == address(0) ||
            stats_.code.length == 0 ||
            renderer_ == address(0) ||
            renderer_.code.length == 0 ||
            collectionSize_ == 0 ||
            mintPrice_ == 0 ||
            (coolDown_ == 0 && block.chainid != 31_337) ||
            endGameThreshold_ == 0 ||
            endGameThreshold_ >= collectionSize_ ||
            collectionSize_ / 4 < endGameThreshold_ ||
            mintPrice_ < 2 ||
            allowedSeaDrop.length != 1 ||
            allowedSeaDrop[0] == address(0)
        ) revert InvalidConfiguration();

        stats = IPepurgeStats(stats_);
        renderer = IPepurgeRenderer(renderer_);
        deployerWallet = msg.sender;
        collectionSize = collectionSize_;
        mintPrice = mintPrice_;
        coolDown = coolDown_;
        endGameThreshold = endGameThreshold_;
        _maxSupply = collectionSize_;

        _royaltyInfo = RoyaltyInfo({
            royaltyAddress: msg.sender,
            royaltyBps: ROYALTY_BPS
        });
        emit MaxSupplyUpdated(collectionSize_);
        emit RoyaltyInfoUpdated(msg.sender, ROYALTY_BPS);

        _setTransferValidator(STRICT_ROYALTY_VALIDATOR);
    }

    receive() external payable {}

    function mint() external payable nonReentrant {
        if (msg.value != mintPrice) revert InvalidMintPayment();
        _mintPepurges(msg.sender, 1);
    }

    function mintSeaDrop(
        address minter,
        uint256 quantity
    ) external override nonReentrant {
        _onlyAllowedSeaDrop(msg.sender);
        _mintPepurges(minter, quantity);
    }

    function _mintPepurges(address minter, uint256 quantity) internal {
        uint256 newTotalMinted = _totalMinted() + quantity;
        if (newTotalMinted > collectionSize) {
            revert MintQuantityExceedsMaxSupply(
                newTotalMinted,
                collectionSize
            );
        }

        uint256 firstTokenId = _nextTokenId();
        for (uint256 i; i < quantity; ) {
            uint256 tokenId = firstTokenId + i;
            uint256 assignedType = stats.assignType(
                _random(10_000, minter, tokenId)
            );
            uint256 maxHp = stats.maxhpRead(assignedType);

            pepeType[tokenId] = assignedType;
            HP[tokenId] = maxHp;
            emit TokenMinted(
                tokenId,
                assignedType,
                stats.attRead(assignedType),
                stats.defRead(assignedType),
                maxHp
            );

            unchecked {
                ++i;
            }
        }

        aliveCount += quantity;
        _safeMint(minter, quantity);
    }

    function setSupplyToMinted() external onlyOwner {
        if (gameActivated) revert GameAlreadyActivated();
        uint256 minted = _totalMinted();
        if (minted / 4 < endGameThreshold) revert InvalidConfiguration();

        collectionSize = minted;
        _maxSupply = minted;
        emit MaxSupplyUpdated(minted);
    }

    function activateGame() external onlyOwner nonReentrant {
        if (gameActivated) revert GameAlreadyActivated();
        if (_totalMinted() != collectionSize) revert CollectionStillMinting();
        if (
            _royaltyInfo.royaltyAddress != deployerWallet ||
            _royaltyInfo.royaltyBps != ROYALTY_BPS ||
            _transferValidator != STRICT_ROYALTY_VALIDATOR
        ) revert InvalidConfiguration();

        uint256 playerReserve = requiredReserve();
        uint256 deployerShare = (mintPrice * collectionSize) / 5;
        if (address(this).balance < playerReserve + deployerShare) {
            revert InsufficientReserve();
        }

        gameActivated = true;
        (bool success, ) = payable(deployerWallet).call{
            value: deployerShare
        }("");
        if (!success) revert RewardTransferFailed();

        _transferOwnership(address(0));
        emit GameActivated(collectionSize, deployerShare, playerReserve);
    }

    function Attack(
        uint256[] calldata yourTokenIds,
        uint256 victimTokenId
    ) external nonReentrant {
        _requireGameRunning();

        uint256 attackerCount = yourTokenIds.length;
        if (attackerCount == 0) revert EmptyAttackGroup();
        if (attackerCount > MAX_ATTACKERS) revert TooManyAttackers();

        address victimOwner = ownerOf(victimTokenId);
        if (victimOwner == msg.sender) revert OwnTokenTarget(victimTokenId);
        if (isHidden(victimTokenId)) revert PepurgeHidden(victimTokenId);

        uint256 victimHPBefore = HP[victimTokenId];
        uint256 defensePower = stats.defRead(pepeType[victimTokenId]);
        uint256 totalDamage;

        for (uint256 i; i < attackerCount; ) {
            uint256 attackerTokenId = yourTokenIds[i];
            if (ownerOf(attackerTokenId) != msg.sender) {
                revert NotTokenOwner(attackerTokenId);
            }
            for (uint256 j; j < i; ) {
                if (yourTokenIds[j] == attackerTokenId) {
                    revert DuplicateAttacker(attackerTokenId);
                }
                unchecked {
                    ++j;
                }
            }
            if (!_canAct(attackerTokenId)) {
                revert PepurgeOnCooldown(attackerTokenId);
            }

            uint256 attackPower = stats.attRead(pepeType[attackerTokenId]);
            uint256 damage = attackPower + 2 > defensePower
                ? attackPower + 2 - defensePower
                : 1;
            totalDamage += damage;
            timestamp[attackerTokenId] = block.timestamp;
            hiddenUntil[attackerTokenId] = 0;

            unchecked {
                ++i;
            }
        }

        uint256 appliedDamage = totalDamage > victimHPBefore
            ? victimHPBefore
            : totalDamage;
        uint256 victimHPAfter = victimHPBefore - appliedDamage;
        bool killed = victimHPAfter == 0;
        HP[victimTokenId] = victimHPAfter;
        hiddenUntil[victimTokenId] = 0;

        if (killed) {
            _gameBurn = true;
            _burn(victimTokenId);
            _gameBurn = false;
            unchecked {
                --aliveCount;
            }
            if (aliveCount <= collectionSize / 4) {
                _creditReward(msg.sender, _killReward());
            } else {
                uint256 hiddenAttacker = yourTokenIds[
                    _random(attackerCount, msg.sender, victimTokenId)
                ];
                hiddenUntil[hiddenAttacker] = block.timestamp + coolDown;
                emit AutoHideReward(
                    hiddenAttacker,
                    hiddenUntil[hiddenAttacker]
                );
            }
        } else {
            emit MetadataUpdate(victimTokenId);
        }

        emit AttackResult(
            msg.sender,
            victimTokenId,
            yourTokenIds,
            appliedDamage,
            victimHPBefore,
            victimHPAfter,
            killed
        );
    }

    function Hide(uint256 yourTokenId) external nonReentrant {
        _requireGameRunning();
        if (ownerOf(yourTokenId) != msg.sender) {
            revert NotTokenOwner(yourTokenId);
        }
        if (!_canAct(yourTokenId)) revert PepurgeOnCooldown(yourTokenId);

        timestamp[yourTokenId] = block.timestamp;
        uint256 healAmount;
        bool success = _random(10_000, msg.sender, yourTokenId) < 5_000;

        if (success) {
            hiddenUntil[yourTokenId] = block.timestamp + coolDown;
            uint256 maxHp = stats.maxhpRead(pepeType[yourTokenId]);
            uint256 currentHp = HP[yourTokenId];
            uint256 healedHp = currentHp + HIDE_HEAL;
            if (healedHp > maxHp) healedHp = maxHp;
            healAmount = healedHp - currentHp;
            HP[yourTokenId] = healedHp;
            emit MetadataUpdate(yourTokenId);
        } else {
            hiddenUntil[yourTokenId] = 0;
        }

        emit HideAttempt(
            yourTokenId,
            msg.sender,
            success,
            hiddenUntil[yourTokenId],
            healAmount
        );
    }

    function cashIn(uint256 tokenId) external nonReentrant {
        if (!gameActivated || aliveCount > endGameThreshold) {
            revert GameStillRunning();
        }
        if (ownerOf(tokenId) != msg.sender) revert NotTokenOwner(tokenId);

        HP[tokenId] = 0;
        hiddenUntil[tokenId] = 0;
        _gameBurn = true;
        _burn(tokenId);
        _gameBurn = false;
        unchecked {
            --aliveCount;
        }

        uint256 reward = winnerReward();
        _creditReward(msg.sender, reward);
        emit CashIn(tokenId, msg.sender, reward);
    }

    function claimRewards() external nonReentrant {
        uint256 reward = pendingRewards[msg.sender];
        if (reward == 0) revert NoRewardAvailable();

        pendingRewards[msg.sender] = 0;
        totalPendingRewards -= reward;
        (bool success, ) = payable(msg.sender).call{value: reward}("");
        if (!success) revert RewardTransferFailed();

        emit RewardClaimed(msg.sender, reward);
    }

    function _creditReward(address account, uint256 reward) internal {
        pendingRewards[account] += reward;
        totalPendingRewards += reward;
        emit RewardCredited(account, reward);
    }

    function _killReward() internal view returns (uint256) {
        uint256 rewardedKills =
            (collectionSize / 4) - endGameThreshold + 1;
        return _playerPool() / rewardedKills;
    }

    function winnerReward() public view returns (uint256) {
        return _playerPool() / endGameThreshold;
    }

    function _playerPool() internal view returns (uint256) {
        return (mintPrice * collectionSize * 2) / 5;
    }

    function requiredReserve() public view returns (uint256) {
        uint256 rewardThreshold = collectionSize / 4;
        uint256 futureKills;
        if (aliveCount > rewardThreshold) {
            futureKills = rewardThreshold - endGameThreshold + 1;
        } else if (aliveCount > endGameThreshold) {
            futureKills = aliveCount - endGameThreshold;
        }

        uint256 futureWinners = aliveCount > endGameThreshold
            ? endGameThreshold
            : aliveCount;
        return
            totalPendingRewards +
            (futureKills * _killReward()) +
            (futureWinners * winnerReward());
    }

    function isHidden(uint256 tokenId) public view returns (bool) {
        return hiddenUntil[tokenId] > block.timestamp;
    }

    function _canAct(uint256 tokenId) internal view returns (bool) {
        return timestamp[tokenId] + coolDown <= block.timestamp;
    }

    function _requireGameRunning() internal view {
        if (!gameActivated) revert GameNotActivated();
        if (aliveCount <= endGameThreshold) revert GameIsOver();
    }

    function totalMinted() external view returns (uint256) {
        return _totalMinted();
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        if (!_exists(tokenId)) revert URIQueryForNonexistentToken();

        return renderer.tokenURI(tokenId, pepeType[tokenId], HP[tokenId]);
    }

    function getPepurgesPage(
        uint256 cursor,
        uint256 pageSize
    )
        external
        view
        returns (PepurgeView[] memory pepurges, uint256 nextCursor)
    {
        if (pageSize == 0 || pageSize > 250) revert InvalidPageSize();

        uint256 minted = _totalMinted();
        if (cursor < _startTokenId()) cursor = _startTokenId();
        if (cursor > minted) return (new PepurgeView[](0), 0);

        uint256 end = cursor + pageSize;
        uint256 pastLastToken = minted + 1;
        if (end > pastLastToken) end = pastLastToken;

        pepurges = new PepurgeView[](pageSize);
        uint256 found;
        for (uint256 tokenId = cursor; tokenId < end; ) {
            if (_exists(tokenId) && HP[tokenId] != 0) {
                pepurges[found] = _pepurgeView(tokenId);
                unchecked {
                    ++found;
                }
            }
            unchecked {
                ++tokenId;
            }
        }

        assembly {
            mstore(pepurges, found)
        }
        nextCursor = end == pastLastToken ? 0 : end;
    }

    function _pepurgeView(
        uint256 tokenId
    ) internal view returns (PepurgeView memory) {
        uint256 tokenType = pepeType[tokenId];
        return
            PepurgeView({
                tokenId: tokenId,
                tokenOwner: ownerOf(tokenId),
                pepeType: tokenType,
                hp: HP[tokenId],
                lastActionAt: timestamp[tokenId],
                hiddenUntil: hiddenUntil[tokenId],
                attack: stats.attRead(tokenType),
                defense: stats.defRead(tokenType),
                maxHp: stats.maxhpRead(tokenType)
            });
    }

    function _beforeTokenTransfers(
        address from,
        address to,
        uint256 startTokenId,
        uint256 quantity
    ) internal override {
        if (from != address(0) && to == address(0) && !_gameBurn) {
            revert DirectBurnDisabled();
        }
        super._beforeTokenTransfers(from, to, startTokenId, quantity);
    }

    function _random(
        uint256 max,
        address account,
        uint256 tokenId
    ) internal virtual returns (uint256) {
        unchecked {
            ++_randomNonce;
        }
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.difficulty,
                        block.timestamp,
                        account,
                        tokenId,
                        _randomNonce
                    )
                )
            ) % max;
    }
}
