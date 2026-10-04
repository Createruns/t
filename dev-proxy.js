#!/usr/bin/env node
/**
 * Local dev server + CORS proxy for the Autonomous AI Spreadsheet Studio.
 *
 * Why this exists:
 *   The Kilo Gateway (https://api.kilo.ai) does NOT send Access-Control-Allow-Origin
 *   headers, so a browser cannot call it directly (requests fail with
 *   "TypeError: Failed to fetch" — a CORS block). This tiny, dependency-free
 *   Node server solves that by:
 *     1. Serving the static files (index.html, etc.) from this folder.
 *     2. Proxying any request to /api/gateway/*  ->  https://api.kilo.ai/api/gateway/*
 *        on the SERVER side (no CORS restriction), and relaying the response back.
 *     3. Injecting `window.KILO_BASE_URL_OVERRIDE = "/api/gateway"` into index.html
 *        so the app talks to this same-origin proxy instead of api.kilo.ai directly.
 *
 * Usage (from the `t` folder):
 *     node dev-proxy.js            # serves on http://localhost:8787
 *     PORT=3000 node dev-proxy.js  # custom port
 *
 * Then open:  http://localhost:8787/
 * Enter your Kilo API key via the ⚙ API Keys button and click Run — it now works
 * end-to-end because calls are routed through this proxy.
 *
 * NOTE: This is a DEVELOPMENT helper. For production, use a proper hardened
 * backend that keeps the API key server-side (never ship keys to the browser).
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;
const ROOT = __dirname;
const UPSTREAM = "https://api.kilo.ai"; // gateway host
const PROXY_PREFIX = "/api/gateway"; // same-origin path the app will call

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

// Snippet injected into index.html so the app routes Kilo calls through us.
const INJECT = `\n    <script>window.KILO_BASE_URL_OVERRIDE = ${JSON.stringify(
  PROXY_PREFIX
)};</script>`;

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

// Forward /api/gateway/* to the real Kilo gateway, server-side.
function proxy(req, res) {
  const upstreamUrl = new URL(UPSTREAM + req.url); // req.url already starts with /api/gateway
  const headers = { ...req.headers };
  // Rewrite Host and strip hop-by-hop / origin headers that confuse the upstream.
  headers.host = upstreamUrl.host;
  delete headers.origin;
  delete headers.referer;
  delete headers["accept-encoding"]; // keep it simple: avoid gzip handling

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const options = {
      method: req.method,
      headers,
    };
    const upReq = https.request(upstreamUrl, options, (upRes) => {
      const outHeaders = { ...upRes.headers };
      // Make the proxied response browser-friendly (same-origin, but be explicit).
      outHeaders["access-control-allow-origin"] = "*";
      outHeaders["access-control-allow-headers"] = "authorization, content-type";
      outHeaders["access-control-allow-methods"] = "GET, POST, OPTIONS";
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    });
    upReq.on("error", (err) => {
      send(
        res,
        502,
        JSON.stringify({ error: { message: "Proxy error: " + err.message } }),
        { "content-type": "application/json" }
      );
    });
    if (body.length) upReq.write(body);
    upReq.end();
  });
}

// Serve a static file, injecting the override script into index.html.
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.join(ROOT, path.normalize(urlPath));
  // Prevent path traversal outside ROOT.
  if (!filePath.startsWith(ROOT)) return send(res, 403, "Forbidden");

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found: " + urlPath);
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";

    if (ext === ".html") {
      let html = data.toString("utf8");
      // Inject the override right after <head> so it runs before the main script.
      html = html.replace(/<head>/i, "<head>" + INJECT);
      return send(res, 200, html, { "content-type": type });
    }
    send(res, 200, data, { "content-type": type });
  });
}

const server = http.createServer((req, res) => {
  // CORS preflight for the proxy path.
  if (req.method === "OPTIONS" && req.url.startsWith(PROXY_PREFIX)) {
    return send(res, 204, "", {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    });
  }

  if (req.url.startsWith(PROXY_PREFIX)) return proxy(req, res);
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  ▶ Dev server + Kilo CORS proxy running`);
  console.log(`    Open:   http://localhost:${PORT}/`);
  console.log(`    Proxy:  ${PROXY_PREFIX}/*  ->  ${UPSTREAM}${PROXY_PREFIX}/*`);
  console.log(`\n  Enter your Kilo API key via ⚙ API Keys, then click Run.\n`);
});
