// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A lock that answers what the test told it to; the suite's stand-in for SeedMe's.
contract StubLock {
    mapping(address => uint256) public lockedBalanceOf;

    function setLocked(address who, uint256 amount) external {
        lockedBalanceOf[who] = amount;
    }
}
