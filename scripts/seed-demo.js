/**
 * Optional demo data for local demonstrations.
 *
 *   1. start Ganache
 *   2. npm run deploy
 *   3. npm run seed
 *
 * The script registers three clearly marked sample assets and splits their
 * fractions over the first three Ganache accounts, so the ownership screens
 * and the transaction history have something to show before the live
 * registration part of the presentation.
 *
 * The script is idempotent: assets that already exist are skipped.
 */

const fs = require("fs");
const path = require("path");
const Web3 = require("web3");

const ROOT = path.resolve(__dirname, "..");
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:7545";
const NETWORK_ID = process.env.NETWORK_ID || "5777";

/** A compact inline SVG keeps the demo images working without internet access. */
function demoImage(label, from, to) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="360" fill="url(#g)"/>` +
    `<text x="320" y="196" font-family="Segoe UI,Arial,sans-serif" font-size="44" font-weight="600" ` +
    `fill="#ffffff" text-anchor="middle" opacity="0.95">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_ASSETS = [
  {
    name: "Mumbai Commercial Property",
    type: "Real Estate",
    description:
      "Sample data: a commercial office unit in Mumbai, tokenized for demonstration of fractional ownership.",
    value: "100000000", // 10,00,000 in the smallest unit (paise)
    tokens: "10000",
    image: demoImage("Real Estate", "#4f46e5", "#0ea5e9"),
    // 25% to the second account, 15% to the third account
    distribution: [
      { accountIndex: 1, percent: 25 },
      { accountIndex: 2, percent: 15 }
    ]
  },
  {
    name: "Digital Gold Reserve",
    type: "Gold",
    description: "Sample data: an allocated gold reserve, tokenized to show commodity backed fractions.",
    value: "50000000", // 5,00,000
    tokens: "5000",
    image: demoImage("Gold", "#b45309", "#f59e0b"),
    distribution: [{ accountIndex: 1, percent: 40 }]
  },
  {
    name: "Classic Artwork",
    type: "Artwork",
    description: "Sample data: a collectible artwork, tokenized to show that any asset can carry shares.",
    value: "75000000", // 7,50,000
    tokens: "7500",
    image: demoImage("Artwork", "#7c3aed", "#db2777"),
    distribution: [{ accountIndex: 2, percent: 20 }]
  }
];

function readArtifact(name) {
  const file = path.join(ROOT, "build", "contracts", `${name}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}. Run "npm run compile" first.`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readDeployment() {
  // Truffle stores the deployed address of every contract inside the
  // artifact, keyed by the network id of the chain it was deployed to.
  const artifact = readArtifact("AssetRegistry");
  const entry = (artifact.networks || {})[NETWORK_ID];
  if (!entry || !entry.address) {
    throw new Error(
      `The registry is not deployed on network ${NETWORK_ID}.\n` +
        `Deploy the contracts first:  npm run deploy\n` +
        `If your Ganache uses another network id, set NETWORK_ID to that id.`
    );
  }
  return entry.address;
}

/**
 * Sends a transaction with a gas limit derived from an estimation plus a
 * margin, and turns a failure into a readable message.
 *
 * The gas limit is always explicit: web3.js falls back to its own defaultGas
 * of 90,000 when none is given, which is far too little to deploy the token
 * contract of a new asset, and the transaction would then fail without any
 * usable reason.
 */
async function sendOrExplain(method, from, action) {
  const firstLine = (error) => String(error.message).split("\n")[0];

  let gas;
  try {
    gas = Math.ceil((await method.estimateGas({ from })) * 1.3);
  } catch (error) {
    throw new Error(`${action} was rejected by the contract: ${firstLine(error)}`);
  }

  try {
    return await method.send({ from, gas });
  } catch (error) {
    if (error.receipt) {
      throw new Error(`${action} failed on chain (status ${error.receipt.status}, gas used ${error.receipt.gasUsed})`);
    }
    throw new Error(`${action} failed: ${firstLine(error)}`);
  }
}

async function main() {
  const artifact = readArtifact("AssetRegistry");
  const registryAddress = readDeployment();

  const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
  const registry = new web3.eth.Contract(artifact.abi, registryAddress);
  const accounts = await web3.eth.getAccounts();

  console.log("");
  console.log("  Seeding sample assets");
  console.log("  ---------------------");
  console.log(`  RPC      : ${RPC_URL}`);
  console.log(`  Registry : ${registryAddress}`);
  console.log(`  Accounts : ${accounts.length} unlocked`);
  console.log("");

  if (accounts.length < 2) {
    throw new Error("The local chain exposes fewer than two accounts, cannot distribute the fractions.");
  }

  const existing = await registry.methods.getAllAssets().call();
  const tokenAbi = readArtifact("AssetToken").abi;

  for (const sample of SAMPLE_ASSETS) {
    const alreadyRegistered = existing.find((asset) => asset.assetName === sample.name);
    let asset = alreadyRegistered;

    if (alreadyRegistered) {
      console.log(`  = ${sample.name} already registered`);
    } else {
      const receipt = await sendOrExplain(
        registry.methods.registerAsset(
          sample.name,
          sample.type,
          sample.description,
          sample.value,
          sample.tokens,
          sample.image,
          accounts[0]
        ),
        accounts[0],
        `Registering "${sample.name}"`
      );

      const assetId = Number(await registry.methods.getAssetCount().call());
      asset = await registry.methods.getAsset(assetId).call();
      console.log(`  + ${sample.name}`);
      console.log(`    asset id       : ${asset.assetId}`);
      console.log(`    token contract : ${asset.tokenAddress}`);
      console.log(`    price per token: ${asset.tokenPrice} (in the smallest currency unit)`);
      console.log(`    tx hash        : ${receipt.transactionHash}`);
    }

    // Split the fractions so the ownership screens are meaningful right away.
    // The script is idempotent: only the missing part of a share is sent.
    for (const entry of sample.distribution) {
      const target = Math.floor((Number(sample.tokens) * entry.percent) / 100);
      const token = new web3.eth.Contract(tokenAbi, asset.tokenAddress);
      const alreadyHeld = Number(await token.methods.balanceOf(accounts[entry.accountIndex]).call());
      const amount = String(target - alreadyHeld);

      if (amount === "0") {
        console.log(`    ${entry.percent}% already distributed, skipped`);
        continue;
      }

      const transferReceipt = await sendOrExplain(
        token.methods.transfer(accounts[entry.accountIndex], amount),
        accounts[0],
        `Transferring ${amount} tokens of "${sample.name}"`
      );

      console.log(
        `    ${entry.percent}% -> ${accounts[entry.accountIndex]} (${amount} tokens, tx ${transferReceipt.transactionHash})`
      );
    }
  }

  const totals = await registry.methods.totalTokenizedValue().call();
  console.log("");
  console.log(
    `  Done. ${await registry.methods.getAssetCount().call()} assets, ` +
      `${totals[1]} fractions, value ${totals[0]} (in the smallest currency unit).`
  );
  console.log("");
}

main().catch((error) => {
  console.error(`\nSeeding failed: ${error.message}\n`);
  if (error.message.includes("ECONNREFUSED")) {
    console.error("Is Ganache running? Start it and make sure it listens on " + RPC_URL + "\n");
  }
  process.exit(1);
});
