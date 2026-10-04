// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Shared transaction type codes used by the on-chain ledger of AssetRegistry.
// Declared as file level constants so that both AssetRegistry (writer) and
// AssetToken (reporter) use exactly the same identifiers.
//
// The values are part of the public API that the web front end reads, so they
// must never be reordered.
uint8 constant TX_ASSET_REGISTRATION = 1; // a new asset was registered and its token created
uint8 constant TX_TOKEN_MINT = 2; // tokens were issued into circulation
uint8 constant TX_TOKEN_TRANSFER = 3; // tokens moved between two wallets
uint8 constant TX_TOKEN_PURCHASE = 4; // tokens were bought from the asset owner
