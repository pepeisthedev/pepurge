// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Stats {
    bytes private constant ATTACK =
        hex"000506060802070706020602080702060703050703060703";
    bytes private constant DEFENSE =
        hex"000504070302060503020202070502070605050504040303";
    bytes private constant MAX_HP =
        hex"000707080505070805040505060705080707070706060705";

    error InvalidPepeType(uint256 pepeType);
    error InvalidRandomValue(uint256 random);

    function attRead(uint256 pepeType) external pure returns (uint256) {
        _validateType(pepeType);
        return uint8(ATTACK[pepeType]);
    }

    function defRead(uint256 pepeType) external pure returns (uint256) {
        _validateType(pepeType);
        return uint8(DEFENSE[pepeType]);
    }

    function maxhpRead(uint256 pepeType) external pure returns (uint256) {
        _validateType(pepeType);
        return uint8(MAX_HP[pepeType]);
    }

    function assignType(uint256 random) external pure returns (uint256) {
        if (random >= 10_000) revert InvalidRandomValue(random);
        if (random < 300) return 1;
        if (random < 800) return 2;
        if (random < 1_000) return 3;
        if (random < 1_200) return 4;
        if (random < 1_700) return 5;
        if (random < 2_200) return 6;
        if (random < 2_500) return 7;
        if (random < 3_000) return 8;
        if (random < 3_500) return 9;
        if (random < 4_000) return 10;
        if (random < 4_500) return 11;
        if (random < 4_800) return 12;
        if (random < 5_000) return 13;
        if (random < 5_700) return 14;
        if (random < 6_000) return 15;
        if (random < 6_500) return 16;
        if (random < 7_000) return 17;
        if (random < 7_500) return 18;
        if (random < 8_000) return 19;
        if (random < 8_300) return 20;
        if (random < 8_600) return 21;
        if (random < 9_500) return 22;
        return 23;
    }

    function _validateType(uint256 pepeType) private pure {
        if (pepeType == 0 || pepeType > 23) {
            revert InvalidPepeType(pepeType);
        }
    }
}
