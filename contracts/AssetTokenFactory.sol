// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AssetToken.sol";

/**
 * @title ITokenRecorderRegistry
 * @notice Part of AssetRegistry that the factory needs in order to trust a
 *         freshly deployed token (and therefore record its first mint).
 */
interface ITokenRecorderRegistry {
    function authorizeTokenRecorder(address tokenAddress) external;
}

/**
 * @title AssetTokenFactory
 * @notice Deploys a dedicated AssetToken contract for every registered asset.
 *
 *         A separate factory keeps AssetRegistry small and means a new asset
 *         never has to redeploy the registry itself. It is also the place where
 *         the relationships between the contracts are configured:
 *           1. deploy the token,
 *           2. issue the full supply to the asset owner,
 *           3. hand ownership of the token to the asset owner.
 */
contract AssetTokenFactory {
    /// @dev Grouped so the creation call stays a single stack slot.
    struct TokenParams {
        string tokenName;
        string tokenSymbol;
        uint256 assetId;
        uint256 assetValue;
        uint256 totalTokens;
        address assetOwner;
        address registryAddress;
        string metadataURI;
    }

    event AssetTokenCreated(
        uint256 indexed assetId,
        address indexed tokenAddress,
        address indexed assetOwner,
        string tokenName,
        string tokenSymbol,
        uint256 totalTokens
    );

    /**
     * @notice Deploy and initialise the token of a new asset.
     * @return tokenAddress Address of the freshly deployed AssetToken
     */
    function createAssetToken(TokenParams calldata params) external returns (address tokenAddress) {
        require(params.assetOwner != address(0), "AssetTokenFactory: asset owner is the zero address");

        AssetToken token = new AssetToken(
            params.tokenName,
            params.tokenSymbol,
            params.assetId,
            params.assetValue,
            params.totalTokens,
            params.assetOwner,
            params.registryAddress,
            params.metadataURI
        );

        // The registry has to trust the token before the supply is issued,
        // because the initial mint is recorded in the ledger as well.
        ITokenRecorderRegistry(params.registryAddress).authorizeTokenRecorder(address(token));

        // The factory holds ownership only for these two calls. After the
        // supply is issued the asset owner becomes the token administrator.
        token.mintTo(params.assetOwner, params.totalTokens);
        token.transferOwnership(params.assetOwner);

        emit AssetTokenCreated(
            params.assetId,
            address(token),
            params.assetOwner,
            params.tokenName,
            params.tokenSymbol,
            params.totalTokens
        );

        return address(token);
    }
}
