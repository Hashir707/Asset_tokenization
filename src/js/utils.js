/**
 * Shared helpers: formatting, DOM shortcuts, validation and small reusable
 * UI pieces. Everything here is framework free so the project stays a plain
 * HTML / CSS / JavaScript application.
 */
(function (global) {
  "use strict";

  const CURRENCY = { symbol: "Rs", code: "INR", minorUnits: 100 };

  /** Ledger transaction types, mirrored from contracts/AssetTxType.sol. */
  const TX_TYPES = {
    1: { key: "registration", label: "Asset Registration", pill: "pill-registration" },
    2: { key: "mint", label: "Token Mint", pill: "pill-mint" },
    3: { key: "transfer", label: "Token Transfer", pill: "pill-transfer" },
    4: { key: "purchase", label: "Token Purchase", pill: "pill-purchase" }
  };

  const ASSET_TYPES = ["Real Estate", "Gold", "Vehicle", "Artwork", "Digital Asset", "Other"];

  const STATUS = {
    0: { label: "Active", className: "" },
    1: { label: "Paused", className: "status-paused" },
    2: { label: "Retired", className: "status-retired" }
  };

  const NETWORKS = {
    1: "Ethereum Mainnet",
    5: "Goerli",
    11155111: "Sepolia",
    1337: "Ganache (chain id 1337)",
    1338: "Ganache (chain id 1338)",
    5777: "Ganache Local (network id 5777)"
  };

  // ---------------------------------------------------------------- numbers

  /** Converts a value stored in the smallest currency unit into a number. */
  function toMajorUnits(value) {
    const raw = typeof value === "string" ? BigInt(value) : BigInt(value || 0);
    return Number(raw) / CURRENCY.minorUnits;
  }

  /** 100000000 -> "10,00,000" (Indian digit grouping, as used in the report). */
  function formatNumber(value, fractionDigits) {
    const number = typeof value === "number" ? value : Number(value || 0);
    if (!isFinite(number)) {
      return "0";
    }
    return number.toLocaleString("en-IN", {
      minimumFractionDigits: fractionDigits || 0,
      maximumFractionDigits: fractionDigits === undefined ? 2 : fractionDigits
    });
  }

  /** Formats an amount stored in the smallest currency unit. */
  function formatCurrencyFromMinor(value, options) {
    const settings = options || {};
    const major = toMajorUnits(value);
    const text = formatNumber(major, settings.decimals === undefined ? 2 : settings.decimals);
    return settings.compact && Math.abs(major) >= 100000 ? `${CURRENCY.symbol} ${formatNumber(major, 0)}` : `${CURRENCY.symbol} ${text}`;
  }

  /** Formats a value already expressed in major units. */
  function formatCurrency(value, options) {
    return formatCurrencyFromMinor(BigInt(Math.round(Number(value || 0) * CURRENCY.minorUnits)), options);
  }

  function formatInteger(value) {
    return formatNumber(value, 0);
  }

  /** Percentage from basis points (10000 = 100%). */
  function formatPercentFromBasisPoints(basisPoints) {
    const percent = Number(basisPoints || 0) / 100;
    return `${percent.toFixed(2)}%`;
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  function formatDateTime(timestampSeconds) {
    if (!timestampSeconds) {
      return "-";
    }
    const date = new Date(Number(timestampSeconds) * 1000);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function shortAddress(address, lead) {
    if (!address) {
      return "-";
    }
    const size = lead || 6;
    return `${address.slice(0, size)}...${address.slice(-4)}`;
  }

  function shortHash(hash) {
    return shortAddress(hash, 10);
  }

  function networkName(networkId) {
    return NETWORKS[networkId] || `Network ${networkId}`;
  }

  // ---------------------------------------------------------------- DOM

  function escapeHtml(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function element(selector, root) {
    return (root || document).querySelector(selector);
  }

  function elements(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /** Copies text to the clipboard and reports the result. */
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // ---------------------------------------------------------------- validation

  function isValidAddress(address) {
    return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address.trim());
  }

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  function isZeroAddress(address) {
    return typeof address === "string" && address.trim().toLowerCase() === ZERO_ADDRESS;
  }

  function isPositiveInteger(value) {
    return /^\d+$/.test(String(value).trim()) && Number(value) > 0;
  }

  /** Registration limits, identical to the checks inside AssetRegistry.sol. */
  const LIMITS = {
    name: 128,
    type: 32,
    description: 2048,
    imageUrl: 2048
  };

  /**
   * Validates the registration form and returns a list of field errors.
   * @returns {{field: string, message: string}[]}
   */
  function validateAssetForm(values) {
    const errors = [];

    if (!values.assetName || !values.assetName.trim()) {
      errors.push({ field: "assetName", message: "Asset name cannot be empty." });
    } else if (values.assetName.trim().length > LIMITS.name) {
      errors.push({ field: "assetName", message: `Asset name must be ${LIMITS.name} characters or fewer.` });
    }

    if (!values.assetType) {
      errors.push({ field: "assetType", message: "Please choose an asset type." });
    }

    if (!isPositiveInteger(values.assetValue)) {
      errors.push({ field: "assetValue", message: "Asset value must be a positive number." });
    }

    if (!isPositiveInteger(values.totalTokens)) {
      errors.push({ field: "totalTokens", message: "Total tokens must be a positive whole number." });
    }

    if (values.assetValue && values.totalTokens) {
      const value = BigInt(values.assetValue);
      const tokens = BigInt(values.totalTokens);
      if (tokens > 0n && value % tokens !== 0n) {
        errors.push({
          field: "totalTokens",
          message: "The asset value must divide evenly by the number of tokens, so that every token has the same price."
        });
      }
    }

    if (values.description && values.description.length > LIMITS.description) {
      errors.push({ field: "description", message: `Description must be ${LIMITS.description} characters or fewer.` });
    }

    if (values.imageUrl && values.imageUrl.length > LIMITS.imageUrl) {
      errors.push({ field: "imageUrl", message: `Image URL must be ${LIMITS.imageUrl} characters or fewer.` });
    }

    if (values.owner && !isValidAddress(values.owner)) {
      errors.push({ field: "owner", message: "Enter a valid wallet address (0x followed by 40 characters)." });
    } else if (isZeroAddress(values.owner)) {
      errors.push({ field: "owner", message: "The zero address cannot own an asset." });
    }

    return errors;
  }

  /**
   * @param {string} value    the amount entered by the user
   * @param {string} [maximum] the largest amount the user may use
   * @param {string} [action]  "transfer" or "buy", used in the message
   */
  function validateTokenAmount(value, maximum, action) {
    if (!isPositiveInteger(value)) {
      return "Enter a whole number of tokens greater than zero.";
    }
    if (maximum !== undefined && BigInt(value) > BigInt(maximum)) {
      return `You can only ${action || "use"} at most ${formatInteger(maximum)} tokens.`;
    }
    return null;
  }

  // ---------------------------------------------------------------- assets

  function assetTypeIcon(type) {
    switch (type) {
      case "Real Estate":
        return "🏢";
      case "Gold":
        return "🪙";
      case "Vehicle":
        return "🚗";
      case "Artwork":
        return "🖼️";
      case "Digital Asset":
        return "💾";
      default:
        return "📦";
    }
  }

  /** Two letter fallback shown when an asset has no usable image. */
  function assetTypeInitials(type) {
    const letters = String(type || "Asset")
      .split(/\s+/)
      .map((word) => word.charAt(0))
      .join("")
      .slice(0, 2);
    return letters.toUpperCase();
  }

  global.Utils = {
    CURRENCY,
    TX_TYPES,
    ASSET_TYPES,
    STATUS,
    LIMITS,
    toMajorUnits,
    formatNumber,
    formatCurrency,
    formatCurrencyFromMinor,
    formatInteger,
    formatPercent,
    formatPercentFromBasisPoints,
    formatDateTime,
    shortAddress,
    shortHash,
    networkName,
    escapeHtml,
    element,
    elements,
    copyToClipboard,
    isValidAddress,
    isZeroAddress,
    ZERO_ADDRESS,
    isPositiveInteger,
    validateAssetForm,
    validateTokenAmount,
    assetTypeIcon,
    assetTypeInitials
  };
})(window);
