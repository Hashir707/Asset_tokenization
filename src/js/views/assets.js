/**
 * Assets: the searchable list of every registered asset, with client side
 * filters for type and status.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor } = global.Utils;

  let assets = [];

  async function render(root) {
    root.innerHTML = global.UI.loading("Loading the registered assets...");

    try {
      assets = await global.Store.loadAssets();
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    if (assets.length === 0) {
      root.innerHTML = `<div class="page">
        <div class="section-head"><h1>Tokenized assets</h1></div>
        ${global.UI.emptyState(
          "No assets registered yet",
          "Once an asset is registered on the chain it appears here with its live price and ownership.",
          `<a class="btn btn-primary" href="#/register">Register the first asset</a>`
        )}
      </div>`;
      return;
    }

    const types = Array.from(new Set(assets.map((asset) => asset.assetType))).sort();

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>Tokenized assets</h1>
          <p class="muted" style="margin:0">${formatInteger(assets.length)} asset(s) registered on ${escapeHtml(
        global.Utils.networkName(global.Blockchain.state.networkId)
      )}.</p>
        </div>
        <a class="btn btn-primary" href="#/register">Register an asset</a>
      </div>

      <div class="card card-pad-sm" style="margin-bottom:18px">
        <div class="grid grid-3">
          <div class="field">
            <label for="asset-search">Search</label>
            <input id="asset-search" type="search" placeholder="Search by name or token symbol" autocomplete="off">
          </div>
          <div class="field">
            <label for="asset-type">Asset type</label>
            <select id="asset-type">
              <option value="">All types</option>
              ${types.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="asset-status">Status</label>
            <select id="asset-status">
              <option value="">All statuses</option>
              <option value="0">Active</option>
              <option value="1">Paused</option>
              <option value="2">Retired</option>
            </select>
          </div>
        </div>
      </div>

      <div class="asset-grid" id="asset-grid">${assets.map(global.Views.home.assetCard).join("")}</div>
      <p class="muted" id="asset-count" style="margin-top:14px"></p>
    </div>`;

    const search = global.Utils.element("#asset-search");
    const typeSelect = global.Utils.element("#asset-type");
    const statusSelect = global.Utils.element("#asset-status");
    const grid = global.Utils.element("#asset-grid");
    const counter = global.Utils.element("#asset-count");

    const apply = () => {
      const term = search.value.trim().toLowerCase();
      const type = typeSelect.value;
      const status = statusSelect.value;
      let visible = 0;

      global.Utils.elements("[data-asset-card]", grid).forEach((card) => {
        const name = card.getAttribute("data-name") || "";
        const cardType = card.getAttribute("data-type") || "";
        const cardStatus = card.getAttribute("data-status") || "";
        const matches =
          (!term || name.includes(term)) && (!type || cardType === type) && (!status || cardStatus === status);
        card.classList.toggle("hidden", !matches);
        if (matches) {
          visible += 1;
        }
      });

      counter.textContent = visible === assets.length
        ? `Showing all ${formatInteger(assets.length)} assets.`
        : `Showing ${formatInteger(visible)} of ${formatInteger(assets.length)} assets.`;

      let empty = global.Utils.element("#assets-empty", grid);
      if (visible === 0) {
        if (!empty) {
          empty = document.createElement("div");
          empty.id = "assets-empty";
          empty.style.gridColumn = "1 / -1";
          empty.innerHTML = global.UI.emptyState("No match", "No asset matches the selected filters.");
          grid.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    };

    search.addEventListener("input", apply);
    typeSelect.addEventListener("change", apply);
    statusSelect.addEventListener("change", apply);
    apply();
  }

  global.Views = global.Views || {};
  global.Views.assets = { render, assets: () => assets };
})(window);
