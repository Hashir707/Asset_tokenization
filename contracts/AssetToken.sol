// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./AssetTxType.sol";

/**
 * @title IAssetRegistryRecorder
 * @notice Minimal part of AssetRegistry that AssetToken needs. Keeping the
 *         dependency one-directional (token -> registry) makes both contracts
 *         easier to test and to reason about.
 */
interface IAssetRegistryRecorder {
    function recordTransaction(
        uint8 txType,
        uint256 assetId,
        address from,
        address to,
        uint256 tokenAmount,
        uint256 valueAmount
    ) external;
}

/**
 * @title AssetToken
 * @notice ERC-20 token that represents fractional ownership of a single
 *         registered real world asset.
 *
 *         One token == one equal share of the asset. If an asset is worth
 *         10,00,000 (in paise, the smallest unit of the reference currency)
 *         and is split into 10,000 tokens, then every token represents
 *         10,000 paise of the asset value.
 *
 *         Design notes for the academic prototype:
 *         - The ERC-20 logic itself is NOT written by hand, it is inherited
 *           from OpenZeppelin's audited ERC20 implementation.
 *         - The total supply is fixed by the asset definition: the supply of an
 *           asset can never exceed `totalTokens`, so ownership percentages
 *           (balance / totalSupply) always add up to 100%.
 *         - The contract owner (after deployment: the asset owner) may mint
 *           additional fractions only while the cap is not reached, and may
 *           update the token metadata URI.
 *         - "Buying" a token is an on-chain purchase from the asset owner: the
 *           tokens move from the asset owner to the buyer and the notional
 *           price is recorded in the AssetRegistry ledger. The payment is
 *           settled in the native currency of the local test chain, which is
 *           a demonstration of the transaction flow, not a real payment.
 */
contract AssetToken is ERC20, Ownable, ReentrancyGuard {
    /// @dev Fractional tokens are indivisible, so the token uses zero decimals.
    uint8 private constant TOKEN_DECIMALS = 0;

    /// @notice Registry id of the asset this token represents.
    uint256 public immutable assetId;
    /// @notice Value of the whole asset in the smallest currency unit.
    uint256 public immutable assetValue;
    /// @notice Maximum number of fractions that can ever exist for the asset.
    uint256 public immutable totalTokens;
    /// @notice Notional price of a single token (assetValue / totalTokens).
    uint256 public immutable tokenPrice;
    /// @notice Wallet that originally owns the physical / legal asset.
    address public immutable assetOwner;
    /// @notice AssetRegistry contract this token reports activity to.
    address public immutable registryAddress;

    string private _metadataURI;

    /// @dev Set while buy() runs so that the internal transfer is not logged twice.
    bool private _suppressTransferLog;

    event TokensMinted(address indexed to, uint256 amount, uint256 totalSupply);
    event TokensPurchased(address indexed buyer, uint256 amount, uint256 amountPaid);
    event ProceedsWithdrawn(address indexed to, uint256 amount);
    event TokenMetadataUpdated(string previousMetadataURI, string newMetadataURI);

    /**
     * @param name_         ERC-20 token name, e.g. "Mumbai Commercial Property Share"
     * @param symbol_       ERC-20 token symbol, e.g. "MCPS"
     * @param assetId_      Registry id of the asset
     * @param assetValue_   Value of the asset in the smallest currency unit
     * @param totalTokens_  Number of fractions the asset is split into
     * @param assetOwner_   Wallet that owns the real world asset
     * @param registry_     Address of the AssetRegistry contract
     * @param metadataURI_  Optional metadata URI (IPFS / HTTPS) for the token
     */
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 assetId_,
        uint256 assetValue_,
        uint256 totalTokens_,
        address assetOwner_,
        address registry_,
        string memory metadataURI_
    ) ERC20(name_, symbol_) Ownable() {
        require(assetOwner_ != address(0), "AssetToken: asset owner is the zero address");
        require(registry_ != address(0), "AssetToken: registry is the zero address");
        require(totalTokens_ > 0, "AssetToken: total tokens must be greater than zero");
        require(assetValue_ > 0, "AssetToken: asset value must be greater than zero");
        require(
            assetValue_ % totalTokens_ == 0,
            "AssetToken: asset value must be divisible by total tokens"
        );

        assetId = assetId_;
        assetValue = assetValue_;
        totalTokens = totalTokens_;
        tokenPrice = assetValue_ / totalTokens_;
        assetOwner = assetOwner_;
        registryAddress = registry_;
        _metadataURI = metadataURI_;
    }

    // ---------------------------------------------------------------------
    // ERC-20 metadata
    // ---------------------------------------------------------------------

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return TOKEN_DECIMALS;
    }

    function metadataURI() external view returns (string memory) {
        return _metadataURI;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Notional price of `amount` tokens, in the smallest currency unit.
    function priceFor(uint256 amount) public view returns (uint256) {
        return tokenPrice * amount;
    }

    /// @notice Notional value currently represented by a wallet, same unit as assetValue.
    function valueHeldBy(address wallet) external view returns (uint256) {
        return balanceOf(wallet) * tokenPrice;
    }

    /// @notice Ownership of a wallet in basis points (10000 = 100.00%).
    function shareOf(address wallet) external view returns (uint256 basisPoints) {
        uint256 supply = totalSupply();
        if (supply == 0) {
            return 0;
        }
        basisPoints = (balanceOf(wallet) * 10000) / supply;
    }

    /// @notice Everything the front end needs to describe this token in one call.
    function assetInfo() external view returns (uint256 id, address owner, uint256 price, uint256 supply) {
        return (assetId, assetOwner, tokenPrice, totalSupply());
    }

    // ---------------------------------------------------------------------
    // Issuance
    // ---------------------------------------------------------------------

    /**
     * @notice Issue fractions of the asset. Callable by the contract owner
     *         only (the factory during creation, the asset owner afterwards)
     *         and never above the fixed cap of the asset.
     */
    function mintTo(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "AssetToken: mint to the zero address");
        require(amount > 0, "AssetToken: amount must be greater than zero");
        require(
            totalSupply() + amount <= totalTokens,
            "AssetToken: minting above the token cap of the asset"
        );

        _mint(to, amount);
        emit TokensMinted(to, amount, totalSupply());
        _record(TX_TOKEN_MINT, address(0), to, amount, amount * tokenPrice);
    }

    /// @notice Update the metadata URI of the token. Asset owner only.
    function setMetadataURI(string calldata newMetadataURI) external onlyOwner {
        emit TokenMetadataUpdated(_metadataURI, newMetadataURI);
        _metadataURI = newMetadataURI;
    }

    // ---------------------------------------------------------------------
    // Transfers
    // ---------------------------------------------------------------------

    /// @dev Fractions are not dust: a zero amount transfer is rejected instead
    ///      of silently creating a meaningless on-chain record.
    function transfer(address to, uint256 amount) public override returns (bool) {
        _validateTransfer(to, amount);
        return super.transfer(to, amount);
    }

    /// @dev Same guards as transfer(), applied to delegated transfers.
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _validateTransfer(to, amount);
        return super.transferFrom(from, to, amount);
    }

    // ---------------------------------------------------------------------
    // Purchase
    // ---------------------------------------------------------------------

    /**
     * @notice Buy fractions of the asset from the asset owner.
     * @dev The supply of an asset is fixed, so a purchase is a transfer out of
     *      the asset owner's balance. The payment is checked against the
     *      notional price of the tokens and recorded on chain. On the local
     *      Ganache network the payment is settled in test ETH, which only
     *      demonstrates the transaction flow.
     * @param amount Number of tokens to buy
     */
    function buy(uint256 amount) external payable nonReentrant {
        require(amount > 0, "AssetToken: amount must be greater than zero");
        // A self purchase would only move tokens to the same wallet, so it is
        // rejected instead of consuming gas and writing a meaningless record.
        require(msg.sender != assetOwner, "AssetToken: the asset owner cannot buy from itself");

        uint256 cost = priceFor(amount);
        require(msg.value == cost, "AssetToken: incorrect payment amount");

        _suppressTransferLog = true;
        _transfer(assetOwner, msg.sender, amount);
        _suppressTransferLog = false;

        emit TokensPurchased(msg.sender, amount, cost);
        _record(TX_TOKEN_PURCHASE, assetOwner, msg.sender, amount, cost);
    }

    /**
     * @notice Sends the test ETH collected by buy() to the asset owner.
     * @dev buy() holds the payment inside this contract, so the owner needs a
     *      way to collect it. On a real network this is where the proceeds of
     *      the sale would be settled to the owner.
     */
    function withdrawProceeds() external onlyAssetOwner nonReentrant returns (uint256 amount) {
        amount = address(this).balance;
        require(amount > 0, "AssetToken: no proceeds to withdraw");

        (bool sent, ) = assetOwner.call{value: amount}("");
        require(sent, "AssetToken: proceeds transfer failed");

        emit ProceedsWithdrawn(assetOwner, amount);
    }

    /// @dev Throws unless the caller is the immutable asset owner.
    modifier onlyAssetOwner() {
        require(msg.sender == assetOwner, "AssetToken: caller is not the asset owner");
        _;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /// @dev Shared input validation for transfer() and transferFrom().
    function _validateTransfer(address to, uint256 amount) private pure {
        require(amount > 0, "AssetToken: amount must be greater than zero");
        require(to != address(0), "AssetToken: cannot transfer to the zero address");
    }

    /**
     * @dev OpenZeppelin hook that every balance change goes through. Logging
     *      here guarantees the registry ledger stays complete even if a
     *      transfer is triggered by another contract instead of the UI.
     */
    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        if (from == address(0) || to == address(0) || amount == 0 || _suppressTransferLog) {
            return;
        }

        _record(TX_TOKEN_TRANSFER, from, to, amount, amount * tokenPrice);
    }

    /**
     * @dev Report the movement to AssetRegistry. Failures of the bookkeeping
     *      call must never block a valid transfer, but on a healthy deployment
     *      the registry is always present, so this reverts loudly in tests.
     */
    function _record(
        uint8 txType,
        address from,
        address to,
        uint256 amount,
        uint256 valueAmount
    ) private {
        IAssetRegistryRecorder(registryAddress).recordTransaction(
            txType,
            assetId,
            from,
            to,
            amount,
            valueAmount
        );
    }
}
