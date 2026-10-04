# Asset Tokenization

A blockchain based prototype that turns a physical or digital asset into a fixed supply of
transferable fractions, and keeps a permanent ledger of who owns what.

Each asset gets its own **ERC-20 token**. The supply is fixed at registration, every fraction has
exactly the same price, and every registration, mint, transfer and purchase is written to an
append-only ledger by the contracts themselves.

- **Contracts:** Solidity 0.8.20, OpenZeppelin Contracts 4.9
- **Tooling:** Truffle 5.11, Ganache 7.9
- **Front end:** plain HTML, CSS and JavaScript with Web3.js 1.10 and MetaMask, no build step

> This is an academic prototype running on a local development chain. It does not transfer legal
> ownership of a physical asset, and no real payment is processed. See [Limitations](#limitations).

---

## Quick start

Prerequisites: **Node.js 18 or 20** (Node 24 works, but Ganache prints a harmless `uws_win32_x64`
warning on startup) and the **MetaMask** browser extension.

```bash
npm install          # install dependencies
npm run ganache      # terminal 1: start the local blockchain on port 7545
npm run deploy       # terminal 2: compile and deploy the contracts
npm run seed         # terminal 2: create the three sample assets
npm start            # terminal 2: serve the front end on http://localhost:8080
```

Open <http://localhost:8080>, click **Connect Wallet** and approve the connection in MetaMask.

If you prefer the Ganache desktop application instead of `npm run ganache`, start it with
**10 unlocked accounts** and the RPC endpoint `http://127.0.0.1:7545`.

---

## Connecting MetaMask

Add a custom network in MetaMask:

| Field           | Value                        |
| --------------- | ---------------------------- |
| Network name    | Ganache Local                |
| RPC URL         | `http://127.0.0.1:7545`      |
| Chain ID        | `1337`                       |
| Currency symbol | ETH                          |

The chain id shown by the Ganache CLI is `1337` and its network id is `5777`. The front end looks
the contracts up by **network id**, so it works with any id your Ganache reports: after every
deployment `npm run deploy` writes the real addresses of the running chain into
`src/js/contracts-config.js`.

For a good demo, import two or three of the unlocked Ganache accounts into MetaMask so you can
act as the asset owner, a buyer and a third wallet at the same time.

---

## npm commands

| Command             | What it does                                                                   |
| ------------------- | ------------------------------------------------------------------------------ |
| `npm run ganache`   | Starts Ganache on `127.0.0.1:7545` with 10 unlocked accounts                   |
| `npm run compile`   | Compiles the contracts with Truffle                                            |
| `npm run deploy`    | Migrates and deploys the contracts, then refreshes the front end configuration |
| `npm run migrate`   | Runs the migrations only                                                        |
| `npm test`          | Runs the test suite on an in-process Ganache instance                           |
| `npm run seed`      | Creates the three sample assets and distributes fractions. Safe to run again    |
| `npm start`         | Serves the front end from `src/` on port 8080                                  |
| `npm run sync`      | Copies the real ABIs, Web3.js and the deployed addresses into `src/js/`         |

`npm run deploy` and `npm run seed` both call `npm run sync` automatically, so the front end never
shows an ABI or an address that does not match the deployment.

---

## How it works

### The contracts

| Contract              | Responsibility                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `AssetTokenFactory`   | Deploys a token per asset and wires it to the registry                                     |
| `AssetRegistry`       | Single source of truth: assets, statuses, holders, aggregates and the transaction ledger    |
| `AssetToken`          | OpenZeppelin ERC-20 plus the rules of this project: fixed supply, fixed price, purchases     |
| `AssetTxType`         | Shared transaction type constants used by the token and the registry                         |

Registering an asset runs one transaction that:

1. stores the asset in the registry,
2. deploys its token contract through the factory,
3. authorizes that token as a ledger recorder,
4. mints the full supply to the asset owner, and
5. hands the ownership of the token contract to the asset owner.

Because the registry authorizes exactly one recorder per token, no other contract can write
history for an asset.

### Rules enforced on chain

- The asset value must divide evenly by the number of fractions, so every fraction has one price.
- The supply can never exceed the number of fractions defined at registration.
- Only the asset owner can mint, change the status or collect the proceeds of a sale.
- A purchase must send exactly `price x amount`, and the owner cannot buy from itself.
- A paused or retired asset accepts no new purchases, while existing fractions stay transferable.
- Every balance change is written to the ledger in the same transaction that causes it.

### Units

Amounts are stored in **paise**, the smallest unit, as integers. The interface enters and displays
rupees and converts with `value / 100`, so `250000` is shown as `Rs 2,50,000`. This avoids the
floating point errors of a token that divides by `10^18` and keeps every share exactly verifiable.

Token price per fraction is `assetValue / totalTokens`. Ownership is reported in basis points
(`10000` = `100.00%`) by the contract itself, not computed in the browser.

### The ledger and transaction hashes

A ledger entry stores the type, asset, sender, receiver, number of fractions, value, block number
and timestamp. It does not store the transaction hash, because a record is written by a contract
and cannot know the hash of the transaction that contains it.

To show a verifiable hash on every row, the front end decodes the `TransactionRecorded` event logs
of the registry and matches them to the entries by block number and timestamp. A registration writes
two entries in one transaction, so both correctly resolve to the same hash.

---

## Project structure

```
Asset_tokenization/
|-- contracts/                  Solidity sources
|   |-- AssetRegistry.sol       Assets, statuses, holders, ledger
|   |-- AssetToken.sol          ERC-20 token of one asset
|   |-- AssetTokenFactory.sol   Deploys and wires the token contracts
|   |-- AssetTxType.sol         Shared transaction type constants
|   |-- IERC20.sol              Standard interface used by the tests
|   `-- Migrations.sol          Truffle bookkeeping
|-- migrations/                 Deployment order: factory, then registry
|-- test/                       52 tests
|   |-- assetRegistry.test.js
|   |-- assetToken.test.js
|   `-- integration.test.js
|-- scripts/
|   |-- sync-contracts.js       Copies ABIs, Web3.js and addresses into src/
|   |-- seed-demo.js            Idempotent sample data
|   `-- serve.js                Static file server, no dependencies
|-- src/                        The front end, no build step
|   |-- index.html
|   |-- css/styles.css
|   |-- contracts/              Truffle ABIs as JSON, for reference
|   `-- js/
|       |-- vendor/web3.min.js  Copied from node_modules
|       |-- abis.js             GENERATED: the ABIs as browser JavaScript
|       |-- contracts-config.js GENERATED: deployed addresses per network
|       |-- utils.js            Formatting, validation, DOM helpers
|       |-- blockchain.js       Web3, wallet, contracts, transactions
|       |-- store.js            Reads the chain and caches the results
|       |-- ui.js               Toasts, modals, shared components
|       |-- views/              One module per page
|       `-- app.js              Hash router and start up
|-- truffle-config.js
`-- package.json
```

### The front end layers

The interface is deliberately split so that the blockchain access is testable on its own:

- **`blockchain.js`** owns Web3, the wallet connection, the contract instances and the transaction
  helper. Every transaction passes an explicit gas limit, because Web3.js otherwise falls back to
  its own default of 90,000 gas, which is far too little to deploy a token contract and would make
  a registration fail without a clear message.
- **`store.js`** turns raw contract results into plain objects and caches them until a transaction
  changes the chain.
- **`views/`** only render and dispatch user actions; none of them talk to Web3 directly.
- **`ui.js`** provides the shared components, so the same modal, toast and empty state look the same
  on every page.

When a transaction fails, the Solidity revert reason is translated into a sentence a user can act
on. Because Ganache reports only a receipt on a failed send, the same call is replayed as a read
only call to recover the reason.

---

## Testing

```bash
npm test
```

52 tests run on an in-process Ganache instance, so no external node is needed. They cover registry
validation, the ledger, holder tracking and aggregates, ERC-20 behaviour, the purchase flow, the
owner restrictions, the status rules, and a full lifecycle from registration to a traced
transaction hash.

---

## Trying it out

The sample data creates three assets and distributes fractions to different wallets, so the
dashboard and the ledger are populated immediately:

| Asset                    | Type       | Value        | Fractions | Price per fraction |
| ------------------------ | ---------- | ------------ | --------- | ------------------ |
| Mumbai Commercial Property | Real Estate | Rs 10,00,000 | 10,000  | Rs 100             |
| Digital Gold Reserve     | Gold       | Rs 5,00,000  | 5,000     | Rs 100             |
| Classic Artwork          | Artwork    | Rs 7,50,000  | 7,500     | Rs 100             |

A short walkthrough:

1. **Home** shows the live totals read from the contracts.
2. **Register Asset** creates a new asset. The preview updates while you type and applies the same
   rules as the contract. Confirming writes one transaction, and the receipt is shown when it is
   mined.
3. **Assets** lists everything, with search and filters. Open an asset to see its ownership
   distribution and its own ledger.
4. **Buy fractions** moves tokens from the owner to your wallet. On the local chain the payment is
   settled in test ETH, which stays in the token contract until the owner uses **Collect
   proceeds**.
5. **Transfer fractions** sends tokens to any other wallet, and the movement is recorded.
6. As the asset owner you can **Pause**, **Activate**, **Retire** the asset and **Collect
   proceeds**.
7. **Transactions** lists the whole ledger, and every row links to the transaction that produced it.

To start over, stop Ganache and run `npm run deploy` and `npm run seed` again: a fresh chain means
fresh contract addresses, which `npm run deploy` writes into the front end for you.

---

## Limitations

- Tokens are a technical representation of a simulated arrangement. They are not legal title, and
  legal ownership depends on the applicable law and on legal agreements outside this code.
- Purchases are settled in the test currency of the local network. No real money moves.
- Asset values are entered by the owner. A real system needs an independent valuation or oracle.
- There is no identity verification, no KYC/AML, no off-chain custody and no dispute mechanism.
- The contracts are not audited. Do not use them to hold real value.
- Ganache keeps all state in memory: restarting it discards the chain and every transaction.

---

## Troubleshooting

**"The contracts are not deployed on network ..."** — the addresses in
`src/js/contracts-config.js` do not match the chain MetaMask is connected to. Start Ganache, run
`npm run deploy` on the same machine, and make sure MetaMask uses the RPC URL of that node.

**A registration fails immediately** — creating a token contract needs more gas than a normal call.
The interface already sends 6,500,000 gas for a registration; if you changed the limits, keep them
above the ~2.5 million the deployment actually uses.

**Nothing is displayed and the console is empty** — open the browser console. If `web3` is
`undefined`, run `npm run sync` to copy Web3.js into `src/js/vendor/`.

**`Error: Cannot find module '../binaries/uws_win32_x64_137.node'`** — a harmless Ganache warning on
newer Node versions. It falls back to its own WebSocket implementation and everything works. Use
Node 18 or 20 if you want a silent start.
