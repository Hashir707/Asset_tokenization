/**
 * Application entry point: the hash router, the wallet connection and the
 * small pieces of global behaviour (nav state, copy buttons, MetaMask events).
 */
(function (global) {
  "use strict";

  const ROUTES = [
    { pattern: /^\/?$/, view: () => global.Views.home },
    { pattern: /^\/dashboard$/, view: () => global.Views.dashboard },
    { pattern: /^\/assets$/, view: () => global.Views.assets },
    { pattern: /^\/assets\/(\d+)$/, view: () => global.Views.assetDetail, params: (match) => ({ id: match[1] }) },
    { pattern: /^\/register$/, view: () => global.Views.register },
    { pattern: /^\/holdings$/, view: () => global.Views.holdings },
    { pattern: /^\/transactions$/, view: () => global.Views.transactions },
    { pattern: /^\/about$/, view: () => global.Views.about }
  ];

  const NAV_LINKS = [
    { href: "#/", match: /^\/?$/, label: "Home" },
    { href: "#/dashboard", match: /^\/dashboard$/, label: "Dashboard" },
    { href: "#/assets", match: /^\/assets(\/\d+)?$/, label: "Assets" },
    { href: "#/register", match: /^\/register$/, label: "Register Asset" },
    { href: "#/holdings", match: /^\/holdings$/, label: "My Holdings" },
    { href: "#/transactions", match: /^\/transactions$/, label: "Transactions" },
    { href: "#/about", match: /^\/about$/, label: "About" }
  ];

  const pageRoot = () => global.Utils.element("#page-root");
  let rendering = false;

  // ---------------------------------------------------------------- routing

  function parseHash() {
    const hash = global.location.hash.replace(/^#/, "");
    const [path] = hash.split("?");
    const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
    return { path: path || "/", query: new URLSearchParams(query) };
  }

  function resolveRoute(path) {
    for (const route of ROUTES) {
      const match = route.pattern.exec(path);
      if (match) {
        return { route, params: route.params ? route.params(match) : {} };
      }
    }
    return null;
  }

  function updateNav(path) {
    NAV_LINKS.forEach((link) => {
      const node = global.Utils.element(`.main-nav a[data-href="${link.href}"]`);
      if (node) {
        node.classList.toggle("active", link.match.test(path));
      }
    });
  }

  async function renderRoute() {
    if (rendering) {
      return;
    }
    rendering = true;

    const { path, query } = parseHash();
    const root = pageRoot();
    updateNav(path);

    // Views without a wallet show their own call to action, so they render
    // even when the contracts of this network are not deployed.
    if (!global.Blockchain.isConnected() && !/^\/(holdings|register)$/.test(path)) {
      if (!global.Blockchain.hasContracts()) {
        const warning = global.Utils.element("#network-warning");
        warning.classList.remove("hidden");
        root.innerHTML = global.UI.errorState(
          global.Blockchain.state.networkId
            ? `The contracts of this project are not deployed on network ${global.Blockchain.state.networkId}. Start Ganache, run "npm run deploy", then reload.`
            : "Connect your MetaMask wallet to load data from the chain."
        );
        rendering = false;
        return;
      }
    }

    const resolved = resolveRoute(path);
    if (!resolved) {
      root.innerHTML = `<div class="page">${global.UI.emptyState(
        "Page not found",
        "The address you opened does not match any page of this application.",
        `<a class="btn btn-primary" href="#/">Back to the home page</a>`
      )}</div>`;
      rendering = false;
      return;
    }

    try {
      await resolved.route.view().render(root, Object.assign({}, resolved.params, { query }));
    } catch (error) {
      console.error(error);
      root.innerHTML = global.UI.errorState(global.Blockchain.friendlyError(error));
    } finally {
      rendering = false;
    }
  }

  // ---------------------------------------------------------------- wallet ui

  function renderWallet() {
    const button = global.Utils.element("#connect-button");
    const chip = global.Utils.element("#wallet-chip");
    const account = global.Blockchain.state.account;

    if (account) {
      button.textContent = global.Utils.shortAddress(account);
      button.classList.remove("btn-primary");
      button.classList.add("btn-secondary");
      button.title = `${account} - click to disconnect`;
      chip.classList.remove("hidden");
      global.Utils.element("#wallet-address").textContent = global.Utils.shortAddress(account, 10);
      global.Utils.element("#wallet-network").textContent = global.Utils.networkName(global.Blockchain.state.networkId);
    } else {
      button.textContent = "Connect Wallet";
      button.classList.add("btn-primary");
      button.classList.remove("btn-secondary");
      button.title = "Connect your MetaMask wallet";
      chip.classList.add("hidden");
    }

    const warning = global.Utils.element("#network-warning");
    if (account && !global.Blockchain.hasContracts()) {
      warning.classList.remove("hidden");
      global.Utils.element("#network-warning-text").textContent =
        `The contracts are not deployed on ${global.Utils.networkName(global.Blockchain.state.networkId)}. ` +
        `Start Ganache and run "npm run deploy" on that node, then reload.`;
    } else if (account) {
      warning.classList.add("hidden");
    }
  }

  async function connectWallet() {
    const button = global.Utils.element("#connect-button");
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Connecting...";

    try {
      const account = await global.Blockchain.connect();
      global.Store.invalidate();
      renderWallet();
      global.UI.toast(`Connected as ${global.Utils.shortAddress(account)}.`, "success");
      await renderRoute();
    } catch (error) {
      global.UI.toast(global.Blockchain.friendlyError(error), "error", "Wallet");
    } finally {
      button.disabled = false;
      button.textContent = original === "Connecting..." ? "Connect Wallet" : original;
    }
  }

  function disconnectWallet() {
    global.Blockchain.disconnect();
    global.Store.invalidate();
    renderWallet();
    global.UI.toast("The wallet was disconnected from this page.", "info");
    renderRoute();
  }

  // ---------------------------------------------------------------- start up

  async function start() {
    // Navigation links are rendered from one list so the active state and the
    // router can never disagree.
    const nav = global.Utils.element("#main-nav");
    nav.innerHTML = NAV_LINKS.map(
      (link) => `<a href="${link.href}" data-href="${link.href}">${link.label}</a>`
    ).join("");

    global.Utils.element("#connect-button").addEventListener("click", (event) => {
      if (global.Blockchain.isConnected()) {
        disconnectWallet();
      } else {
        connectWallet();
      }
      event.stopPropagation();
    });

    // "Connect wallet" buttons rendered by the views.
    document.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="connect"]')) {
        connectWallet();
      }
      if (event.target.closest('[data-action="reload"]')) {
        renderRoute();
      }
    });

    document.addEventListener("click", (event) => {
      global.UI.handleCopyDelegation(event);
    });

    global.Utils.element("#page-root").addEventListener("view:refresh", () => {
      renderRoute();
    });

    // A modal is deliberately kept open across a route change: after a
    // registration the view switches to the new asset while the receipt stays
    // on screen. Its own links carry data-modal-close to dismiss it.
    window.addEventListener("hashchange", () => {
      renderRoute();
    });

    global.Blockchain.onChange((event) => {
      if (event === "network" || event === "disconnected") {
        renderWallet();
        renderRoute();
      }
    });

    if (global.Blockchain.isMetaMaskInstalled()) {
      global.ethereum.on("accountsChanged", async () => {
        await global.Blockchain.loadNetwork();
        global.Store.invalidate();
        renderWallet();
        renderRoute();
        global.UI.toast("The wallet account changed. The data has been reloaded.", "info");
      });

      global.ethereum.on("chainChanged", async () => {
        await global.Blockchain.loadNetwork();
        global.Store.invalidate();
        renderWallet();
        renderRoute();
        global.UI.toast("The network changed. The data has been reloaded.", "info");
      });

      // Reconnect automatically when the page is opened with an unlocked wallet.
      const accounts = await global.ethereum.request({ method: "eth_accounts" });
      if (accounts && accounts.length > 0) {
        try {
          await global.Blockchain.loadNetwork();
          renderWallet();
        } catch (error) {
          console.warn("Auto connection failed", error);
        }
      }
    } else {
      global.Utils.element("#network-warning").classList.remove("hidden");
      global.Utils.element("#network-warning-text").textContent =
        "MetaMask was not detected. Install the extension to connect a wallet and interact with the contracts.";
    }

    renderWallet();
    renderRoute();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
