/**
 * Reusable interface components: toasts, modals, copyable values and the
 * small building blocks (stat cards, asset media, loading and error states)
 * that the views compose into pages.
 */
(function (global) {
  "use strict";

  const { escapeHtml, shortAddress, shortHash, formatInteger } = global.Utils;

  // ---------------------------------------------------------------- toasts

  function toast(message, type, title) {
    const stack = global.Utils.element("#toast-root");
    if (!stack) {
      return;
    }

    const kind = type || "info";
    const node = document.createElement("div");
    node.className = `toast toast-${kind}`;
    node.innerHTML =
      (title ? `<strong>${escapeHtml(title)}</strong>` : "") + `<p>${escapeHtml(message)}</p>`;

    stack.appendChild(node);

    const remove = () => {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    };
    setTimeout(remove, kind === "error" ? 9000 : 5000);
    node.addEventListener("click", remove);
  }

  // ---------------------------------------------------------------- modal

  let closeActiveModal = null;

  /**
   * Opens a modal dialog.
   *
   * @param {object} options
   * @param {string} options.title
   * @param {string} options.body        trusted HTML
   * @param {string} [options.footer]    trusted HTML for the button row
   * @param {boolean} [options.wide]
   * @param {function} [options.onMount] receives the modal root element
   */
  function modal(options) {
    closeModal();

    const root = document.createElement("div");
    root.className = "modal-root";
    root.innerHTML = `
      <div class="modal ${options.wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(options.title)}">
        <div class="modal-header">
          <h3>${escapeHtml(options.title)}</h3>
          <button class="icon-btn" data-modal-close aria-label="Close">&times;</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer"></div>
      </div>`;

    root.querySelector(".modal-body").innerHTML = options.body || "";
    const footer = root.querySelector(".modal-footer");
    if (options.footer) {
      footer.innerHTML = options.footer;
    } else {
      footer.remove();
    }

    root.addEventListener("click", (event) => {
      if (event.target === root || event.target.hasAttribute("data-modal-close")) {
        closeModal();
      }
    });

    document.body.appendChild(root);
    document.body.style.overflow = "hidden";

    closeActiveModal = () => {
      if (root.parentNode) {
        root.parentNode.removeChild(root);
      }
      document.body.style.overflow = "";
      closeActiveModal = null;
    };

    if (options.onMount) {
      options.onMount(root);
    }
    return root;
  }

  function closeModal() {
    if (closeActiveModal) {
      closeActiveModal();
    }
  }

  function isModalOpen() {
    return Boolean(closeActiveModal);
  }

  // ---------------------------------------------------------------- blocks

  function loading(message) {
    return `<div class="loading-block">
      <div class="spinner"></div>
      <p>${escapeHtml(message || "Loading data from the blockchain...")}</p>
    </div>`;
  }

  function emptyState(title, description, actionHtml) {
    return `<div class="state-block">
      <div class="state-icon">◍</div>
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(description)}</p>
      ${actionHtml || ""}
    </div>`;
  }

  function errorState(message, retryLabel) {
    return `<div class="state-block">
      <div class="state-icon">⚠</div>
      <h3>Data could not be loaded</h3>
      <p>${escapeHtml(message)}</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn btn-secondary" data-action="reload">${escapeHtml(retryLabel || "Try again")}</button>
      </div>
    </div>`;
  }

  function statCard(label, value, note) {
    return `<div class="stat-card">
      <span class="stat-label">${escapeHtml(label)}</span>
      <span class="stat-value">${escapeHtml(value)}</span>
      ${note ? `<span class="stat-note">${escapeHtml(note)}</span>` : ""}
    </div>`;
  }

  function statusBadge(status) {
    const info = global.Utils.STATUS[status] || global.Utils.STATUS[0];
    return `<span class="badge ${info.className}">${escapeHtml(info.label)}</span>`;
  }

  /**
   * Renders the image of an asset, falling back to the type initials when the
   * URL is missing or the image cannot be loaded.
   */
  function assetMedia(asset, withBadge) {
    const fallback = `<span class="media-fallback">${escapeHtml(global.Utils.assetTypeInitials(asset.assetType))}</span>`;
    const image = asset.imageUrl
      ? `<img src="${escapeHtml(asset.imageUrl)}" alt="${escapeHtml(asset.assetName)}" loading="lazy"
              onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'media-fallback',textContent:'${escapeHtml(
                global.Utils.assetTypeInitials(asset.assetType)
              )}'}))">`
      : fallback;

    return `<div class="asset-media">
      ${image}
      <span class="badge">${escapeHtml(asset.assetType)}</span>
      ${withBadge ? statusBadge(asset.status) : ""}
    </div>`;
  }

  function copyable(value, label) {
    const short = value ? shortAddress(value, 8) : "-";
    return `<span class="row-between" style="gap:8px">
      <span class="address" title="${escapeHtml(value || "")}">${escapeHtml(short)}</span>
      <button class="btn btn-ghost btn-sm" data-action="copy" data-value="${escapeHtml(value || "")}">
        ${escapeHtml(label || "Copy")}
      </button>
    </span>`;
  }

  function txLink(hash, label) {
    const explorer = global.Blockchain.explorerUrl();
    const text = escapeHtml(label || shortHash(hash));
    if (explorer && hash) {
      return `<a href="${escapeHtml(explorer)}${escapeHtml(hash)}" target="_blank" rel="noopener">${text}</a>`;
    }
    return `<span class="mono" title="${escapeHtml(hash || "")}">${text}</span>`;
  }

  /** Details table shared by the transaction receipts. */
  function receiptList(details) {
    const rows = [
      ["Transaction", txLink(details.hash)],
      ["Status", details.status === false ? "Failed" : "Confirmed"],
      ["Block", formatInteger(details.blockNumber)],
      ["From", shortAddress(details.from)],
      ["Gas used", formatInteger(details.gasUsed)],
      ["Time", global.Utils.formatDateTime(details.timestamp)]
    ];

    return `<dl class="receipt-grid">
      ${rows
        .map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${value}</dd>`)
        .join("")}
    </dl>`;
  }

  /** Shared handler for the `data-action="copy"` buttons rendered above. */
  async function handleCopyDelegation(event) {
    const button = event.target.closest('[data-action="copy"]');
    if (!button) {
      return;
    }
    const value = button.getAttribute("data-value");
    const ok = await global.Utils.copyToClipboard(value);
    toast(ok ? "Copied to clipboard." : "Could not copy automatically. Select the text and copy it manually.", ok ? "success" : "error");
  }

  function confirmation(options) {
    return modal({
      title: options.title,
      body: `
        <p>${escapeHtml(options.message)}</p>
        ${options.summaryHtml || ""}
        ${options.noteHtml ? `<div class="form-note">${options.noteHtml}</div>` : ""}`,
      footer: `<div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-secondary" data-modal-close>Cancel</button>
        <button class="btn ${options.danger ? "btn-secondary" : "btn-primary"}" id="confirm-accept">${escapeHtml(
        options.confirmLabel || "Confirm"
      )}</button>
      </div>`,
      onMount(root) {
        root.querySelector("#confirm-accept").addEventListener("click", async () => {
          closeModal();
          await options.onConfirm();
        });
      }
    });
  }

  global.UI = {
    toast,
    modal,
    closeModal,
    isModalOpen,
    loading,
    emptyState,
    errorState,
    statCard,
    statusBadge,
    assetMedia,
    copyable,
    txLink,
    receiptList,
    confirmation,
    handleCopyDelegation
  };
})(window);
