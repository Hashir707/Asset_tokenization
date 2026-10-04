const assert = require("assert");
const AssetRegistry = artifacts.require("AssetRegistry");
const AssetTokenFactory = artifacts.require("AssetTokenFactory");
const AssetToken = artifacts.require("AssetToken");

/** Values used across the tests, in the smallest unit (paise) of the reference currency. */
const SAMPLE = {
  name: "Mumbai Commercial Property",
  type: "Real Estate",
  description: "Commercial property tokenized for fractional ownership.",
  value: "100000000", // 10,00,000
  tokens: "10000",
  image: "https://example.org/property.png"
};

/**
 * Truffle surfaces a Solidity `require` as a rejected promise, so every
 * negative test asserts on the revert reason instead of only on "it failed".
 */
async function expectRevert(promise, expectedReason) {
  try {
    await promise;
    assert.fail("Expected the transaction to revert, but it succeeded");
  } catch (error) {
    assert.ok(
      error.message.includes(expectedReason),
      `Expected revert reason "${expectedReason}" but received: ${error.message}`
    );
  }
}

function registeredEvent(result) {
  return result.logs.find((log) => log.event === "AssetRegistered");
}

contract("AssetRegistry", (accounts) => {
  const [admin, assetOwner, other] = accounts;

  beforeEach(async () => {
    this.factory = await AssetTokenFactory.new({ from: admin });
    this.registry = await AssetRegistry.new(this.factory.address, { from: admin });
  });

  describe("deployment", () => {
    it("stores the factory and the admin", async () => {
      const factoryAddress = await this.registry.tokenFactory();
      assert.strictEqual(factoryAddress, this.factory.address);
      assert.strictEqual(await this.registry.owner(), admin);
    });

    it("rejects a zero address factory", async () => {
      await expectRevert(
        AssetRegistry.new("0x0000000000000000000000000000000000000000", { from: admin }),
        "AssetRegistry: factory is the zero address"
      );
    });
  });

  describe("registerAsset", () => {
    it("registers an asset, deploys its token and issues the full supply", async () => {
      const result = await this.registry.registerAsset(
        SAMPLE.name,
        SAMPLE.type,
        SAMPLE.description,
        SAMPLE.value,
        SAMPLE.tokens,
        SAMPLE.image,
        assetOwner,
        { from: other }
      );

      const event = registeredEvent(result);
      assert.ok(event, "AssetRegistered event was not emitted");
      assert.strictEqual(event.args.assetId.toString(), "1");
      assert.strictEqual(event.args.owner, assetOwner);
      assert.strictEqual(event.args.assetName, SAMPLE.name);
      assert.strictEqual(event.args.assetValue.toString(), SAMPLE.value);
      assert.strictEqual(event.args.totalTokens.toString(), SAMPLE.tokens);
      assert.strictEqual(event.args.tokenPrice.toString(), "10000");

      const asset = await this.registry.getAsset(1);
      assert.strictEqual(asset.assetId.toString(), "1");
      assert.strictEqual(asset.assetName, SAMPLE.name);
      assert.strictEqual(asset.assetType, SAMPLE.type);
      assert.strictEqual(asset.description, SAMPLE.description);
      assert.strictEqual(asset.assetValue.toString(), SAMPLE.value);
      assert.strictEqual(asset.totalTokens.toString(), SAMPLE.tokens);
      assert.strictEqual(asset.tokenPrice.toString(), "10000");
      assert.strictEqual(asset.owner, assetOwner);
      assert.strictEqual(asset.status.toString(), "0");
      assert.strictEqual(asset.exists, true);
      assert.ok(Number(asset.registeredAt.toString()) > 0, "timestamp was not stored");
      assert.ok(asset.tokenAddress !== "0x0000000000000000000000000000000000000000");

      const token = await AssetToken.at(asset.tokenAddress);
      assert.strictEqual(await token.name(), "Mumbai Commercial Property Share");
      assert.strictEqual((await token.totalSupply()).toString(), SAMPLE.tokens);
      assert.strictEqual((await token.balanceOf(assetOwner)).toString(), SAMPLE.tokens);
      assert.strictEqual(await token.assetOwner(), assetOwner);
      assert.strictEqual((await token.assetId()).toString(), "1");
    });

    it("increments the asset count and returns every asset", async () => {
      assert.strictEqual((await this.registry.getAssetCount()).toString(), "0");

      await this.registry.registerAsset("Asset One", "Gold", "d", "100000", "1000", "", assetOwner, { from: admin });
      await this.registry.registerAsset("Asset Two", "Vehicle", "d", "200000", "2000", "", other, { from: admin });

      assert.strictEqual((await this.registry.getAssetCount()).toString(), "2");
      const all = await this.registry.getAllAssets();
      assert.strictEqual(all.length, 2);
      assert.strictEqual(all[0].assetName, "Asset One");
      assert.strictEqual(all[1].assetName, "Asset Two");

      const ids = await this.registry.getAllAssetIds();
      assert.deepStrictEqual(ids.map((id) => id.toString()), ["1", "2"]);
      assert.strictEqual(await this.registry.assetExists(2), true);
      assert.strictEqual(await this.registry.assetExists(3), false);
    });

    it("rejects an empty asset name", async () => {
      await expectRevert(
        this.registry.registerAsset("", SAMPLE.type, "", SAMPLE.value, SAMPLE.tokens, "", assetOwner, { from: admin }),
        "AssetRegistry: asset name is required"
      );
    });

    it("rejects an empty asset type", async () => {
      await expectRevert(
        this.registry.registerAsset(SAMPLE.name, "", "", SAMPLE.value, SAMPLE.tokens, "", assetOwner, { from: admin }),
        "AssetRegistry: asset type is required"
      );
    });

    it("rejects an asset name that is too long", async () => {
      const longName = "A".repeat(129);
      await expectRevert(
        this.registry.registerAsset(longName, SAMPLE.type, "", SAMPLE.value, SAMPLE.tokens, "", assetOwner, { from: admin }),
        "AssetRegistry: asset name is too long"
      );
    });

    it("rejects an image URL that is too long", async () => {
      const longUrl = `https://example.org/${"a".repeat(2049)}`;
      await expectRevert(
        this.registry.registerAsset(SAMPLE.name, SAMPLE.type, "", SAMPLE.value, SAMPLE.tokens, longUrl, assetOwner, { from: admin }),
        "AssetRegistry: image URL is too long"
      );
    });

    it("rejects a zero asset value", async () => {
      await expectRevert(
        this.registry.registerAsset(SAMPLE.name, SAMPLE.type, "", "0", SAMPLE.tokens, "", assetOwner, { from: admin }),
        "AssetRegistry: asset value must be greater than zero"
      );
    });

    it("rejects a zero token supply", async () => {
      await expectRevert(
        this.registry.registerAsset(SAMPLE.name, SAMPLE.type, "", SAMPLE.value, "0", "", assetOwner, { from: admin }),
        "AssetRegistry: total tokens must be greater than zero"
      );
    });

    it("rejects a value that cannot be split evenly between the tokens", async () => {
      await expectRevert(
        this.registry.registerAsset(SAMPLE.name, SAMPLE.type, "", "100001", "10000", "", assetOwner, { from: admin }),
        "AssetRegistry: asset value must be divisible by total tokens"
      );
    });

    it("rejects the zero address as owner", async () => {
      await expectRevert(
        this.registry.registerAsset(
          SAMPLE.name,
          SAMPLE.type,
          "",
          SAMPLE.value,
          SAMPLE.tokens,
          "",
          "0x0000000000000000000000000000000000000000",
          { from: admin }
        ),
        "AssetRegistry: owner is the zero address"
      );
    });

    it("leaves the count untouched when a registration is rejected", async () => {
      await expectRevert(
        this.registry.registerAsset("", SAMPLE.type, "", SAMPLE.value, SAMPLE.tokens, "", assetOwner, { from: admin }),
        "AssetRegistry: asset name is required"
      );
      assert.strictEqual((await this.registry.getAssetCount()).toString(), "0");
    });

    it("rejects reads of an unknown asset", async () => {
      await expectRevert(this.registry.getAsset(42), "AssetRegistry: asset does not exist");
    });
  });

  describe("lifecycle", () => {
    beforeEach(async () => {
      await this.registry.registerAsset(
        SAMPLE.name,
        SAMPLE.type,
        SAMPLE.description,
        SAMPLE.value,
        SAMPLE.tokens,
        SAMPLE.image,
        assetOwner,
        { from: admin }
      );
    });

    it("lets the asset owner pause, resume and retire the asset", async () => {
      const paused = await this.registry.setAssetStatus(1, 1, { from: assetOwner });
      const pauseEvent = paused.logs.find((log) => log.event === "AssetStatusChanged");
      assert.strictEqual(pauseEvent.args.previousStatus.toString(), "0");
      assert.strictEqual(pauseEvent.args.newStatus.toString(), "1");
      assert.strictEqual((await this.registry.getAsset(1)).status.toString(), "1");
      assert.strictEqual(await this.registry.statusToString(1), "Paused");

      await this.registry.setAssetStatus(1, 0, { from: assetOwner });
      assert.strictEqual(await this.registry.statusToString(0), "Active");

      await this.registry.setAssetStatus(1, 2, { from: assetOwner });
      assert.strictEqual(await this.registry.statusToString(2), "Retired");
    });

    it("blocks a status change from an unrelated wallet", async () => {
      await expectRevert(this.registry.setAssetStatus(1, 1, { from: other }), "AssetRegistry: caller is not the asset owner");
    });

    it("blocks a status change with an unknown status code", async () => {
      await expectRevert(this.registry.setAssetStatus(1, 9, { from: assetOwner }), "AssetRegistry: unknown status");
    });

    it("reports the aggregates used by the dashboard", async () => {
      await this.registry.registerAsset("Digital Gold Reserve", "Gold", "", "50000000", "5000", "", other, { from: admin });

      const totals = await this.registry.totalTokenizedValue();
      assert.strictEqual(totals[0].toString(), "150000000");
      assert.strictEqual(totals[1].toString(), "15000");
    });
  });

  describe("ledger", () => {
    beforeEach(async () => {
      this.result = await this.registry.registerAsset(
        SAMPLE.name,
        SAMPLE.type,
        SAMPLE.description,
        SAMPLE.value,
        SAMPLE.tokens,
        SAMPLE.image,
        assetOwner,
        { from: admin }
      );
      this.asset = await this.registry.getAsset(1);
      this.token = await AssetToken.at(this.asset.tokenAddress);
    });

    it("records the registration and the initial issuance on chain", async () => {
      const records = await this.registry.getAssetTransactions(1);
      assert.strictEqual(records.length, 2);

      assert.strictEqual(records[0].txType.toString(), "1"); // asset registration
      assert.strictEqual(records[0].to, assetOwner);
      assert.strictEqual(records[0].valueAmount.toString(), SAMPLE.value);
      assert.strictEqual(records[1].txType.toString(), "2"); // token mint
      assert.strictEqual(records[1].tokenAmount.toString(), SAMPLE.tokens);
      assert.strictEqual(records[1].to, assetOwner);

      assert.strictEqual((await this.registry.getTransactionCount()).toString(), "2");
      assert.ok(records[0].blockNumber.toString().length > 0, "block number was not stored");
      assert.ok(records[0].timestamp.toString().length > 0, "timestamp was not stored");
    });

    it("tracks the ownership table of the asset", async () => {
      const holders = await this.registry.getHolders(1);
      assert.strictEqual(holders.length, 1);
      assert.strictEqual(holders[0].wallet, assetOwner);
      assert.strictEqual(holders[0].balance.toString(), SAMPLE.tokens);
      assert.strictEqual((await this.registry.holdingsOf(1, assetOwner)).toString(), SAMPLE.tokens);
      assert.strictEqual((await this.registry.holderCount(1)).toString(), "1");

      await this.token.transfer(other, "1000", { from: assetOwner });

      const holdersAfter = await this.registry.getHolders(1);
      assert.strictEqual(holdersAfter.length, 2);
      assert.strictEqual((await this.registry.holdingsOf(1, other)).toString(), "1000");
      assert.strictEqual((await this.registry.holdingsOf(1, assetOwner)).toString(), "9000");
    });

    it("records a transfer in the on-chain ledger", async () => {
      const transfer = await this.token.transfer(other, "1000", { from: assetOwner });

      // The ERC-20 Transfer event is emitted by the token itself.
      const erc20Event = transfer.logs.find((log) => log.event === "Transfer");
      assert.ok(erc20Event, "Transfer event was not emitted by the token");
      assert.strictEqual(erc20Event.args.value.toString(), "1000");

      // The matching ledger entry is appended by AssetRegistry, because the
      // token reports every balance change to the registry.
      const records = await this.registry.getAssetTransactions(1);
      assert.strictEqual(records.length, 3);

      const last = records[2];
      assert.strictEqual(last.txType.toString(), "3");
      assert.strictEqual(last.from, assetOwner);
      assert.strictEqual(last.to, other);
      assert.strictEqual(last.tokenAmount.toString(), "1000");
      assert.strictEqual(last.valueAmount.toString(), "10000000");
    });

    it("paginates the ledger", async () => {
      await this.token.transfer(other, "100", { from: assetOwner });
      await this.token.transfer(other, "200", { from: assetOwner });

      const page = await this.registry.getTransactions(0, 2);
      assert.strictEqual(page.length, 2);
      const recent = await this.registry.getRecentTransactions(2);
      assert.strictEqual(recent.length, 2);
      assert.strictEqual(recent[0].txType.toString(), "3");
      const past = await this.registry.getTransactions(10, 5);
      assert.strictEqual(past.length, 0);
    });

    it("only accepts ledger entries from a token of this registry", async () => {
      await expectRevert(
        this.registry.recordTransaction(3, 1, assetOwner, other, 10, 100, { from: other }),
        "AssetRegistry: caller is not a token of this registry"
      );
      assert.strictEqual(await this.registry.isLedgerRecorder(this.token.address), true);
      assert.strictEqual(await this.registry.isLedgerRecorder(other), false);
    });
  });
});
