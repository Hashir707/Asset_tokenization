/**
 * Copies the Truffle build output into src/ so the front end always uses the
 * real ABIs and the real deployed addresses of the running blockchain.
 *
 *   build/contracts/AssetRegistry.json      -> src/contracts/AssetRegistry.json
 *   build/contracts/AssetToken.json         -> src/contracts/AssetToken.json
 *   build/deployments/<networkId>.json      -> src/js/contracts-config.js
 *   node_modules/web3/dist/web3.min.js      -> src/js/vendor/web3.min.js
 *
 * Run it after every deployment:  npm run sync
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const BUILD_CONTRACTS = path.join(ROOT, "build", "contracts");
const SRC_CONTRACTS = path.join(ROOT, "src", "contracts");
const SRC_CONFIG = path.join(ROOT, "src", "js", "contracts-config.js");
const SRC_ABIS = path.join(ROOT, "src", "js", "abis.js");
const SRC_VENDOR = path.join(ROOT, "src", "js", "vendor");

const REQUIRED_ARTIFACTS = ["AssetRegistry", "AssetToken", "AssetTokenFactory"];

function ensureDirectory(directory) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function copyArtifact(contractName) {
  const source = path.join(BUILD_CONTRACTS, `${contractName}.json`);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing ${source}. Run "npm run compile" first.`);
  }

  const artifact = JSON.parse(fs.readFileSync(source, "utf8"));
  const payload = {
    contractName: artifact.contractName,
    abi: artifact.abi
  };

  ensureDirectory(SRC_CONTRACTS);
  const target = path.join(SRC_CONTRACTS, `${contractName}.json`);
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return artifact;
}

/**
 * Truffle records the deployment of every contract inside the artifact, keyed
 * by the network id of the chain it was deployed to. That is the authoritative
 * place for the addresses, and it works for any Ganache network id.
 */
function collectDeployments(registryArtifact, factoryArtifact) {
  const networks = {};

  for (const [networkId, entry] of Object.entries(registryArtifact.networks || {})) {
    const factoryEntry = (factoryArtifact.networks || {})[networkId];
    if (!entry.address || !factoryEntry) {
      continue;
    }

    networks[networkId] = {
      networkId,
      networkName: networkId === "5777" ? "development (Ganache)" : `network ${networkId}`,
      registry: entry.address,
      tokenFactory: factoryEntry.address,
      // Truffle does not always record the block of a deployment, but it always
      // records the transaction, so the front end can look the block up.
      deploymentBlock: entry.blockNumber || null,
      deploymentTransaction: entry.transactionHash || null
    };
  }

  return networks;
}

function writeAbis(artifacts) {
  const abis = {};
  for (const contractName of REQUIRED_ARTIFACTS) {
    abis[contractName] = artifacts[contractName].abi;
  }

  const body = `/**
 * GENERATED FILE - do not edit by hand.
 * The complete ABIs produced by "truffle compile", bundled as plain
 * JavaScript so the browser can load them without a build step.
 */
window.ASSET_CONTRACTS_ABI = ${JSON.stringify(abis, null, 2)};
`;

  ensureDirectory(path.dirname(SRC_ABIS));
  fs.writeFileSync(SRC_ABIS, body);
}

function writeConfig(networks) {
  const config = {
    generatedAt: new Date().toISOString(),
    // Public block explorers are optional. A local Ganache chain has none, so
    // the front end shows the transaction hash and the block number instead.
    // Set this to e.g. "https://sepolia.etherscan.io/tx/" to enable links.
    explorerUrl: null,
    networks
  };

  const body = `/**
 * GENERATED FILE - do not edit by hand.
 * Produced by scripts/sync-contracts.js from the Truffle build output.
 * Run "npm run deploy" (or "npm run sync") to refresh it.
 */
window.ASSET_CONTRACTS_CONFIG = ${JSON.stringify(config, null, 2)};
`;

  ensureDirectory(path.dirname(SRC_CONFIG));
  fs.writeFileSync(SRC_CONFIG, body);
}

function copyWeb3() {
  const source = path.join(ROOT, "node_modules", "web3", "dist", "web3.min.js");
  if (!fs.existsSync(source)) {
    console.warn("! node_modules/web3/dist/web3.min.js is missing - run npm install");
    return false;
  }
  ensureDirectory(SRC_VENDOR);
  fs.copyFileSync(source, path.join(SRC_VENDOR, "web3.min.js"));
  return true;
}

function main() {
  const artifacts = {};
  for (const contractName of REQUIRED_ARTIFACTS) {
    artifacts[contractName] = copyArtifact(contractName);
    console.log(`  ABI copied : ${contractName} (${artifacts[contractName].abi.length} entries)`);
  }

  writeAbis(artifacts);
  const networks = collectDeployments(artifacts.AssetRegistry, artifacts.AssetTokenFactory);
  writeConfig(networks);
  const web3Copied = copyWeb3();

  console.log("  Web3.js    : " + (web3Copied ? "src/js/vendor/web3.min.js" : "skipped"));
  console.log("  ABIs       : src/js/abis.js");
  console.log("  Config     : src/js/contracts-config.js");

  const networkIds = Object.keys(networks);
  if (networkIds.length === 0) {
    console.log("");
    console.log("  ! No deployment found. Start Ganache and run:");
    console.log("      npm run deploy");
  } else {
    console.log("");
    console.log("  Deployed contract addresses:");
    for (const id of networkIds) {
      console.log(`    network ${id} (${networks[id].networkName})`);
      console.log(`      AssetRegistry      ${networks[id].registry}`);
      console.log(`      AssetTokenFactory  ${networks[id].tokenFactory}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`\nsync-contracts failed: ${error.message}\n`);
  process.exit(1);
}
