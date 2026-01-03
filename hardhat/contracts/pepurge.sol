// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ERC721AC} from "@limitbreak/creator-token-standards/src/erc721c/ERC721AC.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../utils/BasicRoyalties.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

interface Stats {
    function attRead(uint _type) external view returns (uint256);

    function defRead(uint _type) external view returns (uint256);

    function maxhpRead(uint _type) external view returns (uint256);

    function getRandom(uint _type) external view returns (uint256);

    function assignType(uint _type) external view returns (uint256);
}

contract PEPURGE is Ownable, ERC721AC, BasicRoyalties, ReentrancyGuard {
    using Strings for uint256;

    Stats IStats;

    constructor(
        address royaltyReceiver_,
        uint96 royaltyFeeNumerator_,
        string memory name_,
        string memory symbol_
    )
        ERC721AC(name_, symbol_)
        BasicRoyalties(royaltyReceiver_, royaltyFeeNumerator_)
        Ownable(address(msg.sender))
    {}

    event HideAttempt(
        uint256 indexed tokenId,
        address indexed owner,
        bool success
    );

    event TokenMinted(
        uint256 indexed tokenId,
        uint256 indexed pepeType,
        uint256 attack,
        uint256 defense,
        uint256 maxHP
    );

    event AttackResult(
        uint256 indexed attackerTokenId,
        uint256 indexed victimTokenId,
        address indexed attacker,
        uint256 damage,
        uint256 victimHPBefore,
        uint256 victimHPAfter,
        bool killed
    );

    uint256 public collect = 10000;
    uint256 public mintPrice = 0.00025 ether;
    string public CID =
        "ipfs://bafybeihbso5n53jblaianewxlwtyg75cszy5aqbfu7fa3otvurzbzprdmi/";
    uint256 public supply = 10000;
    uint256 public coolDown = 43200;
    uint256 public whenCollect = 10;

    //uint16 iniNum = 3333;
    uint256 private randomNonce;
    uint256 private _tokenIdCounter;

    mapping(uint256 => uint256) public pepeType;

    mapping(uint256 => uint256) public HP;
    mapping(uint256 => uint256) public hideTimestamp;

    mapping(uint256 => uint256) public timestamp;

    function _baseURI() internal pure override returns (string memory) {
        return "data:application/json;base64,";
    }

    function isHidden(uint256 tokenId) public view returns (bool) {
        if (hideTimestamp[tokenId] == 0) return false;
        return (block.timestamp < hideTimestamp[tokenId] + coolDown);
    }

    function setCon(address _stats) public onlyOwner {
        IStats = Stats(_stats);
    }

    function tokenURI(
        uint tokenId
    ) public view override returns (string memory) {
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        "{",
                        '"name": "Pepurge #',
                        Strings.toString(tokenId),
                        '",',
                        '"description": "Kill everyone",',
                        '"image": "',
                        CID,
                        "",
                        Strings.toString(pepeType[tokenId]),
                        '.png",',
                        ' "attributes": [{"trait_type": "type","value": "',
                        Strings.toString(pepeType[tokenId]),
                        '"},{"trait_type": "HP","value": "',
                        Strings.toString(HP[tokenId]),
                        '"},{"trait_type": "Attack","value": "',
                        Strings.toString(IStats.attRead(pepeType[tokenId])),
                        '"},{"trait_type": "Defense","value": "',
                        Strings.toString(IStats.defRead(pepeType[tokenId])),
                        '"},{"trait_type": "Max HP","value": "',
                        Strings.toString(IStats.maxhpRead(pepeType[tokenId])),
                        '"} ]'
                        "}"
                    )
                )
            )
        );

        return string(abi.encodePacked(_baseURI(), json));
    }

    function setting1(
        uint256 _supply,
        uint256 _mintPrice,
        string memory _CID,
        uint256 _coolDown,
        uint _whenColl,
        uint256 _collect
    ) public onlyOwner {
        supply = _supply;
        mintPrice = _mintPrice;
        CID = _CID;
        coolDown = _coolDown;
        whenCollect = _whenColl;
        collect = _collect;
    }

    function mint() public payable nonReentrant {
        require(msg.value >= mintPrice, "Insufficient funds");
        require(_tokenIdCounter < supply);
        
        uint256 newTokenId = _tokenIdCounter;
        
        _safeMint(msg.sender, 1);
        
        _tokenIdCounter += 1;
        
        timestamp[newTokenId] = 0;
        uint256 rand = getRandom(10000);
        uint256 assignedType = IStats.assignType(rand);
        pepeType[newTokenId] = assignedType;
        HP[newTokenId] = IStats.maxhpRead(assignedType);
        
        emit TokenMinted(
            newTokenId,
            assignedType,
            IStats.attRead(assignedType),
            IStats.defRead(assignedType),
            IStats.maxhpRead(assignedType)
        );
    }

    function getRandom(uint256 max) internal returns (uint256) {
        randomNonce++;
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        msg.sender,
                        randomNonce
                    )
                )
            ) % max;
    }

    function Attack(
        uint256 yourTokenId,
        uint256 victimTokenID
    ) external nonReentrant {
        require(ownerOf(yourTokenId) == msg.sender, "Not your Pepurge");
        require(_tokenIdCounter >= supply, "Collection still minting");
        require(msg.sender == tx.origin, "No smart contracts");
        require(collect >= whenCollect, "Game is over");
        require(HP[victimTokenID] > 0, "Victim is already dead");
        if ((timestamp[victimTokenID] < (block.timestamp - coolDown))) {
            require(!isHidden(victimTokenID), "Victim is hidden");
        }
        require(timestamp[yourTokenId] < (block.timestamp - coolDown), "Your Pepurge is on cooldown");
        
        uint256 victimHPBefore = HP[victimTokenID];
        uint256 attackPower = IStats.attRead(pepeType[yourTokenId]);
        uint256 defensePower = IStats.defRead(pepeType[victimTokenID]);
        
        uint256 damage;
        if (attackPower > defensePower) {
            damage = attackPower - defensePower;
        } else {
            damage = 0;
        }
        
        uint256 totalDamage = damage + 1;
        bool killed = false;
        uint256 victimHPAfter;
        
        if (HP[victimTokenID] <= totalDamage) {
            HP[victimTokenID] = 0;
            victimHPAfter = 0;
            killed = true;
            _burn(victimTokenID);
            collect = collect - 1;
            payable(msg.sender).transfer(mintPrice / 2);
        } else {
            HP[victimTokenID] = HP[victimTokenID] - totalDamage;
            victimHPAfter = HP[victimTokenID];
        }
        
        timestamp[yourTokenId] = block.timestamp;
        
        emit AttackResult(
            yourTokenId,
            victimTokenID,
            msg.sender,
            totalDamage,
            victimHPBefore,
            victimHPAfter,
            killed
        );
    }

    function cashIn(uint256 _tokenID) external nonReentrant {
        require(collect <= whenCollect, "Game is still running");
        require(msg.sender == ownerOf(_tokenID), "Not token owner");
        require(msg.sender == tx.origin, "No smart contracts");
        payable(msg.sender).transfer((mintPrice * supply * 4) / 100);
        _burn(_tokenID);
    }

    function Hide(uint256 yourTokenId) external nonReentrant {
        require(ownerOf(yourTokenId) == msg.sender, "Not your Pepurge");
        require(_tokenIdCounter >= supply, "Game is over");
        require(msg.sender == tx.origin, "No smart contracts");
        timestamp[yourTokenId] = block.timestamp;

        uint256 rand = getRandom(10000);
        if (rand < 5000) {
            hideTimestamp[yourTokenId] = block.timestamp;
            HP[yourTokenId] = IStats.maxhpRead(pepeType[yourTokenId]);
            emit HideAttempt(yourTokenId, msg.sender, true);
        } else {
            emit HideAttempt(yourTokenId, msg.sender, false);
        }
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721AC, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner()).transfer(_amount);
    }

    function getOwnedPepurges(
        address owner
    )
        external
        view
        returns (
            uint256[] memory tokenIds,
            uint256[] memory types,
            uint256[] memory hps,
            bool[] memory hiddenStatus,
            uint256[] memory timestamps,
            uint256[] memory attacks,
            uint256[] memory defenses,
            uint256[] memory maxHps
        )
    {
        uint256 tokenCount = balanceOf(owner);
        if (tokenCount == 0) {
            return (
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new bool[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }

        tokenIds = new uint256[](tokenCount);
        types = new uint256[](tokenCount);
        hps = new uint256[](tokenCount);
        hiddenStatus = new bool[](tokenCount);
        timestamps = new uint256[](tokenCount);
        attacks = new uint256[](tokenCount);
        defenses = new uint256[](tokenCount);
        maxHps = new uint256[](tokenCount);

        uint256 index = 0;

        for (uint256 i = 0; i < _tokenIdCounter; i++) {
            // Start from 0, not 1
            if (_exists(i) && ownerOf(i) == owner) {
                tokenIds[index] = i;
                types[index] = pepeType[i];
                hps[index] = HP[i];
                hiddenStatus[index] = isHidden(i);
                timestamps[index] = timestamp[i];
                attacks[index] = IStats.attRead(pepeType[i]);
                defenses[index] = IStats.defRead(pepeType[i]);
                maxHps[index] = IStats.maxhpRead(pepeType[i]);
                index++;
            }
        }

        return (
            tokenIds,
            types,
            hps,
            hiddenStatus,
            timestamps,
            attacks,
            defenses,
            maxHps
        );
    }

    function alivePepes()
        external
        view
        returns (
            uint256[] memory tokenIds,
            uint256[] memory types,
            uint256[] memory hps,
            uint256[] memory timestamps,
            uint256[] memory attacks,
            uint256[] memory defenses,
            uint256[] memory maxHps,
            bool[] memory hiddenStatus
        )
    {
        uint256 count = 0;
        // First pass: count alive tokens
        for (uint256 i = 0; i < _tokenIdCounter; i++) {
            if (_exists(i) && HP[i] > 0) {
                count++;
            }
        }

        if (count == 0) {
            return (
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new uint256[](0),
                new bool[](0)
            );
        }

        // Initialize arrays
        tokenIds = new uint256[](count);
        types = new uint256[](count);
        hps = new uint256[](count);
        timestamps = new uint256[](count);
        attacks = new uint256[](count);
        defenses = new uint256[](count);
        maxHps = new uint256[](count);
        hiddenStatus = new bool[](count);

        // Second pass: collect token data
        uint256 index = 0;
        for (uint256 i = 0; i < _tokenIdCounter; i++) {
            if (_exists(i) && HP[i] > 0) {
                tokenIds[index] = i;
                types[index] = pepeType[i];
                hps[index] = HP[i];
                timestamps[index] = timestamp[i];
                attacks[index] = IStats.attRead(pepeType[i]);
                defenses[index] = IStats.defRead(pepeType[i]);
                maxHps[index] = IStats.maxhpRead(pepeType[i]);
                hiddenStatus[index] = isHidden(i);
                index++;
            }
        }

        return (tokenIds, types, hps, timestamps, attacks, defenses, maxHps, hiddenStatus);
    }

    function _requireCallerIsContractOwner() internal view override {
        _checkOwner();
    }

      function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }
}
