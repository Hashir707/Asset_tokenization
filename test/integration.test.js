const assert = require("assert");
const Web3 = require("web3");
const AssetRegistry = artifacts.require("AssetRegistry");
const AssetTokenFactory = artifacts.require("AssetTokenFactory");
const AssetToken = artifacts.require("AssetToken");

/**
 * End to end test of the workflow the project demonstrates:
 *
 *   register asset -> token created -> fractions held by the owner
 *   -> transfer fractions between wallets -> ownership percentages
 *   -> buy fractions from the asset owner -> full on-chain ledger
 */
contract("Integration: tokenized asset lifecycle", (accounts) => {
  const [admin, assetOwner, alice, bob, carol] = accounts;

  const PROPERTY = {
    name: "Mumbai Commercial Property",
    type: "Real Estate",
    description: "Commercial property tokenized for fractional ownership.",
    value: "100000000", // 10,00,000
    tokens: "10000",
    image: "https://example.org/property.png"
  };
  const PRICE = "10000"; // notional price of one fraction, in paise

  before(async () => {
    this.factory = await AssetTokenFactory.new({ from: admin });
    this.registry = await AssetRegistry.new(this.factory.address, { from: admin });
  });

  it("runs registration, fractional distribution, purchase and ledger check", async () => {
    // 1. Register the asset ------------------------------------------------
    const registration = await this.registry.registerAsset(
      PROPERTY.name,
      PROPERTY.type,
      PROPERTY.description,
      PROPERTY.value,
      PROPERTY.tokens,
      PROPERTY.image,
      assetOwner,
      { from: admin }
    );
    const registered = registration.logs.find((log) => log.event === "AssetRegistered");
    assert.ok(registered, "AssetRegistered was not emitted");
    assert.strictEqual(registered.args.assetId.toString(), "1");

    const asset = await this.registry.getAsset(1);
    assert.strictEqual(asset.assetName, PROPERTY.name);
    assert.strictEqual(asset.assetType, PROPERTY.type);
    assert.strictEqual(asset.owner, assetOwner);
    assert.strictEqual(asset.tokenPrice.toString(), PRICE);

    // The token contract was created by the factory and the whole supply was
    // issued to the owner of the real world asset.
    const token = await AssetToken.at(asset.tokenAddress);
    assert.strictEqual((await token.totalSupply()).toString(), PROPERTY.tokens);
    assert.strictEqual((await token.balanceOf(assetOwner)).toString(), PROPERTY.tokens);
    assert.strictEqual((await token.shareOf(assetOwner)).toString(), "10000"); // 100%
    assert.strictEqual((await token.owner()).toString().length, 42);

    // 2. Distribute fractions: A 25%, B 15%, owner keeps 60% --------------
    await token.transfer(alice, "2500", { from: assetOwner });
    await token.transfer(bob, "1500", { from: assetOwner });

    assert.strictEqual((await token.shareOf(alice)).toString(), "2500"); // 25%
    assert.strictEqual((await token.shareOf(bob)).toString(), "1500"); // 15%
    assert.strictEqual((await token.shareOf(assetOwner)).toString(), "6000"); // 60%

    const holders = await this.registry.getHolders(1);
    assert.strictEqual(holders.length, 3);
    const shares = holders
      .filter((holder) => holder.balance.toString() !== "0")
      .map((holder) => ({
        wallet: holder.wallet,
        balance: holder.balance.toString(),
        percent: Number(((Number(holder.balance) / 10000) * 100).toFixed(2))
      }));
    assert.strictEqual(shares.length, 3);
    assert.strictEqual(
      shares.reduce((total, holder) => total + holder.percent, 0).toFixed(0),
      "100",
      "ownership must add up to 100%"
    );

    // 3. A third wallet buys fractions from the asset owner ----------------
    const amount = 500;
    const cost = (BigInt(amount) * BigInt(PRICE)).toString();
    const ethBefore = await web3.eth.getBalance(carol);
    const ownerBefore = await token.balanceOf(assetOwner);

    await token.buy(amount, { from: carol, value: cost });

    assert.strictEqual((await token.balanceOf(carol)).toString(), String(amount));
    assert.strictEqual((await token.balanceOf(assetOwner)).toString(), (ownerBefore - amount).toString());
    const ethAfter = await web3.eth.getBalance(carol);
    assert.ok(BigInt(ethBefore) > BigInt(ethAfter), "the buyer must have paid on chain");
    assert.strictEqual((await token.shareOf(carol)).toString(), "500"); // 5%

    // 4. The whole story is written in the on-chain ledger ------------------
    const records = await this.registry.getAssetTransactions(1);
    assert.strictEqual(records.length, 5);
    assert.deepStrictEqual(
      records.map((record) => record.txType.toString()),
      ["1", "2", "3", "3", "4"],
      "unexpected ledger order"
    );
    assert.strictEqual(records[3].from, assetOwner);
    assert.strictEqual(records[3].to, bob);
    assert.strictEqual(records[3].tokenAmount.toString(), "1500");
    assert.strictEqual(records[4].to, carol);
    assert.strictEqual(records[4].valueAmount.toString(), cost);

    const totals = await this.registry.totalTokenizedValue();
    assert.strictEqual(totals[0].toString(), PROPERTY.value);
    assert.strictEqual(totals[1].toString(), PROPERTY.tokens);

    // 5. Every ledger entry can be traced back to a real transaction hash --
    //    this is what the transaction history screen of the front end shows.
    //    The log is decoded with the Truffle generated ABI, exactly like the
    //    browser does with web3.js.
    const client = new Web3(web3.currentProvider);
    const registryArtifact = require("../build/contracts/AssetRegistry.json");
    const recordedEvent = registryArtifact.abi.find((entry) => entry.name === "TransactionRecorded");
    const recordedTopic = client.eth.abi.encodeEventSignature(recordedEvent);

    const logged = await client.eth.getPastLogs({
      address: this.registry.address,
      fromBlock: 0,
      toBlock: "latest"
    });

    const hashByRecordId = new Map();
    for (const entry of logged) {
      if (entry.topics[0] !== recordedTopic) {
        continue; // other registry event, e.g. AssetRegistered
      }
      const decoded = client.eth.abi.decodeLog(recordedEvent.inputs, entry.data, entry.topics.slice(1));
      hashByRecordId.set(String(decoded.recordId), entry.transactionHash);
    }

    assert.strictEqual(hashByRecordId.size, 5, "every ledger entry must be traceable");

    const globalRecords = await this.registry.getTransactions(0, 0);
    assert.strictEqual(globalRecords.length, 5);
    // The ledger is append only, so the position of an entry is its id.
    globalRecords.forEach((record, recordId) => {
      const hash = hashByRecordId.get(String(recordId));
      assert.ok(hash, `record ${recordId} has no transaction hash`);
      assert.match(hash, /^0x[0-9a-f]{64}$/);
      assert.ok(record.blockNumber.toString().length > 0);
    });

    // Registration and the initial issuance happen in the same transaction,
    // the later movements each get their own hash.
    assert.strictEqual(hashByRecordId.get("0"), hashByRecordId.get("1"));
    assert.notStrictEqual(hashByRecordId.get("0"), hashByRecordId.get("2"));
  });

  it("keeps two assets completely independent", async () => {
    await this.registry.registerAsset(
      "Digital Gold Reserve",
      "Gold",
      "Allocated gold reserve.",
      "50000000",
      "5000",
      "",
      assetOwner,
      { from: admin }
    );

    const goldAsset = await this.registry.getAsset(2);
    const goldToken = await AssetToken.at(goldAsset.tokenAddress);
    const propertyAsset = await this.registry.getAsset(1);
    const propertyToken = await AssetToken.at(propertyAsset.tokenAddress);

    assert.notStrictEqual(goldAsset.tokenAddress, propertyAsset.tokenAddress);
    assert.strictEqual((await goldToken.balanceOf(assetOwner)).toString(), "5000");
    assert.strictEqual((await goldToken.balanceOf(alice)).toString(), "0");
    assert.strictEqual((await propertyToken.balanceOf(alice)).toString(), "2500");

    await goldToken.transfer(alice, "1000", { from: assetOwner });
    assert.strictEqual((await goldToken.balanceOf(alice)).toString(), "1000");
    assert.strictEqual((await propertyToken.balanceOf(alice)).toString(), "2500");

    const goldRecords = await this.registry.getAssetTransactions(2);
    assert.strictEqual(goldRecords.length, 3);
    assert.ok(goldRecords.every((record) => record.assetId.toString() === "2"));
  });
});
