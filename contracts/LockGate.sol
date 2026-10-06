// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IGate} from "./HomebaseMap.sol";

/// @notice The read a lock contract answers: how much a wallet has locked, in the token's base units.
interface ILock {
    function lockedBalanceOf(address account) external view returns (uint256);
}

/// @title Lets a wallet through once it has enough $home locked.
/// @notice Deployed when SeedMe's lock contract is known, then set on the map with `setGate`.
contract LockGate is IGate {
    ILock public immutable lock;
    uint256 public immutable min;

    constructor(ILock lock_, uint256 min_) {
        lock = lock_;
        min = min_;
    }

    function allowed(address who) external view returns (bool) {
        return lock.lockedBalanceOf(who) >= min;
    }
}
