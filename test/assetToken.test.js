const assert = require("assert");
const AssetRegistry = artifacts.require("AssetRegistry");
const AssetTokenFactory = artifacts.require("AssetTokenFactory");
const AssetToken = artifacts.require("AssetToken");
const IERC20 = artifacts.require("IERC20");

const ASSET = {
  name: "Digital Gold Reserve",
  type: "Gold",
  description: "Allocated gold reserve split into tradable fractions.",
  value: "50000000", // 5,00,000
  tokens: "5000",
  image: ""
};

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

contract("AssetToken", (accounts) => {
  const [admin, assetOwner, alice, bob] = accounts;

  beforeEach(async () => {
    const factory = await AssetTokenFactory.new({ from: admin });
    this.registry = await AssetRegistry.new(factory.address, { from: admin });
    await this.registry.registerAsset(
      ASSET.name,
      ASSET.type,
      ASSET.description,
      ASSET.value,
      ASSET.tokens,
      ASSET.image,
      assetOwner,
      { from: admin }
    );

    const asset = await this.registry.getAsset(1);
    this.asset = asset;
    this.token = await AssetToken.at(asset.tokenAddress);
  });

  describe("deployment", () => {
    it("exposes the asset it represents", async () => {
      assert.strictEqual(await this.token.name(), "Digital Gold Reserve Share");
      assert.strictEqual(await this.token.symbol(), "DIGI1");
      assert.strictEqual((await this.token.decimals()).toString(), "0");
      assert.strictEqual((await this.token.assetId()).toString(), "1");
      assert.strictEqual((await this.token.assetValue()).toString(), ASSET.value);
      assert.strictEqual((await this.token.totalTokens()).toString(), ASSET.tokens);
      assert.strictEqual((await this.token.tokenPrice()).toString(), "10000");
      assert.strictEqual(await this.token.assetOwner(), assetOwner);
      assert.strictEqual(await this.token.registryAddress(), this.registry.address);
    });

    it("can be used through the standard IERC20 interface", async () => {
      // The AssetToken is driven through the plain, asset agnostic IERC20
      // interface, i.e. exactly how a wallet, an exchange or an explorer
      // would talk to it. No asset specific function is involved.
      const erc20 = await IERC20.at(this.token.address);

      assert.strictEqual((await erc20.totalSupply()).toString(), ASSET.tokens);
      assert.strictEqual((await erc20.balanceOf(assetOwner)).toString(), ASSET.tokens);
      assert.strictEqual((await erc20.allowance(alice, bob)).toString(), "0");

      // The standard transfer and approve functions move the shares.
      await erc20.transfer(alice, "1000", { from: assetOwner });
      await erc20.approve(bob, "500", { from: alice });
      await erc20.transferFrom(alice, bob, "400", { from: bob });

      assert.strictEqual((await erc20.balanceOf(alice)).toString(), "600");
      assert.strictEqual((await erc20.balanceOf(bob)).toString(), "400");
      assert.strictEqual((await erc20.totalSupply()).toString(), ASSET.tokens);
    });

    it("issues the whole supply to the asset owner and hands over the token", async () => {
      assert.strictEqual((await this.token.totalSupply()).toString(), ASSET.tokens);
      assert.strictEqual((await this.token.balanceOf(assetOwner)).toString(), ASSET.tokens);
      assert.strictEqual((await this.token.balanceOf(alice)).toString(), "0");
      assert.strictEqual(await this.token.owner(), assetOwner);
    });

    it("computes the notional price and value of a holding", async () => {
      assert.strictEqual((await this.token.priceFor(100)).toString(), "1000000");
      assert.strictEqual((await this.token.valueHeldBy(assetOwner)).toString(), ASSET.value);
      assert.strictEqual((await this.token.valueHeldBy(alice)).toString(), "0");

      const info = await this.token.assetInfo();
      assert.strictEqual(info[0].toString(), "1");
      assert.strictEqual(info[1], assetOwner);
      assert.strictEqual(info[2].toString(), "10000");
      assert.strictEqual(info[3].toString(), ASSET.tokens);
    });

    it("starts with the asset owner holding 100% of the supply", async () => {
      assert.strictEqual((await this.token.shareOf(assetOwner)).toString(), "10000");
      assert.strictEqual((await this.token.shareOf(alice)).toString(), "0");
    });
  });

  describe("transfer", () => {
    it("moves tokens and updates both balances", async () => {
      const result = await this.token.transfer(alice, "1000", { from: assetOwner });

      const event = result.logs.find((log) => log.event === "Transfer");
      assert.ok(event, "Transfer event was not emitted");
      assert.strictEqual(event.args.from, assetOwner);
      assert.strictEqual(event.args.to, alice);
      assert.strictEqual(event.args.value.toString(), "1000");

      assert.strictEqual((await this.token.balanceOf(assetOwner)).toString(), "4000");
      assert.strictEqual((await this.token.balanceOf(alice)).toString(), "1000");
      assert.strictEqual((await this.token.totalSupply()).toString(), ASSET.tokens);
    });

    it("updates the ownership percentage of both wallets", async () => {
      await this.token.transfer(alice, "1250", { from: assetOwner });
      assert.strictEqual((await this.token.shareOf(alice)).toString(), "2500"); // 25.00%
      assert.strictEqual((await this.token.shareOf(assetOwner)).toString(), "7500"); // 75.00%

      await this.token.transfer(bob, "750", { from: assetOwner });
      assert.strictEqual((await this.token.shareOf(bob)).toString(), "1500"); // 15.00%
      assert.strictEqual((await this.token.shareOf(assetOwner)).toString(), "6000"); // 60.00%
    });

    it("supports approve and transferFrom", async () => {
      await this.token.transfer(alice, "1000", { from: assetOwner });
      await this.token.approve(bob, "800", { from: alice });
      assert.strictEqual((await this.token.allowance(alice, bob)).toString(), "800");

      await this.token.transferFrom(alice, bob, "300", { from: bob });
      assert.strictEqual((await this.token.balanceOf(alice)).toString(), "700");
      assert.strictEqual((await this.token.balanceOf(bob)).toString(), "300");
      assert.strictEqual((await this.token.allowance(alice, bob)).toString(), "500");
    });

    it("rejects a transfer larger than the balance", async () => {
      await expectRevert(
        this.token.transfer(alice, "5001", { from: assetOwner }),
        "ERC20: transfer amount exceeds balance"
      );
    });

    it("rejects a transfer from a wallet that holds nothing", async () => {
      await expectRevert(this.token.transfer(bob, "1", { from: alice }), "ERC20: transfer amount exceeds balance");
    });

    it("rejects a zero amount transfer", async () => {
      await expectRevert(
        this.token.transfer(alice, "0", { from: assetOwner }),
        "AssetToken: amount must be greater than zero"
      );
    });

    it("rejects a transfer to the zero address", async () => {
      await expectRevert(
        this.token.transfer("0x0000000000000000000000000000000000000000", "10", { from: assetOwner }),
        "AssetToken: cannot transfer to the zero address"
      );
    });

    it("rejects a transferFrom above the approved allowance", async () => {
      await this.token.transfer(alice, "1000", { from: assetOwner });
      await this.token.approve(bob, "100", { from: alice });
      await expectRevert(this.token.transferFrom(alice, bob, "200", { from: bob }), "ERC20: insufficient allowance");
    });
  });

  describe("minting (restricted)", () => {
    it("lets the asset owner mint while the cap of the asset is not reached", async () => {
      // The full supply was issued at creation, so any further mint is refused.
      await expectRevert(
        this.token.mintTo(alice, "1", { from: assetOwner }),
        "AssetToken: minting above the token cap of the asset"
      );
    });

    it("blocks minting from an unrelated wallet", async () => {
      await expectRevert(this.token.mintTo(alice, "1", { from: admin }), "Ownable: caller is not the owner");
    });

    it("blocks minting to the zero address", async () => {
      // Deployed directly, so the deployer keeps the token administrator role
      // and the guard of mintTo() is the only thing that can stop the call.
      const token = await AssetToken.new(
        "Standalone Token",
        "STAND",
        99,
        "1000000",
        "1000",
        assetOwner,
        this.registry.address,
        "",
        { from: admin }
      );

      await expectRevert(
        token.mintTo("0x0000000000000000000000000000000000000000", "1", { from: admin }),
        "AssetToken: mint to the zero address"
      );
      await expectRevert(token.mintTo(alice, "0", { from: admin }), "AssetToken: amount must be greater than zero");
      await expectRevert(token.mintTo(alice, "1000", { from: admin }), "caller is not a token of this registry");
    });

    it("lets the asset owner update the metadata URI", async () => {
      const result = await this.token.setMetadataURI("ipfs://demo/metadata.json", { from: assetOwner });
      const event = result.logs.find((log) => log.event === "TokenMetadataUpdated");
      assert.ok(event, "TokenMetadataUpdated was not emitted");
      assert.strictEqual(await this.token.metadataURI(), "ipfs://demo/metadata.json");
    });

    it("blocks a metadata update from an unrelated wallet", async () => {
      await expectRevert(
        this.token.setMetadataURI("ipfs://demo/hack.json", { from: alice }),
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("buy", () => {
    const price = "10000"; // notional price of one token, in paise

    it("sends the tokens to the buyer and records the purchase", async () => {
      const amount = 200;
      const cost = (BigInt(amount) * BigInt(price)).toString();

      const result = await this.token.buy(amount, { from: alice, value: cost });

      const purchased = result.logs.find((log) => log.event === "TokensPurchased");
      assert.ok(purchased, "TokensPurchased was not emitted");
      assert.strictEqual(purchased.args.buyer, alice);
      assert.strictEqual(purchased.args.amount.toString(), String(amount));
      assert.strictEqual(purchased.args.amountPaid.toString(), cost);

      assert.strictEqual((await this.token.balanceOf(alice)).toString(), String(amount));
      assert.strictEqual((await this.token.balanceOf(assetOwner)).toString(), String(5000 - amount));

      const records = await this.registry.getAssetTransactions(1);
      const last = records[records.length - 1];
      assert.strictEqual(last.txType.toString(), "4"); // token purchase
      assert.strictEqual(last.from, assetOwner);
      assert.strictEqual(last.to, alice);
      assert.strictEqual(last.tokenAmount.toString(), String(amount));
      assert.strictEqual(last.valueAmount.toString(), cost);
    });

    it("rejects a wrong payment amount", async () => {
      await expectRevert(
        this.token.buy(10, { from: alice, value: "1" }),
        "AssetToken: incorrect payment amount"
      );
    });

    it("rejects a purchase without any payment", async () => {
      await expectRevert(this.token.buy(10, { from: alice, value: "0" }), "AssetToken: incorrect payment amount");
    });

    it("rejects a zero amount purchase", async () => {
      await expectRevert(
        this.token.buy(0, { from: alice, value: "0" }),
        "AssetToken: amount must be greater than zero"
      );
    });

    it("rejects a purchase by the asset owner, who would only move tokens to itself", async () => {
      await expectRevert(
        this.token.buy(10, { from: assetOwner, value: (BigInt(10) * BigInt(price)).toString() }),
        "AssetToken: the asset owner cannot buy from itself"
      );
    });

    it("rejects a purchase larger than the supply still held by the asset owner", async () => {
      // The asset owner sells most of the fractions, so the remaining balance
      // is smaller than the requested purchase.
      await this.token.transfer(bob, "4000", { from: assetOwner });
      await expectRevert(
        this.token.buy(2000, { from: alice, value: (BigInt(2000) * BigInt(price)).toString() }),
        "ERC20: transfer amount exceeds balance"
      );
    });
  });

  describe("withdrawProceeds", () => {
    const price = "10000";

    it("sends the collected payment to the asset owner", async () => {
      const cost = (BigInt(300) * BigInt(price)).toString();
      await this.token.buy(300, { from: alice, value: cost });

      const heldByContract = await web3.eth.getBalance(this.token.address);
      assert.ok(
        web3.utils.toBN(heldByContract).gt(web3.utils.toBN(0)),
        "the payment should be held by the token contract before it is withdrawn"
      );

      const before = await web3.eth.getBalance(assetOwner);
      const result = await this.token.withdrawProceeds({ from: assetOwner });
      const after = await web3.eth.getBalance(assetOwner);

      const event = result.logs.find((log) => log.event === "ProceedsWithdrawn");
      assert.ok(event, "ProceedsWithdrawn was not emitted");
      assert.strictEqual(event.args.to, assetOwner);
      assert.strictEqual(event.args.amount.toString(), cost);

      const gasCost = web3.utils.toBN(result.receipt.gasUsed).mul(web3.utils.toBN(result.receipt.effectiveGasPrice));
      assert.strictEqual(web3.utils.toBN(after).sub(web3.utils.toBN(before)).add(gasCost).toString(), cost);
      assert.strictEqual((await web3.eth.getBalance(this.token.address)).toString(), "0");
    });

    it("is blocked for a wallet that is not the asset owner", async () => {
      await this.token.buy(100, { from: alice, value: (BigInt(100) * BigInt(price)).toString() });
      await expectRevert(
        this.token.withdrawProceeds({ from: alice }),
        "AssetToken: caller is not the asset owner"
      );
    });

    it("rejects a withdrawal when no payment was collected", async () => {
      await expectRevert(
        this.token.withdrawProceeds({ from: assetOwner }),
        "AssetToken: no proceeds to withdraw"
      );
    });
  });
});
