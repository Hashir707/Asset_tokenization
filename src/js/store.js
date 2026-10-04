/**
 * Data layer: reads the blockchain and turns the raw contract results into
 * plain objects the views can render. Results are cached per page load and
 * invalidated after every transaction the application sends.
 */
(function (global) {
  "use strict";

  const cache = {
    assets: null,
    transactions: null,
    holders: new Map(),
    hashes: null
  };

  function invalidate() {
    cache.assets = null;
    cache.transactions = null;
    cache.holders.clear();
    cache.hashes = null;
  }

  /** Normalises one asset coming from AssetRegistry.getAllAssets(). */
  function normaliseAsset(raw) {
    return {
      assetId: String(raw.assetId),
      assetName: raw.assetName,
      assetType: raw.assetType,
      description: raw.description,
      assetValue: String(raw.assetValue),
      totalTokens: String(raw.totalTokens),
      tokenPrice: String(raw.tokenPrice),
      tokenAddress: raw.tokenAddress,
      owner: raw.owner,
      imageUrl: raw.imageUrl,
      registeredAt: String(raw.registeredAt),
      status: Number(raw.status),
      exists: raw.exists
    };
  }

  /**
   * Loads every asset together with the live token data. The token balance is
   * only read when a wallet is connected.
   */
  async function loadAssets(options) {
    const settings = options || {};
    if (cache.assets && !settings.force) {
      return cache.assets;
    }

    const registry = global.Blockchain.getRegistry();
    const raw = await registry.methods.getAllAssets().call();
    const wallet = settings.wallet === undefined ? global.Blockchain.state.account : settings.wallet;

    const assets = [];
    for (const entry of raw) {
      const asset = normaliseAsset(entry);
      const token = global.Blockchain.getToken(asset.tokenAddress);

      asset.tokenName = await global.Blockchain.call(token.methods.name(), "");
      asset.tokenSymbol = await global.Blockchain.call(token.methods.symbol(), "");
      asset.totalSupply = await global.Blockchain.call(token.methods.totalSupply(), asset.totalTokens);
      asset.ownerBalance = await global.Blockchain.call(
        token.methods.balanceOf(asset.owner),
        "0"
      );
      asset.myBalance = "0";
      asset.myShareBasisPoints = 0;
      asset.myValue = "0";

      if (wallet) {
        asset.myBalance = await global.Blockchain.call(token.methods.balanceOf(wallet), "0");
        asset.myShareBasisPoints = Number(await global.Blockchain.call(token.methods.shareOf(wallet), "0"));
        asset.myValue = String(BigInt(asset.myBalance) * BigInt(asset.tokenPrice));
      }

      assets.push(asset);
    }

    cache.assets = assets;
    return assets;
  }

  async function loadAsset(assetId) {
    const assets = await loadAssets();
    return assets.find((asset) => asset.assetId === String(assetId)) || null;
  }

  /** Ownership distribution of one asset, as tracked on chain. */
  async function loadHolders(assetId) {
    const key = String(assetId);
    if (cache.holders.has(key)) {
      return cache.holders.get(key);
    }

    const registry = global.Blockchain.getRegistry();
    const raw = await registry.methods.getHolders(key).call();
    const holders = raw
      .map((holder) => ({
        wallet: holder.wallet,
        balance: String(holder.balance),
        shareBasisPoints: 0
      }))
      .filter((holder) => holder.balance !== "0");

    const asset = await loadAsset(key);
    const supply = asset ? BigInt(asset.totalSupply) : 0n;
    holders.forEach((holder) => {
      holder.shareBasisPoints = supply > 0n ? Number((BigInt(holder.balance) * 10000n) / supply) : 0;
    });
    holders.sort((a, b) => Number(b.balance) - Number(a.balance));

    cache.holders.set(key, holders);
    return holders;
  }

  /**
   * Reads the on-chain ledger and links every entry to the transaction that
   * produced it. The hashes come from the TransactionRecorded event logs, so
   * nothing is invented: every row of the history screen is verifiable.
   *
   * The contract returns the newest entries first, so the rows are already in
   * the order the interface shows them.
   */
  async function loadTransactions(limit) {
    const max = limit || 60;
    if (cache.transactions) {
      return cache.transactions;
    }

    const registry = global.Blockchain.getRegistry();
    const raw = await registry.methods.getRecentTransactions(max).call();
    const hashes = await loadLedgerHashes();

    const transactions = raw.map((record, index) => toEntry(record, hashes, { id: index }));
    cache.transactions = transactions;
    return transactions;
  }

  /**
   * Maps "blockNumber:timestamp" to the hash of the transaction that wrote the
   * record. The two records created by one registration (the asset record and
   * the initial mint) share a block and a timestamp, and therefore correctly
   * resolve to the same transaction hash.
   */
  async function loadLedgerHashes() {
    if (cache.hashes) {
      return cache.hashes;
    }

    const hashes = new Map();
    const deployment = global.Blockchain.state.deployment || {};
    const registryAddress = deployment.registry;

    if (!registryAddress || !global.Blockchain.state.web3) {
      cache.hashes = hashes;
      return hashes;
    }

    const web3 = global.Blockchain.state.web3;
    const abi = global.ASSET_CONTRACTS_ABI.AssetRegistry;
    const eventAbi = abi.find((entry) => entry.name === "TransactionRecorded");
    // The ABI helpers live on web3.eth.abi in web3 1.x, not on web3.utils.
    const topic = web3.eth.abi.encodeEventSignature(eventAbi);

    const latest = await web3.eth.getBlockNumber();
    // The registry was deployed at a known block, so every log of the ledger
    // lives after it. Only if that is unknown a recent window is scanned.
    let start = await resolveDeploymentBlock(deployment);
    if (start === null) {
      start = Math.max(0, latest - 4000);
    }

    try {
      const logs = await web3.eth.getPastLogs({
        address: registryAddress,
        topics: [topic],
        fromBlock: start,
        toBlock: latest
      });
      for (const entry of logs) {
        const decoded = web3.eth.abi.decodeLog(eventAbi.inputs, entry.data, entry.topics.slice(1));
        hashes.set(ledgerKey(decoded.blockNumber, decoded.timestamp), entry.transactionHash);
      }
    } catch (error) {
      console.warn("Ledger logs could not be read", error);
    }

    cache.hashes = hashes;
    return hashes;
  }

  function ledgerKey(blockNumber, timestamp) {
    return `${String(blockNumber)}:${String(timestamp)}`;
  }

  /**
   * Finds the block the registry was deployed in, either from the generated
   * configuration or by looking up its deployment transaction. Returns null
   * when the chain does not know, so the caller can fall back to a window.
   */
  async function resolveDeploymentBlock(deployment) {
    if (deployment.deploymentBlock !== null && deployment.deploymentBlock !== undefined) {
      return Number(deployment.deploymentBlock);
    }
    if (!deployment.deploymentTransaction) {
      return null;
    }
    try {
      const transaction = await global.Blockchain.state.web3.eth.getTransaction(deployment.deploymentTransaction);
      return transaction && transaction.blockNumber !== null ? Number(transaction.blockNumber) : null;
    } catch (error) {
      return null;
    }
  }

  /** Normalises one ledger record for the interface. */
  function toEntry(record, hashes, extras) {
    const type = global.Utils.TX_TYPES[Number(record.txType)] || { key: "unknown", label: "Unknown", pill: "" };
    return Object.assign(
      {
        type: type.key,
        typeLabel: type.label,
        typeClass: type.pill,
        assetId: String(record.assetId),
        from: record.from,
        to: record.to,
        tokenAmount: String(record.tokenAmount),
        valueAmount: String(record.valueAmount),
        blockNumber: String(record.blockNumber),
        timestamp: String(record.timestamp),
        txHash: hashes.get(ledgerKey(record.blockNumber, record.timestamp)) || null
      },
      extras
    );
  }

  /** Dashboard aggregates, read straight from the contract. */
  async function loadSummary() {
    const registry = global.Blockchain.getRegistry();
    const [assetCount, totals] = await Promise.all([
      registry.methods.getAssetCount().call(),
      registry.methods.totalTokenizedValue().call()
    ]);

    return {
      assetCount: Number(assetCount),
      totalValue: String(totals[0]),
      totalTokens: String(totals[1])
    };
  }

  /**
   * The ledger of a single asset, newest entry first, the same order the
   * history page uses. The transaction hashes come from the same decoded logs,
   * so they are read only once per page load.
   */
  async function loadAssetTransactions(assetId) {
    const registry = global.Blockchain.getRegistry();
    const raw = await registry.methods.getAssetTransactions(assetId).call();
    const hashes = await loadLedgerHashes();
    const asset = await loadAsset(assetId);

    return raw
      .map((record, index) =>
        toEntry(record, hashes, {
          id: index,
          assetName: asset ? asset.assetName : `Asset #${String(assetId)}`
        })
      )
      .reverse();
  }

  global.Store = {
    loadAssets,
    loadAsset,
    loadHolders,
    loadTransactions,
    loadAssetTransactions,
    loadSummary,
    invalidate
  };
})(window);
