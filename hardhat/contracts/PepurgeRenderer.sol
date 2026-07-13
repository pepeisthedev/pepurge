// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {Base64} from "openzeppelin-contracts/utils/Base64.sol";
import {Strings} from "openzeppelin-contracts/utils/Strings.sol";

interface IPepurgeRendererStats {
    function attRead(uint256 pepeType) external view returns (uint256);

    function defRead(uint256 pepeType) external view returns (uint256);

    function maxhpRead(uint256 pepeType) external view returns (uint256);
}

contract PepurgeRenderer {
    using Strings for uint256;

    IPepurgeRendererStats public immutable stats;

    string private constant IPFS_BASE_URI =
        "ipfs://bafybeihicvspac7ifhpja5slmbiavwgrir2foal3hedb7q3iufu7j6wxee/";

    constructor(address stats_) {
        require(stats_.code.length != 0, "Invalid stats");
        stats = IPepurgeRendererStats(stats_);
    }

    function tokenURI(
        uint256 tokenId,
        uint256 tokenType,
        uint256 hp
    ) external view returns (string memory) {
        string memory json = Base64.encode(
            bytes(
                string.concat(
                    '{"name":"Pepurge #',
                    tokenId.toString(),
                    '","description":"Purge or be purged","image":"',
                    IPFS_BASE_URI,
                    tokenType.toString(),
                    '.png","attributes":[{"trait_type":"type","value":',
                    tokenType.toString(),
                    '},{"trait_type":"HP","value":',
                    hp.toString(),
                    '},{"trait_type":"Attack","value":',
                    stats.attRead(tokenType).toString(),
                    '},{"trait_type":"Defense","value":',
                    stats.defRead(tokenType).toString(),
                    '},{"trait_type":"Max HP","value":',
                    stats.maxhpRead(tokenType).toString(),
                    "}]}"
                )
            )
        );
        return string.concat("data:application/json;base64,", json);
    }
}
