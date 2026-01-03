// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Stats is Ownable {
    constructor() Ownable(address(msg.sender)) {}

    uint256[] public att;
    uint256[] public def;
    uint256[] public maxHP;
    uint256 private randomNonce;

    function allAtt(uint256 _att, uint256 _nr) public onlyOwner {
        att[_nr] = _att;
    }

    function allDef(uint256 _def, uint256 _nr) public onlyOwner {
        def[_nr] = _def;
    }

    function allMaxhp(uint256 _max, uint256 _nr) public onlyOwner {
        maxHP[_nr] = _max;
    }

    function addMeta(uint256[] calldata newItems) public onlyOwner {
        for (uint i = 0; i < newItems.length; i++) {
            att.push(newItems[i]);
        }
    }

    function adddef(uint256[] calldata newItems) public onlyOwner {
        for (uint i = 0; i < newItems.length; i++) {
            def.push(newItems[i]);
        }
    }

    function addmaxhp(uint256[] calldata newItems) public onlyOwner {
        for (uint i = 0; i < newItems.length; i++) {
            maxHP.push(newItems[i]);
        }
    }

    function attRead(uint _type) public view returns (uint256) {
        return uint256(att[_type]);
    }

    function defRead(uint _type) public view returns (uint256) {
        return uint256(def[_type]);
    }

    function maxhpRead(uint _type) public view returns (uint256) {
        return uint256(maxHP[_type]);
    }

    function getRandom(uint256 max) external view returns (uint256) {
        return
            uint256(
                keccak256(
                    abi.encodePacked(
                        block.timestamp,
                        block.prevrandao,
                        msg.sender,
                        block.number
                    )
                )
            ) % max;
    }

    function assignType(uint256 random) external pure returns (uint256) {
        if (random >= 0 && random < 300) return 1;
        else if (random >= 300 && random < 800) return 2;
        else if (random >= 800 && random < 1000) return 3;
        else if (random >= 1000 && random < 1200) return 4;
        else if (random >= 1200 && random < 1700) return 5;
        else if (random >= 1700 && random <= 2200) return 6;
        else if (random >= 2200 && random <= 2500) return 7;
        else if (random >= 2500 && random <= 3000) return 8;
        else if (random >= 3000 && random < 3500) return 9;
        else if (random >= 3500 && random < 4000) return 10;
        else if (random >= 4000 && random < 4500) return 11;
        else if (random >= 4500 && random < 4800) return 12;
        else if (random >= 4800 && random <= 5000) return 13;
        else if (random >= 5000 && random <= 5700) return 14;
        else if (random >= 5700 && random <= 6000) return 15;
        else if (random >= 6000 && random < 6500) return 16;
        else if (random >= 6500 && random < 7000) return 17;
        else if (random >= 7000 && random < 7500) return 18;
        else if (random >= 8000 && random < 8500) return 19;
        else if (random >= 8500 && random <= 8700) return 20;
        else if (random >= 8700 && random <= 9000) return 21;
        else if (random >= 9000 && random <= 9500) return 22;
        else return 23;
    }
}

