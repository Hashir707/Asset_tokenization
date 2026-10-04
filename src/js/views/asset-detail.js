/**
 * Asset detail: the full record of one asset, its ownership distribution, its
 * ledger, and every action the connected wallet is allowed to perform
 * (buy, transfer, status change, collecting the proceeds of a sale).
 */
(function (global) {
  "use strict";

  const { escapeHtml, formatInteger, formatCurrencyFromMinor, formatPercentFromBasisPoints, shortAddress } = global.Utils;

  let asset = null;

  async function render(root, params) {
    const assetId = params && params.id ? String(params.id) : "";
    root.innerHTML = global.UI.loading("Loading the asset from the chain...");

    try {
      asset = await global.Store.loadAsset(assetId);
    } catch (error) {
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
      return;
    }

    if (!asset) {
      root.innerHTML = `<div class="page">
        <a class="btn btn-ghost" href="#/assets">← Back to assets</a>
        ${global.UI.emptyState("Asset not found", `No asset with id ${assetId} exists on this chain.`, `<a class="btn btn-primary" href="#/assets">Browse all assets</a>`)}
      </div>`;
      return;
    }

    const [holders, records] = await Promise.all([
      global.Store.loadHolders(assetId).catch(() => []),
      global.Store.loadAssetTransactions(assetId).catch(() => [])
    ]);

    const account = global.Blockchain.state.account;
    const isOwner = Boolean(account) && account.toLowerCase() === asset.owner.toLowerCase();
    const hasTokens = BigInt(asset.myBalance) > 0n;
    const canBuy = asset.status === 0 && BigInt(asset.ownerBalance) > 0n;
    const perFraction = BigInt(asset.totalTokens) > 0n ? Number(10000n / BigInt(asset.totalTokens)) / 100 : 0;

    root.innerHTML = `<div class="page">
      <a class="btn btn-ghost" href="#/assets">← Back to assets</a>

      <section class="section" style="margin-top:8px">
        <div class="grid grid-2" style="align-items:start">
          <div class="card" style="padding:0;overflow:hidden">
            ${global.UI.assetMedia(asset, true)}
            <div style="padding:18px">
              <h1 style="margin-bottom:4px">${escapeHtml(asset.assetName)}</h1>
              <p class="muted" style="margin-bottom:14px">${escapeHtml(asset.description || "No description was provided for this asset.")}</p>
              <dl class="kv-list">
                <div class="kv"><dt>Asset ID</dt><dd>#${escapeHtml(asset.assetId)}</dd></div>
                <div class="kv"><dt>Asset type</dt><dd>${escapeHtml(asset.assetType)}</dd></div>
                <div class="kv"><dt>Asset value</dt><dd>${formatCurrencyFromMinor(asset.assetValue, { decimals: 0 })}</dd></div>
                <div class="kv"><dt>Total fractions</dt><dd>${formatInteger(asset.totalTokens)}</dd></div>
                <div class="kv"><dt>Price per fraction</dt><dd>${formatCurrencyFromMinor(asset.tokenPrice, { decimals: 0 })}</dd></div>
                <div class="kv"><dt>Registered on</dt><dd>${global.Utils.formatDateTime(asset.registeredAt)}</dd></div>
              </dl>
            </div>
          </div>

          <div class="stack" style="gap:16px">
            <div class="card">
              <div class="card-header">
                <h2>${escapeHtml(asset.tokenSymbol)} token</h2>
                ${global.UI.statusBadge(asset.status)}
              </div>
              <dl class="kv-list">
                <div class="kv"><dt>Token name</dt><dd>${escapeHtml(asset.tokenName)}</dd></div>
                <div class="kv"><dt>Supply issued</dt><dd>${formatInteger(asset.totalSupply)} / ${formatInteger(asset.totalTokens)}</dd></div>
                <div class="kv"><dt>Owned by the asset owner</dt><dd>${formatInteger(asset.ownerBalance)}</dd></div>
                <div class="kv"><dt>One fraction represents</dt><dd>${perFraction.toFixed(4)}% of the asset</dd></div>
              </dl>
              <div style="margin-top:14px">
                <div class="stat-label" style="margin-bottom:6px">Token contract</div>
                ${global.UI.copyable(asset.tokenAddress, "Copy address")}
              </div>
              <div style="margin-top:12px">
                <div class="stat-label" style="margin-bottom:6px">Asset owner</div>
                ${global.UI.copyable(asset.owner, "Copy address")}
              </div>
            </div>

            ${
              account
                ? `<div class="card">
                    <h3>Your position</h3>
                    <div class="row-between" style="margin:12px 0">
                      <div class="ring" style="--value:${Math.min(100, Number(asset.myShareBasisPoints) / 100)}">
                        <span>${formatPercentFromBasisPoints(asset.myShareBasisPoints)}</span>
                      </div>
                      <div class="stack" style="text-align:right">
                        <strong>${formatInteger(asset.myBalance)} fractions</strong>
                        <span class="muted">${formatCurrencyFromMinor(asset.myValue, { decimals: 0 })} of the asset</span>
                      </div>
                    </div>
                  </div>`
                : `<div class="card">
                    <h3>Your position</h3>
                    <p class="muted">Connect MetaMask to see the fractions you own and to trade this asset.</p>
                    <button class="btn btn-primary" data-action="connect">Connect wallet</button>
                  </div>`
            }

            <div class="card">
              <h3>Actions</h3>
              <div class="btn-row" style="margin-top:12px">
                <button class="btn btn-primary" data-action="buy" ${canBuy ? "" : "disabled"}>Buy fractions</button>
                <button class="btn btn-secondary" data-action="transfer" ${hasTokens ? "" : "disabled"}>Transfer fractions</button>
              </div>
              ${
                canBuy
                  ? ""
                  : `<p class="hint" style="margin-top:10px">${
                      asset.status === 0
                        ? "The asset owner no longer holds fractions, so this asset is not for sale at the moment."
                        : "Buying is disabled while the asset is not active."
                    }</p>`
              }
              ${
                isOwner
                  ? `<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">
                     <h4>Owner controls</h4>
                     <div class="btn-row" style="margin-top:10px">
                       <button class="btn btn-secondary btn-sm" data-action="status" data-status="0" ${
                         asset.status === 0 ? "disabled" : ""
                       }>Activate</button>
                       <button class="btn btn-secondary btn-sm" data-action="status" data-status="1" ${
                         asset.status === 1 ? "disabled" : ""
                       }>Pause</button>
                       <button class="btn btn-secondary btn-sm" data-action="status" data-status="2" ${
                         asset.status === 2 ? "disabled" : ""
                       }>Retire</button>
                       <button class="btn btn-secondary btn-sm" data-action="withdraw">Collect proceeds</button>
                     </div>
                     <p class="hint" style="margin-top:10px">
                       Pausing keeps the fractions but blocks new purchases. Retiring permanently closes the asset.
                     </p>`
                  : ""
              }
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Ownership distribution</h2>
          <small>Read from the registry ledger</small>
        </div>
        <div class="card">
          ${
            holders.length === 0
              ? global.UI.emptyState("No holder recorded", "The ledger does not list any wallet for this asset yet.")
              : holders
                  .map(
                    (holder) => `<div class="ownership-row" style="margin-bottom:10px">
                      <span class="address" style="width:150px">${escapeHtml(shortAddress(holder.wallet, 8))}</span>
                      <span class="bar ownership-bar"><span style="width:${Math.min(
                        100,
                        holder.shareBasisPoints / 100
                      )}%"></span></span>
                      <span class="text-right" style="width:190px">
                        <strong>${formatInteger(holder.balance)}</strong>
                        <span class="muted"> · ${formatPercentFromBasisPoints(holder.shareBasisPoints)}</span>
                      </span>
                    </div>`
                  )
                  .join("")
          }
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2>Transaction history</h2>
          <small>${formatInteger(records.length)} record(s) for this asset</small>
        </div>
        ${ledgerTable(records, assetId, true)}
      </section>
    </div>`;

    wire(root);
  }

  /** Shared ledger table, used by the asset page and by the history page. */
  function ledgerTable(records, assetId, showAssetColumn) {
    if (records.length === 0) {
      return global.UI.emptyState("No transactions yet", "The ledger of this asset is still empty.");
    }

    const rows = records
      .map(
        (record) => `<tr>
          <td><span class="pill ${escapeHtml(record.typeClass)}">${escapeHtml(record.typeLabel)}</span></td>
          ${showAssetColumn ? `<td>${escapeHtml(record.assetName || `#${record.assetId}`)}</td>` : ""}
          <td>${escapeHtml(shortAddress(record.from))}</td>
          <td>${escapeHtml(shortAddress(record.to))}</td>
          <td class="text-right">${formatInteger(record.tokenAmount)}</td>
          <td class="text-right">${formatCurrencyFromMinor(record.valueAmount, { decimals: 0 })}</td>
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
            ${showAssetColumn ? "<th>Asset</th>" : ""}
            <th>From</th>
            <th>To</th>
            <th class="text-right">Fractions</th>
            <th class="text-right">Value</th>
            <th>Time</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ------------------------------------------------------------------ actions

  function wire(root) {
    const buyButton = global.Utils.element('[data-action="buy"]', root);
    const transferButton = global.Utils.element('[data-action="transfer"]', root);
    if (buyButton) {
      buyButton.addEventListener("click", openBuy);
    }
    if (transferButton) {
      transferButton.addEventListener("click", openTransfer);
    }
    global.Utils.elements('[data-action="status"]', root).forEach((button) => {
      button.addEventListener("click", () => changeStatus(Number(button.getAttribute("data-status"))));
    });
    const withdrawButton = global.Utils.element('[data-action="withdraw"]', root);
    if (withdrawButton) {
      withdrawButton.addEventListener("click", collectProceeds);
    }
  }

  function openBuy() {
    const account = global.Blockchain.state.account;
    if (!account) {
      global.UI.toast("Please connect your wallet first.", "error");
      return;
    }
    if (account.toLowerCase() === asset.owner.toLowerCase()) {
      global.UI.toast("You are the asset owner of this asset, so there is nothing to buy from yourself.", "info");
      return;
    }

    const price = BigInt(asset.tokenPrice);
    const available = asset.ownerBalance;

    global.UI.modal({
      title: `Buy fractions of ${asset.assetName}`,
      body: `
        <p class="muted">One fraction costs <strong>${formatCurrencyFromMinor(asset.tokenPrice, { decimals: 0 })}</strong>.
        The payment is settled in the test currency of the local chain, so no real money moves.</p>
        <div class="field" style="margin-top:14px">
          <label for="buy-amount">Number of fractions</label>
          <input id="buy-amount" type="number" min="1" step="1" value="1" inputmode="numeric">
          <div class="field-error" id="buy-error"></div>
          <span class="hint">Available from the asset owner: ${formatInteger(available)}</span>
        </div>
        <div class="summary-box">
          <div class="kv"><dt>Price per fraction</dt><dd>${formatCurrencyFromMinor(asset.tokenPrice, { decimals: 0 })}</dd></div>
          <div class="kv" style="margin-top:6px"><dt>Total payment</dt><dd id="buy-total">-</dd></div>
          <div class="kv" style="margin-top:6px"><dt>Ownership after the purchase</dt><dd id="buy-share">-</dd></div>
        </div>`,
      footer: `<div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-secondary" data-modal-close>Cancel</button>
        <button class="btn btn-primary" id="buy-submit">Buy</button>
      </div>`,
      onMount(modalRoot) {
        const input = global.Utils.element("#buy-amount", modalRoot);
        const error = global.Utils.element("#buy-error", modalRoot);
        const total = global.Utils.element("#buy-total", modalRoot);
        const share = global.Utils.element("#buy-share", modalRoot);
        const submit = global.Utils.element("#buy-submit", modalRoot);

        const update = () => {
          const amount = input.value.trim();
          const problem = global.Utils.validateTokenAmount(amount, available, "buy");
          error.textContent = problem || "";
          input.classList.toggle("invalid", Boolean(problem));
          if (problem) {
            total.textContent = "-";
            share.textContent = "-";
            return;
          }
          const cost = BigInt(amount) * price;
          total.textContent = formatCurrencyFromMinor(cost.toString(), { decimals: 0 });
          const owned = BigInt(asset.myBalance) + BigInt(amount);
          const basisPoints = (owned * 10000n) / BigInt(asset.totalSupply);
          share.textContent = formatPercentFromBasisPoints(basisPoints.toString());
        };

        input.addEventListener("input", update);
        update();

        submit.addEventListener("click", async () => {
          const amount = input.value.trim();
          const problem = global.Utils.validateTokenAmount(amount, available, "buy");
          if (problem) {
            error.textContent = problem;
            return;
          }

          submit.disabled = true;
          submit.textContent = "Confirm in MetaMask...";
          global.UI.closeModal();

          try {
            const token = global.Blockchain.getToken(asset.tokenAddress);
            const cost = (BigInt(amount) * price).toString();
            const details = await global.Blockchain.sendTransaction({
              method: token.methods.buy(amount),
              value: cost,
              gas: global.Blockchain.GAS.buyTokens,
              label: `Buy ${formatInteger(amount)} fraction(s) of ${asset.assetName}`,
              onStatus: (info) => {
                if (info.stage === "submitted") {
                  global.UI.toast(
                    "The purchase was sent to the chain. Waiting for it to be confirmed...",
                    "info",
                    "Pending"
                  );
                }
              }
            });
            global.Store.invalidate();
            global.UI.modal({
              title: "Purchase confirmed",
              body: `<p>You now own <strong>${formatInteger(amount)}</strong> fraction(s) of ${escapeHtml(
                asset.assetName
              )}.</p><div class="summary-box">${global.UI.receiptList(details)}</div>`,
              footer: `<div class="btn-row" style="justify-content:flex-end">
                <button class="btn btn-primary" data-modal-close>Done</button>
              </div>`
            });
            global.Utils.element("#page-root").dispatchEvent(new CustomEvent("view:refresh"));
          } catch (error) {
            global.UI.toast(global.Blockchain.friendlyError(error), "error", "Purchase failed");
          } finally {
            submit.disabled = false;
            submit.textContent = "Buy";
          }
        });
      }
    });
  }

  /** Reasons a recipient address cannot be used, checked before spending gas. */
  function recipientProblem(to, account) {
    if (!to) {
      return "";
    }
    if (!global.Utils.isValidAddress(to)) {
      return "Enter a valid wallet address (0x followed by 40 characters).";
    }
    if (global.Utils.isZeroAddress(to)) {
      return "Fractions cannot be sent to the zero address, because they could never be recovered.";
    }
    if (to.toLowerCase() === account.toLowerCase()) {
      return "The recipient must be a different wallet.";
    }
    return "";
  }

  function openTransfer() {
    const account = global.Blockchain.state.account;
    if (!account) {
      global.UI.toast("Please connect your wallet first.", "error");
      return;
    }

    const balance = asset.myBalance;

    global.UI.modal({
      title: `Transfer fractions of ${asset.assetName}`,
      body: `
        <p class="muted">Fractions are transferred directly between wallets and the movement is written to the ledger.</p>
        <div class="form-grid" style="margin-top:14px">
          <div class="field field-full">
            <label for="transfer-to">Recipient address</label>
            <input id="transfer-to" placeholder="0x..." autocomplete="off" spellcheck="false">
            <div class="field-error" id="transfer-to-error"></div>
          </div>
          <div class="field field-full">
            <label for="transfer-amount">Number of fractions</label>
            <input id="transfer-amount" type="number" min="1" step="1" value="1" inputmode="numeric">
            <div class="field-error" id="transfer-amount-error"></div>
            <span class="hint">You own ${formatInteger(balance)} fraction(s) worth ${formatCurrencyFromMinor(
        asset.myValue,
        { decimals: 0 }
      )}.</span>
          </div>
        </div>`,
      footer: `<div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-secondary" data-modal-close>Cancel</button>
        <button class="btn btn-primary" id="transfer-submit">Transfer</button>
      </div>`,
      onMount(modalRoot) {
        const toInput = global.Utils.element("#transfer-to", modalRoot);
        const amountInput = global.Utils.element("#transfer-amount", modalRoot);
        const toError = global.Utils.element("#transfer-to-error", modalRoot);
        const amountError = global.Utils.element("#transfer-amount-error", modalRoot);
        const submit = global.Utils.element("#transfer-submit", modalRoot);

        toInput.addEventListener("input", () => {
          const problem = recipientProblem(toInput.value.trim(), account);
          toError.textContent = problem;
          toInput.classList.toggle("invalid", Boolean(problem));
        });

        submit.addEventListener("click", async () => {
          const to = toInput.value.trim();
          const amount = amountInput.value.trim();

          const toProblem = recipientProblem(to, account);
          const amountProblem = global.Utils.validateTokenAmount(amount, balance, "transfer");

          toError.textContent = toProblem;
          amountError.textContent = amountProblem || "";
          toInput.classList.toggle("invalid", Boolean(toProblem));
          amountInput.classList.toggle("invalid", Boolean(amountProblem));

          if (toProblem || amountProblem) {
            return;
          }

          global.UI.confirmation({
            title: "Confirm the transfer",
            message: `Send ${formatInteger(amount)} fraction(s) of ${asset.assetName} to ${shortAddress(to, 10)}?`,
            summaryHtml: `<div class="summary-box">
              <div class="kv"><dt>Asset</dt><dd>${escapeHtml(asset.assetName)}</dd></div>
              <div class="kv" style="margin-top:6px"><dt>Fractions</dt><dd>${formatInteger(amount)}</dd></div>
              <div class="kv" style="margin-top:6px"><dt>Notional value</dt><dd>${formatCurrencyFromMinor(
                (BigInt(amount) * BigInt(asset.tokenPrice)).toString(),
                { decimals: 0 }
              )}</dd></div>
            </div>`,
            confirmLabel: "Confirm transfer",
            onConfirm: async () => {
              try {
                const token = global.Blockchain.getToken(asset.tokenAddress);
                const details = await global.Blockchain.sendTransaction({
                  method: token.methods.transfer(to, amount),
                  gas: global.Blockchain.GAS.transfer,
                  label: `Transfer ${formatInteger(amount)} fraction(s) of ${asset.assetName}`,
                  onStatus: (info) => {
                    if (info.stage === "submitted") {
                      global.UI.toast(
                        "The transfer was sent to the chain. Waiting for it to be confirmed...",
                        "info",
                        "Pending"
                      );
                    }
                  }
                });
                global.Store.invalidate();
                global.UI.toast(
                  `Transferred ${formatInteger(amount)} fraction(s) of ${asset.assetName}.`,
                  "success",
                  "Transfer confirmed"
                );
                global.UI.modal({
                  title: "Transfer confirmed",
                  body: `<div class="summary-box">${global.UI.receiptList(details)}</div>`,
                  footer: `<div class="btn-row" style="justify-content:flex-end"><button class="btn btn-primary" data-modal-close>Done</button></div>`
                });
                global.Utils.element("#page-root").dispatchEvent(new CustomEvent("view:refresh"));
              } catch (error) {
                global.UI.toast(global.Blockchain.friendlyError(error), "error", "Transfer failed");
              }
            }
          });
        });
      }
    });
  }

  async function changeStatus(newStatus) {
    const labels = { 0: "active", 1: "paused", 2: "retired" };
    global.UI.confirmation({
      title: `Change the status to ${labels[newStatus]}`,
      message: `The status of ${asset.assetName} will be set to ${labels[newStatus]}. This affects whether new purchases are allowed.`,
      noteHtml: newStatus === 2 ? "<strong>Retiring an asset is permanent.</strong> It cannot be undone." : "",
      confirmLabel: `Set to ${labels[newStatus]}`,
      danger: newStatus === 2,
      onConfirm: async () => {
        try {
          const details = await global.Blockchain.sendTransaction({
            method: global.Blockchain.getRegistry().methods.setAssetStatus(asset.assetId, newStatus),
            gas: global.Blockchain.GAS.setStatus,
            label: `Set status of ${asset.assetName}`
          });
          global.Store.invalidate();
          global.UI.toast(`${asset.assetName} is now ${labels[newStatus]}.`, "success", "Status updated");
          global.UI.modal({
            title: "Status updated",
            body: `<div class="summary-box">${global.UI.receiptList(details)}</div>`,
            footer: `<div class="btn-row" style="justify-content:flex-end"><button class="btn btn-primary" data-modal-close>Done</button></div>`
          });
          global.Utils.element("#page-root").dispatchEvent(new CustomEvent("view:refresh"));
        } catch (error) {
          global.UI.toast(global.Blockchain.friendlyError(error), "error", "Status change failed");
        }
      }
    });
  }

  async function collectProceeds() {
    const token = global.Blockchain.getToken(asset.tokenAddress);
    let balance = "0";
    try {
      balance = await global.Blockchain.state.web3.eth.getBalance(asset.tokenAddress);
    } catch (error) {
      global.UI.toast("The balance of the token contract could not be read.", "error");
      return;
    }

    if (BigInt(balance) === 0n) {
      global.UI.toast("There are no proceeds to collect for this asset.", "info");
      return;
    }

    global.UI.confirmation({
      title: "Collect the proceeds of sales",
      message: `The token contract currently holds ${formatCurrencyFromMinor(
        balance,
        { decimals: 0 }
      )} in test currency, collected from purchases. Send it to your wallet?`,
      confirmLabel: "Collect",
      onConfirm: async () => {
        try {
          const details = await global.Blockchain.sendTransaction({
            method: token.methods.withdrawProceeds(),
            gas: global.Blockchain.GAS.setStatus,
            label: `Collect proceeds of ${asset.assetName}`
          });
          global.Store.invalidate();
          global.UI.toast("The proceeds were sent to your wallet.", "success", "Proceeds collected");
          global.UI.modal({
            title: "Proceeds collected",
            body: `<div class="summary-box">${global.UI.receiptList(details)}</div>`,
            footer: `<div class="btn-row" style="justify-content:flex-end"><button class="btn btn-primary" data-modal-close>Done</button></div>`
          });
        } catch (error) {
          global.UI.toast(global.Blockchain.friendlyError(error), "error", "Withdrawal failed");
        }
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.assetDetail = { render, ledgerTable };
})(window);
