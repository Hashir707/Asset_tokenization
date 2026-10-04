// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./AssetTokenFactory.sol";
import "./AssetTxType.sol";

/**
 * @title AssetRegistry
 * @notice Central, tamper proof catalogue of tokenized real world assets.
 *
 *         The registry does four things:
 *           1. stores the description of every registered asset,
 *           2. creates the ERC-20 token that represents the asset (through
 *              AssetTokenFactory),
 *           3. keeps an append-only ledger of every blockchain movement so the
 *              transaction history of the project is stored on chain,
 *           4. keeps the ownership distribution of each asset, which powers the
 *              fractional ownership screens of the front end.
 *
 *         Registration is permissionless on purpose: anyone may tokenize an
 *         asset they own. Restricting actions (pause / retire an asset) is
 *         reserved for the owner of that asset and for the registry admin,
 *         which is the contract deployer. That keeps the project simple
 *         without leaving the contracts unprotected.
 */
contract AssetRegistry is Ownable {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    uint8 public constant STATUS_ACTIVE = 0;
    uint8 public constant STATUS_PAUSED = 1;
    uint8 public constant STATUS_RETIRED = 2;

    /// @dev Upper bounds for inputs, so a bad registration can never make the
    ///      contract unusable or produce an unreadable record.
    uint256 private constant MAX_NAME_LENGTH = 128;
    uint256 private constant MAX_TYPE_LENGTH = 32;
    uint256 private constant MAX_DESCRIPTION_LENGTH = 2048;
    /// @dev Long enough for a normal https URL as well as an inline image
    ///      (a `data:image/svg+xml` placeholder used by the demo data).
    uint256 private constant MAX_URL_LENGTH = 2048;
    uint256 private constant MAX_BATCH_SIZE = 200;

    struct Asset {
        uint256 assetId;
        string assetName;
        string assetType;
        string description;
        uint256 assetValue; // in the smallest unit of the reference currency
        uint256 totalTokens; // number of fractions the asset is split into
        uint256 tokenPrice; // assetValue / totalTokens
        address tokenAddress; // ERC-20 contract of this asset
        address owner; // wallet that owns the real world asset
        string imageUrl;
        uint256 registeredAt; // block timestamp of registration
        uint8 status; // STATUS_ACTIVE / STATUS_PAUSED / STATUS_RETIRED
        bool exists;
    }

    struct Holder {
        address wallet;
        uint256 balance;
    }

    struct TransactionRecord {
        uint8 txType;
        uint256 assetId;
        address from;
        address to;
        uint256 tokenAmount;
        uint256 valueAmount;
        uint256 blockNumber;
        uint256 timestamp;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    AssetTokenFactory public immutable tokenFactory;

    uint256 private _assetCount;
    mapping(uint256 => Asset) private _assets;
    mapping(uint256 => bool) private _assetExists;
    uint256[] private _assetIds;

    /// @notice Append-only ledger of every movement recorded by the system.
    TransactionRecord[] private _ledger;
    mapping(uint256 => uint256[]) private _assetLedgerIds;

    /// @notice Ownership distribution per asset (token balances mirror).
    mapping(uint256 => Holder[]) private _holders;
    mapping(uint256 => mapping(address => uint256)) private _holdings;
    mapping(uint256 => mapping(address => bool)) private _isHolder;

    /// @notice Token contracts allowed to append to the ledger.
    mapping(address => bool) public isLedgerRecorder;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AssetRegistered(
        uint256 indexed assetId,
        address indexed owner,
        address indexed tokenAddress,
        string assetName,
        string assetType,
        uint256 assetValue,
        uint256 totalTokens,
        uint256 tokenPrice,
        uint256 registeredAt
    );

    event AssetStatusChanged(uint256 indexed assetId, uint8 previousStatus, uint8 newStatus, address indexed changedBy);

    event TransactionRecorded(
        uint256 indexed recordId,
        uint8 indexed txType,
        uint256 indexed assetId,
        address from,
        address to,
        uint256 tokenAmount,
        uint256 valueAmount,
        uint256 blockNumber,
        uint256 timestamp
    );

    event TokenRecorderAuthorized(address indexed tokenAddress, address indexed authorizedBy);

    constructor(address tokenFactoryAddress) {
        require(tokenFactoryAddress != address(0), "AssetRegistry: factory is the zero address");
        tokenFactory = AssetTokenFactory(tokenFactoryAddress);
    }

    // ---------------------------------------------------------------------
    // Registration
    // ---------------------------------------------------------------------

    /**
     * @notice Register a real world asset and create its token in one transaction.
     * @param assetName    Human readable name of the asset
     * @param assetType    One of: Real Estate, Gold, Vehicle, Artwork, Digital Asset, Other
     * @param description  Free text description of the asset
     * @param assetValue   Value of the asset in the smallest currency unit
     * @param totalTokens  Number of fractions to split the asset into
     * @param imageUrl     Optional image URL shown in the front end
     * @param assetOwner   Wallet that owns the real world asset
     * @return assetId     Id of the new asset
     * @return tokenAddress Address of the token created for the asset
     */
    function registerAsset(
        string calldata assetName,
        string calldata assetType,
        string calldata description,
        uint256 assetValue,
        uint256 totalTokens,
        string calldata imageUrl,
        address assetOwner
    ) external returns (uint256 assetId, address tokenAddress) {
        _validateAssetInput(assetName, assetType, description, imageUrl, assetValue, totalTokens, assetOwner);

        assetId = _assetCount + 1;

        // Append the registration first, so the ledger reads chronologically
        // (registration -> mint -> transfers). A failure below reverts the
        // whole transaction, so a partial entry can never survive.
        _appendLedger(TX_ASSET_REGISTRATION, assetId, msg.sender, assetOwner, 0, assetValue);

        tokenAddress = tokenFactory.createAssetToken(
            AssetTokenFactory.TokenParams({
                tokenName: _buildTokenName(assetName),
                tokenSymbol: _buildTokenSymbol(assetName, assetId),
                assetId: assetId,
                assetValue: assetValue,
                totalTokens: totalTokens,
                assetOwner: assetOwner,
                registryAddress: address(this),
                metadataURI: ""
            })
        );

        _assets[assetId] = Asset({
            assetId: assetId,
            assetName: assetName,
            assetType: assetType,
            description: description,
            assetValue: assetValue,
            totalTokens: totalTokens,
            tokenPrice: assetValue / totalTokens,
            tokenAddress: tokenAddress,
            owner: assetOwner,
            imageUrl: imageUrl,
            registeredAt: block.timestamp,
            status: STATUS_ACTIVE,
            exists: true
        });

        _assetExists[assetId] = true;
        _assetCount = assetId;
        _assetIds.push(assetId);

        // The new token is trusted to report its own transfers and purchases.
        isLedgerRecorder[tokenAddress] = true;

        emit AssetRegistered(
            assetId,
            assetOwner,
            tokenAddress,
            assetName,
            assetType,
            assetValue,
            totalTokens,
            assetValue / totalTokens,
            block.timestamp
        );

        return (assetId, tokenAddress);
    }

    /**
     * @notice Trust a token contract so it may append to the on-chain ledger.
     * @dev Called by the factory right after it deploys a token, because the
     *      very first mint of the supply already has to be recorded.
     */
    function authorizeTokenRecorder(address tokenAddress) external {
        require(
            msg.sender == address(tokenFactory) || msg.sender == owner(),
            "AssetRegistry: caller cannot authorize token recorders"
        );
        require(tokenAddress != address(0), "AssetRegistry: token is the zero address");

        isLedgerRecorder[tokenAddress] = true;
        emit TokenRecorderAuthorized(tokenAddress, msg.sender);
    }

    /**
     * @notice Pause, resume or retire an asset. Only the asset owner or the
     *         registry admin may change the status of an asset.
     */
    function setAssetStatus(uint256 assetId, uint8 newStatus) external {
        require(_assetExists[assetId], "AssetRegistry: asset does not exist");
        require(newStatus <= STATUS_RETIRED, "AssetRegistry: unknown status");

        address assetOwner = _assets[assetId].owner;
        require(
            msg.sender == assetOwner || msg.sender == owner(),
            "AssetRegistry: caller is not the asset owner"
        );

        uint8 previousStatus = _assets[assetId].status;
        _assets[assetId].status = newStatus;

        emit AssetStatusChanged(assetId, previousStatus, newStatus, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Ledger
    // ---------------------------------------------------------------------

    /**
     * @notice Called by the token contract of an asset after every balance
     *         change. Keeps the on-chain history and the ownership table in
     *         sync with the ERC-20 balances.
     */
    function recordTransaction(
        uint8 txType,
        uint256 assetId,
        address from,
        address to,
        uint256 tokenAmount,
        uint256 valueAmount
    ) external {
        require(isLedgerRecorder[msg.sender], "AssetRegistry: caller is not a token of this registry");
        require(tokenAmount > 0 || txType == TX_ASSET_REGISTRATION, "AssetRegistry: nothing to record");

        _appendLedger(txType, assetId, from, to, tokenAmount, valueAmount);

        if (tokenAmount == 0) {
            return;
        }

        // Mirror the ERC-20 balances: the sender gives the fractions away and
        // the receiver becomes (or stays) a holder of the asset.
        if (from != address(0)) {
            uint256 fromBalance = _holdings[assetId][from];
            // The ERC-20 layer rejects a transfer above the balance. Mirroring
            // the same condition keeps the bookkeeping from blocking a valid
            // transaction and never persists for one that is rolled back.
            if (fromBalance >= tokenAmount) {
                _holdings[assetId][from] = fromBalance - tokenAmount;
            }
        }

        if (to != address(0)) {
            if (!_isHolder[assetId][to]) {
                _isHolder[assetId][to] = true;
                _holders[assetId].push(Holder({wallet: to, balance: 0}));
            }
            _holdings[assetId][to] += tokenAmount;
        }
    }

    /// @notice Number of entries in the on-chain ledger.
    function getTransactionCount() external view returns (uint256) {
        return _ledger.length;
    }

    /// @notice A page of the ledger, newest entries last.
    function getTransactions(uint256 offset, uint256 limit) external view returns (TransactionRecord[] memory) {
        uint256 size = _ledger.length;
        if (offset >= size) {
            return new TransactionRecord[](0);
        }
        uint256 count = _normaliseLimit(limit, size - offset);
        TransactionRecord[] memory page = new TransactionRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _ledger[offset + i];
        }
        return page;
    }

    /// @notice A page of the ledger, newest entries first.
    function getRecentTransactions(uint256 limit) external view returns (TransactionRecord[] memory) {
        uint256 size = _ledger.length;
        uint256 count = _normaliseLimit(limit, size);
        TransactionRecord[] memory page = new TransactionRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _ledger[size - 1 - i];
        }
        return page;
    }

    /// @notice Every ledger entry that belongs to one asset.
    function getAssetTransactions(uint256 assetId) external view returns (TransactionRecord[] memory) {
        uint256[] storage ids = _assetLedgerIds[assetId];
        TransactionRecord[] memory page = new TransactionRecord[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            page[i] = _ledger[ids[i]];
        }
        return page;
    }

    // ---------------------------------------------------------------------
    // Assets
    // ---------------------------------------------------------------------

    function getAssetCount() external view returns (uint256) {
        return _assetCount;
    }

    function getAsset(uint256 assetId) external view returns (Asset memory) {
        require(_assetExists[assetId], "AssetRegistry: asset does not exist");
        return _assets[assetId];
    }

    function assetExists(uint256 assetId) external view returns (bool) {
        return _assetExists[assetId];
    }

    /// @notice Ids of every registered asset, oldest first.
    function getAllAssetIds() external view returns (uint256[] memory) {
        return _assetIds;
    }

    /**
     * @notice All registered assets in one call. Bounded to keep the RPC
     *         response small on a local chain; the front end pages through
     *         getAssetIds() for larger datasets.
     */
    function getAllAssets() external view returns (Asset[] memory) {
        uint256 size = _assetIds.length;
        uint256 count = size > MAX_BATCH_SIZE ? MAX_BATCH_SIZE : size;
        Asset[] memory page = new Asset[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _assets[_assetIds[i]];
        }
        return page;
    }

    /// @notice A page of asset ids, oldest first.
    function getAssetIds(uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256 size = _assetIds.length;
        if (offset >= size) {
            return new uint256[](0);
        }
        uint256 count = _normaliseLimit(limit, size - offset);
        uint256[] memory page = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            page[i] = _assetIds[offset + i];
        }
        return page;
    }

    // ---------------------------------------------------------------------
    // Ownership
    // ---------------------------------------------------------------------

    /// @notice Token balance of a wallet for an asset, as tracked by the registry.
    function holdingsOf(uint256 assetId, address wallet) external view returns (uint256) {
        return _holdings[assetId][wallet];
    }

    function holderCount(uint256 assetId) external view returns (uint256) {
        return _holders[assetId].length;
    }

    /// @notice Every wallet that has ever held tokens of the asset, with its
    ///         current balance.
    function getHolders(uint256 assetId) external view returns (Holder[] memory) {
        Holder[] storage wallets = _holders[assetId];
        Holder[] memory page = new Holder[](wallets.length);
        for (uint256 i = 0; i < wallets.length; i++) {
            page[i] = Holder({wallet: wallets[i].wallet, balance: _holdings[assetId][wallets[i].wallet]});
        }
        return page;
    }

    // ---------------------------------------------------------------------
    // Aggregates (dashboard)
    // ---------------------------------------------------------------------

    /// @notice Combined value of every registered asset, in the smallest unit.
    function totalTokenizedValue() external view returns (uint256 totalValue, uint256 totalFractions) {
        for (uint256 i = 0; i < _assetIds.length; i++) {
            Asset storage asset = _assets[_assetIds[i]];
            totalValue += asset.assetValue;
            totalFractions += asset.totalTokens;
        }
        return (totalValue, totalFractions);
    }

    function statusToString(uint8 status) external pure returns (string memory) {
        if (status == STATUS_ACTIVE) {
            return "Active";
        }
        if (status == STATUS_PAUSED) {
            return "Paused";
        }
        if (status == STATUS_RETIRED) {
            return "Retired";
        }
        return "Unknown";
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _appendLedger(
        uint8 txType,
        uint256 assetId,
        address from,
        address to,
        uint256 tokenAmount,
        uint256 valueAmount
    ) private {
        uint256 recordId = _ledger.length;
        uint256 currentBlockNumber = block.number;
        uint256 currentTimestamp = block.timestamp;

        _ledger.push(
            TransactionRecord({
                txType: txType,
                assetId: assetId,
                from: from,
                to: to,
                tokenAmount: tokenAmount,
                valueAmount: valueAmount,
                blockNumber: currentBlockNumber,
                timestamp: currentTimestamp
            })
        );
        _assetLedgerIds[assetId].push(recordId);

        emit TransactionRecorded(
            recordId,
            txType,
            assetId,
            from,
            to,
            tokenAmount,
            valueAmount,
            currentBlockNumber,
            currentTimestamp
        );
    }

    function _validateAssetInput(
        string calldata assetName,
        string calldata assetType,
        string calldata description,
        string calldata imageUrl,
        uint256 assetValue,
        uint256 totalTokens,
        address assetOwner
    ) private pure {
        require(bytes(assetName).length > 0, "AssetRegistry: asset name is required");
        require(bytes(assetName).length <= MAX_NAME_LENGTH, "AssetRegistry: asset name is too long");
        require(bytes(assetType).length > 0, "AssetRegistry: asset type is required");
        require(bytes(assetType).length <= MAX_TYPE_LENGTH, "AssetRegistry: asset type is too long");
        require(
            bytes(description).length <= MAX_DESCRIPTION_LENGTH,
            "AssetRegistry: description is too long"
        );
        require(bytes(imageUrl).length <= MAX_URL_LENGTH, "AssetRegistry: image URL is too long");
        require(assetOwner != address(0), "AssetRegistry: owner is the zero address");
        require(assetValue > 0, "AssetRegistry: asset value must be greater than zero");
        require(totalTokens > 0, "AssetRegistry: total tokens must be greater than zero");
        require(
            assetValue % totalTokens == 0,
            "AssetRegistry: asset value must be divisible by total tokens"
        );
    }

    function _normaliseLimit(uint256 limit, uint256 available) private pure returns (uint256) {
        if (limit == 0 || limit > MAX_BATCH_SIZE) {
            limit = MAX_BATCH_SIZE;
        }
        return limit > available ? available : limit;
    }

    function _buildTokenName(string calldata assetName) private pure returns (string memory) {
        return string(abi.encodePacked(assetName, " Share"));
    }

    /**
     * @dev Builds a short, readable ERC-20 symbol from the asset name,
     *      e.g. "Mumbai Commercial Property" -> "MUMB1".
     */
    function _buildTokenSymbol(string calldata assetName, uint256 assetId) private pure returns (string memory) {
        bytes memory raw = bytes(assetName);
        bytes memory letters;
        uint256 length = raw.length < 4 ? raw.length : 4;

        for (uint256 i = 0; i < length; i++) {
            bytes1 char = raw[i];
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isUpper = char >= 0x41 && char <= 0x5A;
            bool isLower = char >= 0x61 && char <= 0x7A;

            if (isDigit || isUpper) {
                letters = abi.encodePacked(letters, char);
            } else if (isLower) {
                letters = abi.encodePacked(letters, bytes1(uint8(char) - 32)); // to upper case
            }
        }

        if (letters.length == 0) {
            letters = bytes("AST");
        }

        return string(abi.encodePacked(letters, _toString(assetId)));
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 digits;
        uint256 temp = value;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
