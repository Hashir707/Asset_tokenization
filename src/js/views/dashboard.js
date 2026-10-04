/**
 * Dashboard: the overview of the chain and of the connected wallet, with the
 * most recent ledger activity.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor } = global.Utils;

  async function render(root) {
    root.innerHTML = global.UI.loading("Building the dashboard...");

    let summary = null;
    let assets = [];
    let records = [];
    try {
      summary = await global.Store.loadSummary();
      assets = await global.Store.loadAssets();
      records = await global.Store.loadTransactions(12).catch(() => []);
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    const account = global.Blockchain.state.account;
    const myAssets = assets.filter((asset) => BigInt(asset.myBalance) > 0n);
    const myFractions = myAssets.reduce((sum, asset) => sum + BigInt(asset.myBalance), 0n);
    const myValue = myAssets.reduce((sum, asset) => sum + BigInt(asset.myValue), 0n);
    const myOwnedAssets = assets.filter((asset) => account && asset.owner.toLowerCase() === account.toLowerCase());

    const byType = {};
    assets.forEach((asset) => {
      const entry = byType[asset.assetType] || { type: asset.assetType, count: 0, value: 0n };
      entry.count += 1;
      entry.value += BigInt(asset.assetValue);
      byType[asset.assetType] = entry;
    });
    const typeRows = Object.values(byType).sort((a, b) => Number(b.value - a.value));
    const largestValue = typeRows.length > 0 ? typeRows[0].value : 0n;
    const statusCounts = { 0: 0, 1: 0, 2: 0 };
    assets.forEach((asset) => {
      statusCounts[asset.status] = (statusCounts[asset.status] || 0) + 1;
    });

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>Dashboard</h1>
          <p class="muted" style="margin:0">Live state of the chain on ${escapeHtml(
      global.Utils.networkName(global.Blockchain.state.networkId)
    )}.</p>
        </div>
        <div class="btn-row">
          <a class="btn btn-secondary" href="#/assets">Browse assets</a>
          <a class="btn btn-primary" href="#/register">Register an asset</a>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:22px">
        ${global.UI.statCard("Registered assets", formatInteger(summary.assetCount), `${formatInteger(statusCounts[0])} active, ${formatInteger(statusCounts[1])} paused, ${formatInteger(statusCounts[2])} retired`)}
        ${global.UI.statCard("Tokenized value", formatCurrencyFromMinor(summary.totalValue, { compact: true, decimals: 0 }), "sum of the asset values")}
        ${global.UI.statCard("Fractions issued", formatInteger(summary.totalTokens), "total ERC-20 supply")}
        ${global.UI.statCard(
          "My portfolio",
          account ? formatCurrencyFromMinor(myValue, { compact: true, decimals: 0 }) : "Not connected",
          account ? `${formatInteger(myFractions)} fractions in ${formatInteger(myAssets.length)} asset(s)` : "Connect MetaMask"
        )}
      </div>

      <div class="grid grid-2" style="align-items:start;margin-bottom:22px">
        <div class="card">
          <div class="card-header">
            <h2>Value by asset type</h2>
          </div>
          ${
            typeRows.length === 0
              ? global.UI.emptyState("Nothing to show", "No asset has been registered yet.")
              : typeRows
                  .map((row) => {
                    const percent = largestValue > 0n ? Number((row.value * 100n) / largestValue) : 0;
                    return `<div class="ownership-row" style="margin-bottom:12px">
                      <span style="width:130px">${escapeHtml(row.type)}</span>
                      <span class="bar ownership-bar"><span style="width:${percent}%"></span></span>
                      <span class="text-right" style="width:170px">
                        <strong>${formatCurrencyFromMinor(row.value, { compact: true, decimals: 0 })}</strong>
                        <span class="muted"> · ${formatInteger(row.count)}</span>
                      </span>
                    </div>`;
                  })
                  .join("")
          }
        </div>

        <div class="card">
          <div class="card-header">
            <h2>My assets</h2>
            <a class="btn btn-ghost btn-sm" href="#/holdings">All holdings</a>
          </div>
          ${
            !account
              ? `<p class="muted">Connect MetaMask to see the assets you own or hold fractions of.</p>
                 <button class="btn btn-primary" data-action="connect">Connect wallet</button>`
              : myOwnedAssets.length === 0 && myAssets.length === 0
              ? `<p class="muted">This wallet does not own or hold any asset yet.</p>
                 <a class="btn btn-primary" href="#/assets">Browse assets</a>`
              : `<dl class="kv-list">
                  <div class="kv"><dt>Assets you own</dt><dd>${formatInteger(myOwnedAssets.length)}</dd></div>
                  <div class="kv"><dt>Assets you hold</dt><dd>${formatInteger(myAssets.length)}</dd></div>
                  <div class="kv"><dt>Fractions held</dt><dd>${formatInteger(myFractions)}</dd></div>
                  <div class="kv"><dt>Portfolio value</dt><dd>${formatCurrencyFromMinor(myValue, { decimals: 0 })}</dd></div>
                </dl>
                <div class="tag-row">
                  ${myAssets
                    .slice(0, 6)
                    .map(
                      (asset) =>
                        `<a class="tag" href="#/assets/${escapeHtml(asset.assetId)}">${escapeHtml(asset.tokenSymbol)} · ${formatInteger(
                          asset.myBalance
                        )}</a>`
                    )
                    .join("")}
                </div>`
          }
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <h2>Recent activity</h2>
          <a href="#/transactions">Full history →</a>
        </div>
        ${
          records.length === 0
            ? global.UI.emptyState("No activity yet", "The ledger has no entries.")
            : global.Views.assetDetail.ledgerTable(records, null, true)
        }
      </div>
    </div>`;
  }

  global.Views = global.Views || {};
  global.Views.dashboard = { render };
})(window);
