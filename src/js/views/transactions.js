/**
 * Transactions: the on-chain ledger, with the transaction hash of every record
 * recovered from the TransactionRecorded event logs so each row can be
 * verified independently.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor } = global.Utils;

  async function render(root) {
    root.innerHTML = global.UI.loading("Reading the transaction ledger...");

    let records = [];
    try {
      records = await global.Store.loadTransactions(60);
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    if (records.length === 0) {
      root.innerHTML = `<div class="page">
        <div class="section-head"><h1>Transaction history</h1></div>
        ${global.UI.emptyState(
          "The ledger is empty",
          "Register an asset to create the first ledger entries.",
          `<a class="btn btn-primary" href="#/register">Register an asset</a>`
        )}
      </div>`;
      return;
    }

    const withHash = records.filter((record) => record.txHash).length;
    const totalValue = records.reduce((sum, record) => sum + BigInt(record.valueAmount), 0n);
    const types = Object.keys(global.Utils.TX_TYPES);

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>Transaction history</h1>
          <p class="muted" style="margin:0">Every entry is written by the contracts and cannot be edited or removed.</p>
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:20px">
        ${global.UI.statCard("Ledger entries", formatInteger(records.length), "most recent first")}
        ${global.UI.statCard("Volume recorded", formatCurrencyFromMinor(totalValue, { compact: true, decimals: 0 }), "sum of the recorded values")}
        ${global.UI.statCard("Transactions traced", formatInteger(withHash), "linked to a transaction hash")}
        ${global.UI.statCard("Assets touched", formatInteger(new Set(records.map((record) => record.assetId)).size), "in this view")}
      </div>

      <div class="card card-pad-sm" style="margin-bottom:18px">
        <div class="grid grid-3">
          <div class="field">
            <label for="tx-type">Type</label>
            <select id="tx-type">
              <option value="">All types</option>
              ${types
                .map(
                  (type) =>
                    `<option value="${type}">${escapeHtml(global.Utils.TX_TYPES[type].label)}</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="tx-asset">Asset</label>
            <select id="tx-asset">
              <option value="">All assets</option>
            </select>
          </div>
          <div class="field">
            <label for="tx-wallet">Involving my wallet</label>
            <select id="tx-wallet">
              <option value="">Any wallet</option>
              <option value="in">Sent by me</option>
              <option value="out">Received by me</option>
            </select>
          </div>
        </div>
      </div>

      <div id="tx-table">${table(records)}</div>
      <p class="muted" style="margin-top:14px">
        ${withHash === records.length
          ? "Every row links to the transaction that produced it."
          : `${records.length - withHash} row(s) could not be linked to a transaction hash, which happens with a large ledger or a restarted local chain.`}
      </p>
    </div>`;

    // Populate the asset filter once the asset names are known.
    const assetSelect = global.Utils.element("#tx-asset", root);
    global.Store
      .loadAssets()
      .then((assets) => {
        assetSelect.innerHTML =
          '<option value="">All assets</option>' +
          assets
            .map((asset) => `<option value="${escapeHtml(asset.assetId)}">${escapeHtml(asset.assetName)}</option>`)
            .join("");
      })
      .catch(() => {
        assetSelect.innerHTML = '<option value="">All assets</option>';
      });

    const typeSelect = global.Utils.element("#tx-type", root);
    const walletSelect = global.Utils.element("#tx-wallet", root);
    const container = global.Utils.element("#tx-table", root);

    const apply = () => {
      const type = typeSelect.value;
      const assetId = assetSelect.value;
      const walletMode = walletSelect.value;
      const account = (global.Blockchain.state.account || "").toLowerCase();

      const filtered = records.filter((record) => {
        if (type && String(record.type) === type) {
          return false;
        }
        if (assetId && record.assetId !== assetId) {
          return false;
        }
        if (walletMode === "in" && (record.from || "").toLowerCase() !== account) {
          return false;
        }
        if (walletMode === "out" && (record.to || "").toLowerCase() !== account) {
          return false;
        }
        return true;
      });

      container.innerHTML = table(filtered);
    };

    typeSelect.addEventListener("change", apply);
    assetSelect.addEventListener("change", apply);
    walletSelect.addEventListener("change", apply);
  }

  function table(records) {
    if (records.length === 0) {
      return global.UI.emptyState("No matching entries", "No ledger entry matches the selected filters.");
    }

    const rows = records
      .map(
        (record) => `<tr>
          <td><span class="pill ${escapeHtml(record.typeClass)}">${escapeHtml(record.typeLabel)}</span></td>
          <td><a href="#/assets/${escapeHtml(record.assetId)}">#${escapeHtml(record.assetId)}</a></td>
          <td class="mono" title="${escapeHtml(record.from)}">${escapeHtml(global.Utils.shortAddress(record.from, 8))}</td>
          <td class="mono" title="${escapeHtml(record.to)}">${escapeHtml(global.Utils.shortAddress(record.to, 8))}</td>
          <td class="text-right">${formatInteger(record.tokenAmount)}</td>
          <td class="text-right">${formatCurrencyFromMinor(record.valueAmount, { decimals: 0 })}</td>
          <td>${formatInteger(record.blockNumber)}</td>
          <td>${global.Utils.formatDateTime(record.timestamp)}</td>
          <td>${record.txHash ? global.UI.txLink(record.txHash) : `<span class="muted">-</span>`}</td>
        </tr>`
      )
      .join("");

    return `<div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Asset</th>
            <th>From</th>
            <th>To</th>
            <th class="text-right">Fractions</th>
            <th class="text-right">Value</th>
            <th>Block</th>
            <th>Time</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  global.Views = global.Views || {};
  global.Views.transactions = { render };
})(window);
