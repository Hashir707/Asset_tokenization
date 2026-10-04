const AssetTokenFactory = artifacts.require("AssetTokenFactory");
const AssetRegistry = artifacts.require("AssetRegistry");

/**
 * Deployment order:
 *   1. AssetTokenFactory - deploys the ERC-20 contract of every new asset.
 *   2. AssetRegistry     - the catalogue, linked to the factory.
 *
 * The addresses of both contracts are written to build/deployments/<network>.json
 * by Truffle itself. Run `npm run sync` afterwards to copy the real ABIs and
 * addresses into src/ so the front end never uses placeholder addresses.
 */
module.exports = async function (deployer, network, accounts) {
  await deployer.deploy(AssetTokenFactory);
  const factory = await AssetTokenFactory.deployed();

  await deployer.deploy(AssetRegistry, factory.address);
  const registry = await AssetRegistry.deployed();

  /* eslint-disable no-console */
  console.log("");
  console.log("  Asset tokenization contracts deployed");
  console.log("  ------------------------------------");
  console.log("  Network        :", network);
  console.log("  Deployer       :", accounts[0]);
  console.log("  AssetTokenFactory:", factory.address);
  console.log("  AssetRegistry  :", registry.address);
  console.log("");
  console.log("  Next step: npm run sync   (loads ABIs + addresses into src/)");
  console.log("");
  /* eslint-enable no-console */
};
