/**
 * Register asset: the form that creates a new asset together with its token
 * contract. The summary is recalculated while typing, and the same rules the
 * contract enforces are checked in the browser first.
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrency, formatCurrencyFromMinor, isPositiveInteger } = global.Utils;

  async function render(root) {
    if (!global.Blockchain.isConnected()) {
      root.innerHTML = `<div class="page">
        <div class="section-head"><h1>Register an asset</h1></div>
        ${global.UI.emptyState(
          "Connect your wallet to continue",
          "Registering an asset writes a transaction on the chain, so a wallet is required.",
          `<button class="btn btn-primary" data-action="connect">Connect MetaMask</button>`
        )}
      </div>`;
      return;
    }

    const account = global.Blockchain.state.account;

    root.innerHTML = `<div class="page">
      <div class="section-head">
        <div>
          <h1>Register an asset</h1>
          <p class="muted" style="margin:0">
            One transaction creates the asset record, its ERC-20 token contract and the first ledger entries.
          </p>
        </div>
      </div>

      <div class="alert alert-info">
        Values are entered in rupees, for example 250000 for ${formatCurrency(250000, { decimals: 0 })}.
        They are stored on chain in paise, the smallest unit.
      </div>

      <div class="grid grid-2" style="align-items:start">
        <form class="card" id="register-form" novalidate>
          <div class="form-grid">
            <div class="field field-full">
              <label for="assetName">Asset name</label>
              <input id="assetName" name="assetName" maxlength="${global.Utils.LIMITS.name}" placeholder="Mumbai Commercial Property" required>
              <div class="field-error" data-error-for="assetName"></div>
            </div>

            <div class="field">
              <label for="assetType">Asset type</label>
              <select id="assetType" name="assetType" required>
                <option value="">Select a type</option>
                ${global.Utils.ASSET_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
              </select>
              <div class="field-error" data-error-for="assetType"></div>
            </div>

            <div class="field">
              <label for="imageUrl">Image URL <span class="muted">(optional)</span></label>
              <input id="imageUrl" name="imageUrl" maxlength="${global.Utils.LIMITS.imageUrl}" placeholder="https://..." spellcheck="false">
              <div class="field-error" data-error-for="imageUrl"></div>
            </div>

            <div class="field">
              <label for="assetValue">Asset value (in rupees)</label>
              <input id="assetValue" name="assetValue" type="number" min="1" step="1" placeholder="250000" required>
              <div class="field-error" data-error-for="assetValue"></div>
            </div>

            <div class="field">
              <label for="totalTokens">Total fractions</label>
              <input id="totalTokens" name="totalTokens" type="number" min="1" step="1" placeholder="25000" required>
              <div class="field-error" data-error-for="totalTokens"></div>
            </div>

            <div class="field field-full">
              <label for="description">Description <span class="muted">(optional)</span></label>
              <textarea id="description" name="description" maxlength="${global.Utils.LIMITS.description}" placeholder="Location, size, certificate details, storage location..."></textarea>
              <div class="field-error" data-error-for="description"></div>
            </div>

            <div class="field field-full">
              <label for="owner">Asset owner</label>
              <input id="owner" name="owner" value="${escapeHtml(account)}" spellcheck="false" required>
              <div class="field-error" data-error-for="owner"></div>
              <span class="hint">The owner receives the full supply of fractions and can sell or transfer them.</span>
            </div>

            <div class="field field-full">
              <label class="checkbox">
                <input type="checkbox" id="confirm-details">
                <span>I confirm that the details above are accurate for this demonstration project.</span>
              </label>
              <div class="field-error" data-error-for="confirm"></div>
            </div>

            <div class="field field-full btn-row">
              <button class="btn btn-primary" type="submit" id="register-submit">Register asset</button>
              <button class="btn btn-secondary" type="reset">Clear</button>
            </div>
          </div>
        </form>

        <div class="stack" style="gap:16px">
          <div class="card">
            <h3>Preview</h3>
            <p class="muted" style="margin-bottom:12px">This is what buyers will see.</p>
            <div class="card" style="padding:0;overflow:hidden;box-shadow:none">
              <div class="asset-media" id="preview-media">
                <span class="media-fallback" id="preview-initials">--</span>
                <span class="badge" id="preview-type">Type</span>
              </div>
              <div class="asset-body">
                <div class="asset-title">
                  <div>
                    <h3 id="preview-name">Asset name</h3>
                    <small id="preview-token">Token symbol will be created automatically</small>
                  </div>
                </div>
                <dl class="kv-list">
                  <div class="kv"><dt>Asset value</dt><dd id="preview-value">-</dd></div>
                  <div class="kv"><dt>Price per fraction</dt><dd id="preview-price">-</dd></div>
                  <div class="kv"><dt>Total fractions</dt><dd id="preview-tokens">-</dd></div>
                  <div class="kv"><dt>One fraction equals</dt><dd id="preview-share">-</dd></div>
                </dl>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>What happens on submit</h3>
            <ul class="prose" style="padding-left:18px;margin:10px 0 0;color:var(--text-soft)">
              <li>A token contract is deployed for the asset.</li>
              <li>The registry authorizes it to write ledger entries.</li>
              <li>The full supply is minted to the owner.</li>
              <li>The ownership of the token contract is handed to the owner.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>`;

    const form = global.Utils.element("#register-form", root);

    const fields = {
      assetName: global.Utils.element("#assetName", form),
      assetType: global.Utils.element("#assetType", form),
      imageUrl: global.Utils.element("#imageUrl", form),
      assetValue: global.Utils.element("#assetValue", form),
      totalTokens: global.Utils.element("#totalTokens", form),
      description: global.Utils.element("#description", form),
      owner: global.Utils.element("#owner", form),
      confirm: global.Utils.element("#confirm-details", form)
    };

    const setText = (id, text) => {
      const node = global.Utils.element(id, root);
      if (node) {
        node.textContent = text;
      }
    };

    /** Converts the value entered in rupees into the smallest unit. */
    function valueInMinorUnits() {
      const value = fields.assetValue.value.trim();
      if (!isPositiveInteger(value)) {
        return null;
      }
      return (BigInt(value) * BigInt(global.Utils.CURRENCY.minorUnits)).toString();
    }

    function updatePreview() {
      setText("#preview-name", fields.assetName.value.trim() || "Asset name");
      setText(
        "#preview-token",
        fields.assetName.value.trim()
          ? `A token will be created for ${fields.assetName.value.trim()}`
          : "Token symbol will be created automatically"
      );
      setText("#preview-type", fields.assetType.value || "Type");
      setText("#preview-initials", global.Utils.assetTypeInitials(fields.assetType.value));
      setText("#preview-value", fields.assetValue.value ? formatCurrency(fields.assetValue.value, { decimals: 0 }) : "-");
      setText("#preview-tokens", isPositiveInteger(fields.totalTokens.value) ? formatInteger(fields.totalTokens.value) : "-");

      const minor = valueInMinorUnits();
      const tokens = fields.totalTokens.value.trim();
      if (minor && isPositiveInteger(tokens)) {
        const price = BigInt(minor) / BigInt(tokens);
        setText("#preview-price", BigInt(minor) % BigInt(tokens) === 0n ? formatCurrencyFromMinor(price.toString(), { decimals: 0 }) : "not divisible");
        setText("#preview-share", `${(100 / Number(tokens)).toFixed(4)}%`);
      } else {
        setText("#preview-price", "-");
        setText("#preview-share", "-");
      }

      const url = fields.imageUrl.value.trim();
      const media = global.Utils.element("#preview-media", root);
      if (url) {
        if (media.getAttribute("data-url") !== url) {
          media.setAttribute("data-url", url);
          media.innerHTML = `<img src="${escapeHtml(url)}" alt="Preview"
              onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'${escapeHtml(
                global.Utils.assetTypeInitials(fields.assetType.value)
              )}'}))">
            <span class="badge">${escapeHtml(fields.assetType.value || "Type")}</span>`;
        }
      } else if (media.getAttribute("data-url")) {
        media.removeAttribute("data-url");
        media.innerHTML = `<span class="media-fallback" id="preview-initials">${escapeHtml(
          global.Utils.assetTypeInitials(fields.assetType.value)
        )}</span><span class="badge" id="preview-type">${escapeHtml(fields.assetType.value || "Type")}</span>`;
      }
    }

    function clearErrors() {
      global.Utils.elements("[data-error-for]", form).forEach((node) => {
        node.textContent = "";
      });
      global.Utils.elements("input, select, textarea", form).forEach((node) => node.classList.remove("invalid"));
    }

    function showErrors(errors) {
      clearErrors();
      errors.forEach((problem) => {
        const node = global.Utils.element(`[data-error-for="${problem.field}"]`, form);
        if (node) {
          node.textContent = problem.message;
        }
        if (fields[problem.field]) {
          fields[problem.field].classList.add("invalid");
        }
      });
      const first = fields[errors[0].field];
      if (first && first.focus) {
        first.focus();
      }
    }

    Object.keys(fields).forEach((key) => {
      const node = fields[key];
      if (!node) {
        return;
      }
      node.addEventListener("input", updatePreview);
      node.addEventListener("change", updatePreview);
    });

    form.addEventListener("reset", () => {
      setTimeout(() => {
        clearErrors();
        updatePreview();
        fields.owner.value = global.Blockchain.state.account || "";
      }, 0);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearErrors();

      const values = {
        assetName: fields.assetName.value.trim(),
        assetType: fields.assetType.value,
        imageUrl: fields.imageUrl.value.trim(),
        assetValue: valueInMinorUnits(),
        totalTokens: fields.totalTokens.value.trim(),
        description: fields.description.value.trim(),
        owner: fields.owner.value.trim()
      };

      const errors = global.Utils.validateAssetForm(values);
      if (!fields.confirm.checked) {
        errors.push({ field: "confirm", message: "Please confirm the details before registering." });
      }
      if (fields.owner.value.trim().toLowerCase() === (global.Blockchain.state.account || "").toLowerCase()) {
        // Allowed: the connected wallet may register an asset for another owner,
        // but it is worth warning because the owner has to be able to use the token.
        global.UI.toast(
          "The asset owner is your own wallet, so the full supply of fractions will be issued to you.",
          "info"
        );
      }

      if (errors.length > 0) {
        showErrors(errors);
        return;
      }

      const summaryHtml = `<div class="summary-box">
        <div class="kv"><dt>Asset</dt><dd>${escapeHtml(values.assetName)}</dd></div>
        <div class="kv" style="margin-top:6px"><dt>Type</dt><dd>${escapeHtml(values.assetType)}</dd></div>
        <div class="kv" style="margin-top:6px"><dt>Value</dt><dd>${formatCurrencyFromMinor(values.assetValue, { decimals: 0 })}</dd></div>
        <div class="kv" style="margin-top:6px"><dt>Fractions</dt><dd>${formatInteger(values.totalTokens)}</dd></div>
        <div class="kv" style="margin-top:6px"><dt>Price per fraction</dt><dd>${formatCurrencyFromMinor(
          (BigInt(values.assetValue) / BigInt(values.totalTokens)).toString(),
          { decimals: 0 }
        )}</dd></div>
        <div class="kv" style="margin-top:6px"><dt>Owner</dt><dd>${escapeHtml(values.owner)}</dd></div>
      </div>`;

      global.UI.confirmation({
        title: "Register this asset on the chain?",
        message:
          "This deploys a new token contract and writes the first ledger entries. It cannot be undone, so please check the details.",
        summaryHtml,
        noteHtml: "A gas fee is paid in the test currency of the local network.",
        confirmLabel: "Register asset",
        onConfirm: () => submit(form, fields, values)
      });
    });

    updatePreview();
  }

  async function submit(form, fields, values) {
    const submitButton = global.Utils.element("#register-submit", form);
    submitButton.disabled = true;
    submitButton.textContent = "Confirm in MetaMask...";

    try {
      const registry = global.Blockchain.getRegistry();
      const details = await global.Blockchain.sendTransaction({
        method: registry.methods.registerAsset(
          values.assetName,
          values.assetType,
          values.description,
          values.assetValue,
          values.totalTokens,
          values.imageUrl,
          values.owner
        ),
        gas: global.Blockchain.GAS.registerAsset,
        label: `Register ${values.assetName}`,
        onStatus: (info) => {
          if (info.stage === "submitted") {
            global.UI.toast(
              "The transaction was sent. Creating a token contract takes a moment on the local chain...",
              "info",
              "Pending"
            );
          }
        }
      });

      global.Store.invalidate();

      const assets = await global.Store.loadAssets();
      const created = assets[assets.length - 1];

      global.UI.modal({
        title: "Asset registered",
        wide: true,
        body: `<p>The asset <strong>${escapeHtml(values.assetName)}</strong> is now registered on the chain.</p>
          <div class="summary-box">
            ${
              created
                ? `<div class="kv"><dt>Asset ID</dt><dd>#${escapeHtml(created.assetId)}</dd></div>
                   <div class="kv" style="margin-top:6px"><dt>Token</dt><dd>${escapeHtml(created.tokenSymbol)} (${escapeHtml(created.tokenName)})</dd></div>
                   <div class="kv" style="margin-top:6px"><dt>Token contract</dt><dd class="mono">${escapeHtml(created.tokenAddress)}</dd></div>
                   <div class="kv" style="margin-top:6px"><dt>Fractions issued</dt><dd>${formatInteger(created.totalSupply)}</dd></div>`
                : ""
            }
          </div>
          <div class="summary-box">${global.UI.receiptList(details)}</div>`,
        footer: `<div class="btn-row" style="justify-content:flex-end">
          ${
            created
              ? `<a class="btn btn-secondary" href="#/assets/${escapeHtml(created.assetId)}" data-modal-close>Open the asset</a>`
              : ""
          }
          <button class="btn btn-primary" data-modal-close>Done</button>
        </div>`
      });

      form.reset();
      if (created) {
        window.location.hash = `#/assets/${created.assetId}`;
      } else {
        global.Utils.element("#page-root").dispatchEvent(new CustomEvent("view:refresh"));
      }
    } catch (error) {
      global.UI.toast(global.Blockchain.friendlyError(error), "error", "Registration failed");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Register asset";
    }
  }

  global.Views = global.Views || {};
  global.Views.register = { render };
})(window);
