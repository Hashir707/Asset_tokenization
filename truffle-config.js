/**
 * Truffle configuration for the Asset Tokenization prototype.
 *
 * Two networks are configured:
 *  - development : the Ganache instance started from the Ganache desktop app
 *                  (default 127.0.0.1:7545) which MetaMask also talks to.
 *  - test        : an in-process Ganache node, so `npm test` always works even
 *                  when no Ganache GUI is running.
 */

const ganache = require("ganache");

// One Ganache provider instance is shared by the whole test run, so every test
// file of `truffle test` hits the same chain.
let sharedTestProvider = null;
function testProvider() {
  if (sharedTestProvider === null) {
    sharedTestProvider = ganache.provider({
      logging: { quiet: true },
      chain: { chainId: 1337, networkId: 1337, hardfork: "shanghai" },
      wallet: { totalAccounts: 10, defaultBalance: 1000 },
      miner: { blockGasLimit: 12000000 }
    });
  }
  return sharedTestProvider;
}

module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,
      network_id: "*",
      gas: 8000000,
      gasPrice: 20000000000,
      // Ganache allows browser requests from the local front end page.
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      }
    },
    test: {
      provider: testProvider,
      network_id: "*",
      gas: 8000000
    }
  },

  compilers: {
    solc: {
      version: "0.8.20",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        },
        // The registry passes the full asset definition to the factory, which
        // needs the intermediate stack-based codegen to be avoided.
        viaIR: true,
        evmVersion: "paris"
      }
    }
  },

  mocha: {
    timeout: 200000
  }
};
