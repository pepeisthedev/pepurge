// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import {PEPURGE} from "../pepurge.sol";

contract TestablePEPURGE is PEPURGE {
    uint256 private _forcedRandom;

    constructor(
        address stats_,
        address renderer_,
        uint256 collectionSize_,
        uint256 mintPrice_,
        uint256 coolDown_,
        uint256 endGameThreshold_,
        address[] memory allowedSeaDrop
    )
        PEPURGE(
            stats_,
            renderer_,
            collectionSize_,
            mintPrice_,
            coolDown_,
            endGameThreshold_,
            allowedSeaDrop
        )
    {}

    function setForcedRandom(uint256 value) external {
        _forcedRandom = value;
    }

    function _random(
        uint256 max,
        address,
        uint256
    ) internal view override returns (uint256) {
        return _forcedRandom % max;
    }
}
