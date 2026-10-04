// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Re-exported on purpose: compiling the pure ERC-20 interface into the
 *      project lets the test suite (and any client) talk to an AssetToken
 *      through the standard token interface only, with none of the
 *      asset specific functions involved.
 */
