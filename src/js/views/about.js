/**
 * About: what the system does, how the contracts are structured, and an
 * explicit statement of the limits of an academic prototype.
 */
(function (global) {
  "use strict";

  const { escapeHtml } = global.Utils;

  async function render(root) {
    const config = global.ASSET_CONTRACTS_CONFIG || { networks: {} };
    const networkId = global.Blockchain.state.networkId;
    const deployment = config.networks ? config.networks[String(networkId)] : null;
    const blockNumber = await global.Blockchain.getBlockNumber().catch(() => 0);

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>About this project</h1>
          <p class="muted" style="margin:0">How asset tokenization is modelled here, and what it does not do.</p>
        </div>
      </div>

      <div class="grid grid-2" style="align-items:start">
        <div class="prose">
          <div class="card">
            <h2>What it does</h2>
            <ul>
              <li>Registers a physical or digital asset with a name, type, value and a number of equal fractions.</li>
              <li>Deploys one ERC-20 token per asset, so every fraction is a transferable balance on the chain.</li>
              <li>Records every registration, mint, transfer and purchase in an append-only ledger, with the wallet, the number of fractions and the value at that moment.</li>
              <li>Shows the ownership of every asset, the share of each wallet in basis points and the full transaction history.</li>
            </ul>
          </div>

          <div class="card" style="margin-top:16px">
            <h2>How the contracts work together</h2>
            <ul>
              <li><strong>AssetTokenFactory</strong> deploys a token and wires it to the registry.</li>
              <li><strong>AssetRegistry</strong> is the single source of truth for assets, statuses and the ledger. It authorizes each token contract as a ledger recorder, so no other contract can write history.</li>
              <li><strong>AssetToken</strong> is an OpenZeppelin ERC-20 with a fixed supply, plus the rules of this project: only the asset owner can mint, the price per fraction is fixed at registration, and purchases move fractions from the owner to the buyer.</li>
              <li>Contract ownership is handed to the asset owner, so the token can never be frozen by a third party.</li>
            </ul>
          </div>

          <div class="card" style="margin-top:16px">
            <h2>Rules enforced by the contracts</h2>
            <ul>
              <li>The asset value must divide evenly by the number of fractions, so every fraction has exactly the same price.</li>
              <li>The total supply of an asset can never exceed the number of fractions defined at registration.</li>
              <li>Only the asset owner can mint, change the status or collect the proceeds of a sale.</li>
              <li>A purchase must send exactly the price of the fractions requested.</li>
              <li>Every balance change is written to the registry ledger in the same transaction.</li>
            </ul>
          </div>
        </div>

        <div class="stack" style="gap:16px">
          <div class="card">
            <h2>Current connection</h2>
            <dl class="kv-list">
              <div class="kv"><dt>Network</dt><dd>${escapeHtml(global.Utils.networkName(networkId))}</dd></div>
              <div class="kv"><dt>Network id</dt><dd>${escapeHtml(networkId)}</dd></div>
              <div class="kv"><dt>Block height</dt><dd>${escapeHtml(String(blockNumber))}</dd></div>
              <div class="kv"><dt>Wallet</dt><dd>${escapeHtml(
                global.Blockchain.state.account || "not connected"
              )}</dd></div>
            </dl>
            ${
              deployment
                ? `<h3 style="margin-top:18px">Deployed contracts</h3>
                   <dl class="kv-list">
                     <div class="kv"><dt>Registry</dt><dd class="mono">${escapeHtml(deployment.registry)}</dd></div>
                     <div class="kv"><dt>Factory</dt><dd class="mono">${escapeHtml(deployment.tokenFactory)}</dd></div>
                     <div class="kv"><dt>Deployed in block</dt><dd>${escapeHtml(String(deployment.deploymentBlock))}</dd></div>
                   </dl>`
                : `<div class="alert alert-warning" style="margin-top:14px">
                     The contracts of this project have not been deployed on network ${escapeHtml(String(networkId))}.
                     Start Ganache, run <code>npm run deploy</code> and reload.
                   </div>`
            }
          </div>

          <div class="card">
            <h2>Technology</h2>
            <div class="tag-row">
              <span class="tag">Solidity 0.8.20</span>
              <span class="tag">OpenZeppelin Contracts 4.9</span>
              <span class="tag">Truffle</span>
              <span class="tag">Ganache</span>
              <span class="tag">Web3.js 1.10</span>
              <span class="tag">MetaMask</span>
              <span class="tag">HTML / CSS / JavaScript</span>
            </div>
          </div>

          <div class="card" style="border-color:#fbc5c1;background:#fffafa">
            <h2>Limitations</h2>
            <p class="muted">
              This is an academic prototype built for a local development chain.
            </p>
            <ul class="prose" style="padding-left:18px;color:var(--text-soft)">
              <li>It does not transfer legal ownership of any physical asset. On-chain fractions are a record of a simulated arrangement.</li>
              <li>Purchases are settled in the test currency of the local network. No real payment is processed.</li>
              <li>There is no identity verification, no KYC, no oracle and no off-chain custody, which a real system would need.</li>
              <li>Asset values are entered by the owner. A production system would need an independent valuation.</li>
              <li>Contracts are not audited. Do not use them to hold real value.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;
  }

  global.Views = global.Views || {};
  global.Views.about = { render };
})(window);
