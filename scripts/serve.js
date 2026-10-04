/**
 * Zero dependency static file server for the front end.
 *
 *   npm start          -> syncs the contracts and serves src/ on port 8080
 *   npm run serve      -> serves src/ only (use after a deployment)
 *   PORT=3000 npm run serve
 *
 * The project has no build step: the browser loads the plain HTML, CSS and
 * JavaScript files of src/ together with the web3.js library.
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const ROOT = path.resolve(__dirname, "..", "src");
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "127.0.0.1";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    // The front end always reads the latest build during a demonstration.
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function resolveRequestPath(requestUrl) {
  const parsed = new URL(requestUrl, `http://${HOST}:${PORT}`);
  const decoded = decodeURIComponent(parsed.pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const target = path.resolve(ROOT, relative);

  // Never serve anything outside src/.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return null;
  }
  return target;
}

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
    return;
  }

  const target = resolveRequestPath(request.url);
  if (target === null) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(target, (error, content) => {
    if (error) {
      const message = error.code === "ENOENT" ? `Not found: ${request.url}` : "Unable to read the file";
      send(response, error.code === "ENOENT" ? 404 : 500, message, "text/plain; charset=utf-8");
      return;
    }

    const contentType = MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    response.end(request.method === "HEAD" ? undefined : content);
  });
});

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("  Asset Tokenization front end");
  console.log("  ----------------------------");
  console.log(`  Serving  : ${ROOT}`);
  console.log(`  Open     : http://${HOST}:${PORT}`);
  console.log("");
  console.log("  Start Ganache, connect MetaMask to http://127.0.0.1:7545, then");
  console.log("  press the Connect Wallet button in the top right corner.");
  console.log("");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\nPort ${PORT} is already in use. Try: PORT=8081 npm run serve\n`);
  } else {
    console.error(`\nServer error: ${error.message}\n`);
  }
  process.exit(1);
});
