// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Migrations
 * @notice Bookkeeping contract required by the Truffle framework to keep track
 *         of the migrations that already ran on a network.
 */
contract Migrations {
    address public owner = msg.sender;
    uint256 public last_completed_migration;

    modifier restricted() {
        require(msg.sender == owner, "Migrations: caller is not the owner");
        _;
    }

    function setCompleted(uint256 completed) external restricted {
        last_completed_migration = completed;
    }
}
