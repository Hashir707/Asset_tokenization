/**
 * Home: explains the idea, shows the live state of the chain and links to the
 * main actions. All numbers are read from the contracts, none are hard coded.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor } = global.Utils;

  async function render(root) {
    root.innerHTML = global.UI.loading("Reading the state of the chain...");

    let summary = null;
    let assets = [];
    try {
      [summary, assets] = await Promise.all([global.Store.loadSummary(), global.Store.loadAssets()]);
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    const connected = global.Blockchain.isConnected();
    const totalValue = summary ? summary.totalValue : "0";
    const totalTokens = summary ? summary.totalTokens : "0";
    const featured = assets.slice(0, 3);

    root.innerHTML = `
      <section class="hero">
        <div>
          <h1>Own a fraction of a <span>real asset</span>, recorded on the blockchain.</h1>
          <p class="hero-lead">
            Each asset is divided into equal priced fractions and issued as an ERC-20 token.
            Every registration, mint, transfer and purchase is written to an immutable ledger,
            so the ownership history of a fraction can be verified at any time.
          </p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/register">Register an asset</a>
            <a class="btn btn-secondary" href="#/assets">Browse tokenized assets</a>
          </div>
          <div class="hero-points">
            <span>◈ Fixed supply, verified on chain</span>
            <span>◈ Fractional ownership transfers</span>
            <span>◈ Complete audit trail</span>
          </div>
        </div>

        <div class="flow">
          <h3 style="margin-bottom:12px">How an asset becomes tradable</h3>
          <div class="flow-step">
            <span class="flow-index">1</span>
            <div><strong>Describe the asset</strong><small>Name, type, value and total fractions</small></div>
          </div>
          <div class="flow-arrow">↓</div>
          <div class="flow-step">
            <span class="flow-index">2</span>
            <div><strong>Token contract is created</strong><small>One ERC-20 token per asset, linked to the registry</small></div>
          </div>
          <div class="flow-arrow">↓</div>
          <div class="flow-step">
            <span class="flow-index">3</span>
            <div><strong>Fractions are issued</strong><small>The full supply is minted to the asset owner</small></div>
          </div>
          <div class="flow-arrow">↓</div>
          <div class="flow-step">
            <span class="flow-index">4</span>
            <div><strong>Fractions change hands</strong><small>Buys and transfers are recorded permanently</small></div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="grid grid-4">
          ${global.UI.statCard("Tokenized assets", formatInteger(summary ? summary.assetCount : 0), "registered on this chain")}
          ${global.UI.statCard("Total tokenized value", formatCurrencyFromMinor(totalValue, { compact: true, decimals: 0 }), "notional, from the contract")}
          ${global.UI.statCard("Fractions in circulation", formatInteger(totalTokens), "issued ERC-20 tokens")}
          ${global.UI.statCard("Connected wallet", connected ? global.Utils.shortAddress(global.Blockchain.state.account) : "Not connected", connected ? global.Utils.networkName(global.Blockchain.state.networkId) : "Connect MetaMask to trade")}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Recently registered</h2>
          <a href="#/assets">View all assets →</a>
        </div>
        ${
          featured.length === 0
            ? global.UI.emptyState(
                "No assets yet",
                "The registry is empty. Register the first asset to see it here.",
                `<a class="btn btn-primary" href="#/register">Register an asset</a>`
              )
            : `<div class="asset-grid">${featured.map(assetCard).join("")}</div>`
        }
      </section>

      <section class="section">
        <div class="card">
          <div class="row-between">
            <div>
              <h2 style="margin-bottom:4px">Academic prototype</h2>
              <p class="muted" style="margin:0;max-width:62ch">
                This project demonstrates how asset tokenization can be modelled with smart contracts.
                It runs on a local development chain, the payments are settled in test currency only,
                and nothing here transfers legal ownership of a physical asset.
              </p>
            </div>
            <a class="btn btn-secondary" href="#/about">Read the details</a>
          </div>
        </div>
      </section>`;
  }

  /** Asset card used on the home page and on the assets page. */
  function assetCard(asset) {
    const status = global.UI.statusBadge(asset.status);
    return `<article class="asset-card" data-asset-card data-name="${escapeHtml(asset.assetName.toLowerCase())}" data-type="${escapeHtml(
      asset.assetType
    )}" data-status="${asset.status}">
      <a href="#/assets/${escapeHtml(asset.assetId)}" style="display:block;color:inherit">${global.UI.assetMedia(asset)}</a>
      <div class="asset-body">
        <div class="asset-title">
          <div>
            <h3><a href="#/assets/${escapeHtml(asset.assetId)}">${escapeHtml(asset.assetName)}</a></h3>
            <small>${escapeHtml(asset.tokenName)} · ${escapeHtml(asset.tokenSymbol)}</small>
          </div>
          ${status}
        </div>
        <dl class="kv-list">
          <div class="kv"><dt>Asset value</dt><dd>${formatCurrencyFromMinor(asset.assetValue, { decimals: 0 })}</dd></div>
          <div class="kv"><dt>Price per fraction</dt><dd>${formatCurrencyFromMinor(asset.tokenPrice, { decimals: 0 })}</dd></div>
          <div class="kv"><dt>Fractions</dt><dd>${formatInteger(asset.totalTokens)}</dd></div>
        </dl>
        <div class="asset-actions">
          <a class="btn btn-primary btn-sm" href="#/assets/${escapeHtml(asset.assetId)}">View details</a>
          <a class="btn btn-secondary btn-sm" href="#/assets/${escapeHtml(asset.assetId)}?action=buy">Buy fractions</a>
        </div>
      </div>
    </article>`;
  }

  global.Views = global.Views || {};
  global.Views.home = { render, assetCard };
})(window);
