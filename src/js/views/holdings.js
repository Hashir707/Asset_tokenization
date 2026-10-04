/**
 * My holdings: every fraction the connected wallet owns, aggregated across all
 * assets, read from the token contracts.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor, formatPercentFromBasisPoints } = global.Utils;

  async function render(root) {
    if (!global.Blockchain.isConnected()) {
      root.innerHTML = `<div class="page">
        <div class="section-head"><h1>My holdings</h1></div>
        ${global.UI.emptyState(
          "Connect your wallet to see your holdings",
          "The fractions you own are read from the token contracts of the connected address.",
          `<button class="btn btn-primary" data-action="connect">Connect MetaMask</button>`
        )}
      </div>`;
      return;
    }

    root.innerHTML = global.UI.loading("Reading the balances of your wallet...");

    const account = global.Blockchain.state.account;
    let assets = [];
    try {
      assets = await global.Store.loadAssets();
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    const owned = assets.filter((asset) => BigInt(asset.myBalance) > 0n);
    const totalFractions = owned.reduce((sum, asset) => sum + BigInt(asset.myBalance), 0n);
    const totalValue = owned.reduce((sum, asset) => sum + BigInt(asset.myValue), 0n);

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>My holdings</h1>
          <p class="muted" style="margin:0">Fractions owned by ${escapeHtml(account)}</p>
        </div>
        <a class="btn btn-secondary" href="#/transactions">View all transactions</a>
      </div>

      <div class="grid grid-3" style="margin-bottom:22px">
        ${global.UI.statCard("Assets held", formatInteger(owned.length), `of ${formatInteger(assets.length)} registered`)}
        ${global.UI.statCard("Fractions owned", formatInteger(totalFractions), "across all assets")}
        ${global.UI.statCard("Portfolio value", formatCurrencyFromMinor(totalValue, { compact: true, decimals: 0 }), "notional value of the holdings")}
      </div>

      ${
        owned.length === 0
          ? global.UI.emptyState(
              "No fractions yet",
              "This wallet does not hold any fraction of a registered asset. You can buy fractions from an asset owner.",
              `<a class="btn btn-primary" href="#/assets">Browse assets</a>`
            )
          : `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Fractions</th>
                    <th>Share</th>
                    <th class="text-right">Value</th>
                    <th>Price per fraction</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${owned
                    .map(
                      (asset) => `<tr>
                        <td>
                          <strong>${escapeHtml(asset.assetName)}</strong><br>
                          <small>${escapeHtml(asset.tokenSymbol)} · asset #${escapeHtml(asset.assetId)}</small>
                        </td>
                        <td>${formatInteger(asset.myBalance)}</td>
                        <td>
                          <div class="ownership-bar" style="width:110px"><span style="width:${Math.min(
                        100,
                        asset.myShareBasisPoints / 100
                      )}%"></span></div>
                          <small>${formatPercentFromBasisPoints(asset.myShareBasisPoints)}</small>
                        </td>
                        <td class="text-right">${formatCurrencyFromMinor(asset.myValue, { decimals: 0 })}</td>
                        <td>${formatCurrencyFromMinor(asset.tokenPrice, { decimals: 0 })}</td>
                        <td>${global.UI.statusBadge(asset.status)}</td>
                        <td class="text-right">
                          <a class="btn btn-secondary btn-sm" href="#/assets/${escapeHtml(asset.assetId)}">Manage</a>
                        </td>
                      </tr>`
                    )
                    .join("")}
                </tbody>
              </table>
            </div>`
      }
    </div>`;
  }

  global.Views = global.Views || {};
  global.Views.holdings = { render };
})(window);
