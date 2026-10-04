/**
 * Application layer: the bridge between the browser and the smart contracts.
 *
 *   Web front end  ->  this module (Web3.js)  ->  MetaMask  ->  contracts
 *
 * It owns the web3 instance, the wallet connection, the contract instances
 * created from the Truffle generated ABIs, and a small transaction helper that
 * reports every state change of a transaction to the user.
 */
(function (global) {
  "use strict";

  /**
   * Gas limits are always sent explicitly. web3.js otherwise falls back to its
   * own default of 90,000 gas, which is far too little to deploy the token
   * contract of a new asset and would make the transaction fail silently.
   */
  const GAS = {
    registerAsset: 6500000,
    buyTokens: 700000,
    transfer: 600000,
    setStatus: 300000
  };

  const state = {
    web3: null,
    account: null,
    chainId: null,
    networkId: null,
    deployment: null,
    contractsLoaded: false,
    tokenInstances: new Map(),
    listeners: []
  };

  // ---------------------------------------------------------------- errors

  /**
   * Extracts the Solidity revert reason from an error, wherever the provider
   * happens to put it. Ganache returns the reason on the read only call but
   * only a receipt on send, MetaMask usually reports it directly.
   */
  function extractRevertReason(error) {
    if (!error) {
      return null;
    }

    const candidates = [error.reason, error.message, error.error && error.error.message, error.data];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const text = String(candidate);
      const match = text.match(/revert[:\s]+(.*?)(?:["'\n]|$)/);
      if (match && match[1].trim()) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Turns any error coming from MetaMask, web3.js or the EVM into a message
   * that can be shown to a user. Raw stack traces never reach the interface.
   */
  function friendlyError(error) {
    if (!error) {
      return "Something went wrong. Please try again.";
    }

    // An error that was already described by describeFailure is passed through,
    // so wrapping it again in the interface cannot lose the real reason.
    if (error.friendly) {
      return String(error.message);
    }

    const raw = String(error.message || error.reason || error);
    const code = error.code;

    if (code === 4001 || /user denied|user rejected|rejected the request|denied transaction/i.test(raw)) {
      return "Transaction rejected by user.";
    }
    if (/insufficient funds/i.test(raw)) {
      return "Insufficient test ETH in this wallet to pay the gas fee.";
    }
    if (/exceeds balance|insufficient balance/i.test(raw)) {
      return "Insufficient token balance for this transaction.";
    }
    if (/nonce too low|already known|replacement transaction underpriced/i.test(raw)) {
      return "A transaction with the same data is already in the mempool. Please wait a moment.";
    }
    if (/out of gas|intrinsic gas too low/i.test(raw)) {
      return "The transaction ran out of gas. Please try again.";
    }

    const reason = extractRevertReason(error);
    if (reason) {
      return describeRevertReason(reason);
    }

    if (/Could not decode contract|invalid address/i.test(raw)) {
      return "The contract call could not be prepared. Make sure the contracts are deployed on this network.";
    }
    if (/network|disconnected|ECONNREFUSED|Failed to fetch/i.test(raw)) {
      return "The local blockchain is not reachable. Please start Ganache and reload.";
    }

    return "Transaction failed. Please try again.";
  }

  /** Human readable text for the revert reasons used by our own contracts. */
  function describeRevertReason(reason) {
    const withoutPrefix = reason.replace(/^(AssetRegistry|AssetToken|AssetTokenFactory|Ownable|ERC20|IERC20):\s*/, "");
    const known = {
      "asset name is required": "Please enter an asset name.",
      "asset type is required": "Please choose an asset type.",
      "asset value must be greater than zero": "The asset value must be greater than zero.",
      "total tokens must be greater than zero": "The number of tokens must be greater than zero.",
      "asset value must be divisible by total tokens":
        "The asset value must divide evenly by the number of tokens, so every token has the same price.",
      "owner is the zero address": "Please enter a valid owner wallet address.",
      "asset does not exist": "This asset does not exist on the current chain.",
      "caller is not the asset owner": "Only the owner of this asset can perform that action.",
      "caller is not the owner": "Only the owner of this token can perform that action.",
      "amount must be greater than zero": "Enter an amount greater than zero.",
      "incorrect payment amount": "The payment does not match the price of the selected tokens.",
      "the asset owner cannot buy from itself": "You own this asset, so there is nothing to buy from yourself.",
      "no proceeds to withdraw": "There are no collected payments to transfer yet.",
      "cannot transfer to the zero address": "The recipient address is not valid.",
      "transfer amount exceeds balance": "Insufficient token balance for this transfer.",
      "minting above the token cap of the asset": "The full supply of this asset has already been issued.",
      "unknown status": "That status value is not supported by the contract."
    };

    if (known[withoutPrefix]) {
      return known[withoutPrefix];
    }
    return `The contract rejected the request: ${withoutPrefix}`;
  }

  // ---------------------------------------------------------------- wallet

  function isMetaMaskInstalled() {
    return Boolean(global.ethereum);
  }

  function isMetaMaskBrowser() {
    return Boolean(global.ethereum && global.ethereum.isMetaMask);
  }

  function onChange(listener) {
    state.listeners.push(listener);
  }

  function emit(event, payload) {
    state.listeners.forEach((listener) => {
      try {
        listener(event, payload);
      } catch (error) {
        console.error("Listener failed", error);
      }
    });
  }

  /** Resolves the deployed addresses of the network the wallet is connected to. */
  function resolveDeployment(networkId) {
    const config = global.ASSET_CONTRACTS_CONFIG || { networks: {} };
    return config.networks ? config.networks[String(networkId)] : null;
  }

  function explorerUrl() {
    const config = global.ASSET_CONTRACTS_CONFIG || {};
    return config.explorerUrl || null;
  }

  function isConnected() {
    return Boolean(state.account);
  }

  function hasContracts() {
    return state.contractsLoaded;
  }

  async function connect() {
    if (!isMetaMaskInstalled()) {
      throw new Error(
        "MetaMask is not detected in this browser. Please install the MetaMask extension and reload the page."
      );
    }

    // Not every provider implements eth_requestAccounts, so an already
    // unlocked wallet is used as a fallback instead of failing outright.
    let accounts;
    try {
      accounts = await global.ethereum.request({ method: "eth_requestAccounts" });
    } catch (error) {
      accounts = await global.ethereum.request({ method: "eth_accounts" });
    }
    if (!accounts || accounts.length === 0) {
      throw new Error("No wallet account was shared. Please unlock MetaMask and try again.");
    }

    state.web3 = new global.Web3(global.ethereum);
    await loadNetwork();
    return state.account;
  }

  async function loadNetwork() {
    // loadNetwork is also called on start up to pick up an already unlocked
    // wallet, before connect() ran, so the instance is created here as well.
    if (!state.web3) {
      state.web3 = new global.Web3(global.ethereum);
    }

    const accounts = await global.ethereum.request({ method: "eth_accounts" });
    state.account = accounts && accounts.length > 0 ? accounts[0] : null;
    state.chainId = await global.ethereum.request({ method: "eth_chainId" });
    state.networkId = await state.web3.eth.net.getId();
    state.deployment = resolveDeployment(state.networkId);
    state.contractsLoaded = false;
    state.tokenInstances.clear();

    if (state.deployment) {
      loadContracts(state.deployment);
    }

    emit("network", { networkId: state.networkId, chainId: state.chainId, deployment: state.deployment });
    return state.networkId;
  }

  /** Creates the contract instances from the Truffle generated ABIs. */
  function loadContracts(deployment) {
    const abis = global.ASSET_CONTRACTS_ABI;
    if (!abis || !abis.AssetRegistry || !abis.AssetToken) {
      throw new Error("Contract ABIs are missing. Run: npm run sync");
    }

    state.registry = new state.web3.eth.Contract(abis.AssetRegistry, deployment.registry);
    state.tokenAbi = abis.AssetToken;
    state.contractsLoaded = true;
  }

  function requireConnection() {
    if (!isConnected()) {
      throw new Error("Please connect your MetaMask wallet.");
    }
    if (!hasContracts()) {
      throw new Error(
        `The contracts are not deployed on network ${state.networkId}. Start Ganache and run "npm run deploy" on the machine that runs Ganache.`
      );
    }
  }

  function disconnect() {
    // MetaMask does not allow a page to drop an account, so the application
    // simply forgets it and asks again on the next connect.
    state.account = null;
    state.contractsLoaded = false;
    state.tokenInstances.clear();
    emit("disconnected", null);
  }

  function getRegistry() {
    requireConnection();
    return state.registry;
  }

  function getRegistrySilent() {
    return state.contractsLoaded ? state.registry : null;
  }

  /** Reuses one token contract instance per token address. */
  function getToken(tokenAddress) {
    if (!state.tokenInstances.has(tokenAddress)) {
      if (!state.web3) {
        throw new Error("Please connect your MetaMask wallet.");
      }
      state.tokenInstances.set(
        tokenAddress,
        new state.web3.eth.Contract(state.tokenAbi, tokenAddress)
      );
    }
    return state.tokenInstances.get(tokenAddress);
  }

  // ---------------------------------------------------------------- reads

  async function call(method, fallback) {
    try {
      return await method.call();
    } catch (error) {
      if (fallback !== undefined) {
        return fallback;
      }
      throw error;
    }
  }

  async function getBalance(wallet) {
    if (!state.web3) {
      return 0;
    }
    return state.web3.utils.toBN(await state.web3.eth.getBalance(wallet)).toString();
  }

  async function getBlockNumber() {
    if (!state.web3) {
      return 0;
    }
    return state.web3.eth.getBlockNumber();
  }

  // ---------------------------------------------------------------- writes

  /**
   * Sends a transaction and reports its lifecycle to the UI.
   *
   * @param {object} options
   * @param {function} options.onStatus  called with "submitted" / "confirmed"
   * @returns {Promise<object>} the transaction receipt
   */
  async function sendTransaction(options) {
    const { method, from, value, onStatus } = options;
    const gas = options.gas;
    const label = options.label || "Transaction";

    if (from && state.account && from.toLowerCase() !== state.account.toLowerCase()) {
      throw new Error("The transaction must be sent from the connected wallet.");
    }

    const sender = from || state.account;
    const payload = { from: sender, gas };
    if (value !== undefined && value !== null && value !== "0") {
      payload.value = value;
    }

    let receipt;
    try {
      receipt = await method.send(payload);
    } catch (error) {
      throw await describeFailure(error, method, payload);
    }

    if (onStatus) {
      onStatus({
        stage: "submitted",
        label,
        hash: receipt.transactionHash,
        from: receipt.from
      });
    }

    const confirmed = await waitForReceipt(receipt.transactionHash);
    const transaction = await state.web3.eth.getTransaction(receipt.transactionHash);
    const block = await state.web3.eth.getBlock(confirmed.blockNumber);

    const details = {
      stage: "confirmed",
      label,
      hash: receipt.transactionHash,
      blockNumber: confirmed.blockNumber,
      from: transaction ? transaction.from : sender,
      to: transaction ? transaction.to : "-",
      gasUsed: confirmed.gasUsed,
      status: confirmed.status,
      timestamp: block ? block.timestamp : Math.floor(Date.now() / 1000)
    };

    if (onStatus) {
      onStatus(details);
    }
    return details;
  }

  /**
   * Builds the error shown to the user for a failed transaction. When the
   * provider only returns a receipt, the same call is replayed as a read only
   * call, which reports the Solidity revert reason on Ganache.
   */
  async function describeFailure(error, method, payload) {
    if (extractRevertReason(error)) {
      return friendly(new Error(friendlyError(error)));
    }

    // A user rejection or a connection problem cannot be improved by a replay.
    if (error && (error.code === 4001 || /user denied|user rejected/i.test(String(error.message)))) {
      return friendly(new Error(friendlyError(error)));
    }

    try {
      const callPayload = { from: payload.from };
      if (payload.value) {
        callPayload.value = payload.value;
      }
      await method.call(callPayload);
    } catch (replayError) {
      const reason = extractRevertReason(replayError);
      if (reason) {
        const described = friendly(new Error(describeRevertReason(reason)));
        described.revertReason = reason;
        described.originalError = error;
        return described;
      }
    }

    return friendly(new Error(friendlyError(error)));
  }

  /** Marks an error as already containing text that is safe to show. */
  function friendly(describedError) {
    describedError.friendly = true;
    return describedError;
  }

  /** Polls until the transaction is mined, so the UI can show a real receipt. */
  async function waitForReceipt(hash, attempts) {
    const limit = attempts || 45;
    for (let index = 0; index < limit; index++) {
      const receipt = await state.web3.eth.getTransactionReceipt(hash);
      if (receipt) {
        return receipt;
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error("The transaction was submitted but no confirmation arrived. Please check the transaction list.");
  }

  global.Blockchain = {
    GAS,
    state,
    isMetaMaskInstalled,
    isMetaMaskBrowser,
    onChange,
    emit,
    isConnected,
    hasContracts,
    connect,
    disconnect,
    loadNetwork,
    explorerUrl,
    getRegistry,
    getRegistrySilent,
    getToken,
    getBalance,
    getBlockNumber,
    call,
    sendTransaction,
    friendlyError,
    extractRevertReason,
    networkName: (id) => global.Utils.networkName(id === undefined || id === null ? state.networkId : id)
  };
})(window);
