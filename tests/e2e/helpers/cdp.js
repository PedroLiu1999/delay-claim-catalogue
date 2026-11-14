const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "../../..");

function resolveChromiumBin() {
  for (const envVar of [process.env.CHROMIUM_BIN, process.env.CHROME_BIN]) {
    if (envVar && envVar.trim()) {
      return envVar.trim();
    }
  }

  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ]) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  for (const name of ["google-chrome", "chromium", "chromium-browser"]) {
    try {
      const resolved = execFileSync("which", [name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (resolved && fs.existsSync(resolved)) {
        return resolved;
      }
    } catch {
      // ignore if not found on PATH
    }
  }

  throw new Error(
    "Could not find a Chromium/Chrome binary. Set CHROMIUM_BIN or CHROME_BIN."
  );
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function startServer(options = {}) {
  const routes = options.routes || null;
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, "http://127.0.0.1");
      const pathname = decodeURIComponent(reqUrl.pathname);

      if (typeof routes === "function") {
        const handled = await routes(req, res, pathname);
        if (handled) return;
      } else if (routes && Object.prototype.hasOwnProperty.call(routes, pathname)) {
        const handler = routes[pathname];
        if (typeof handler === "function") {
          await handler(req, res, pathname);
          return;
        }
        const status = handler.status ?? 200;
        const headers = handler.headers ?? { "Content-Type": "text/plain; charset=utf-8" };
        if (handler.delayMs) {
          await new Promise((r) => setTimeout(r, handler.delayMs));
        }
        res.writeHead(status, headers);
        res.end(handler.body ?? "");
        return;
      }

      const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const fullPath = path.resolve(ROOT_DIR, relPath);

      if (!fullPath.startsWith(ROOT_DIR + path.sep) && fullPath !== ROOT_DIR) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end(String(err.message || err));
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve({
        server,
        port: addr.port,
        baseUrl,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

function isExternalFontUrl(url) {
  if (!url) return false;
  return (
    url.startsWith("https://fonts.googleapis.com") ||
    url.startsWith("https://fonts.gstatic.com")
  );
}

async function launchBrowser() {
  const chromiumBin = resolveChromiumBin();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dcc-e2e-"));
  const chrome = spawn(
    chromiumBin,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"], detached: true }
  );

  let exited = false;
  chrome.on("exit", () => {
    exited = true;
  });

  async function cleanupProcessAndDir() {
    if (!exited) {
      try {
        process.kill(-chrome.pid, "SIGKILL");
      } catch {
        // ignore if process group already exited
      }
      try {
        chrome.kill("SIGKILL");
      } catch {
        // ignore
      }
      await new Promise((resolve) => {
        if (exited) return resolve();
        const timer = setTimeout(resolve, 2000);
        chrome.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    fs.rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }

  let ws;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let stderrBuf = "";
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Chromium DevTools URL. stderr:\n${stderrBuf}`));
      }, 10000);

      chrome.stderr.on("data", (chunk) => {
        stderrBuf += chunk.toString("utf8");
        const match = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });

      chrome.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });

      chrome.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited prematurely with code ${code}. stderr:\n${stderrBuf}`));
      });
    });

    ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket connect timeout")), 5000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error: ${err.message || "unknown"}`));
      });
    });
  } catch (err) {
    try {
      if (ws) ws.close();
    } catch {
      // ignore
    }
    await cleanupProcessAndDir();
    throw err;
  }

  let nextId = 1;
  const pending = new Map();
  const eventListeners = new Set();

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id !== undefined) {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (msg.error) {
          entry.reject(new Error(`CDP ${entry.method} error: ${JSON.stringify(msg.error)}`));
        } else {
          entry.resolve(msg.result);
        }
      }
    } else if (msg.method) {
      for (const listener of eventListeners) {
        listener(msg);
      }
    }
  });

  ws.addEventListener("close", () => {
    for (const [, entry] of pending) {
      entry.reject(new Error(`CDP WebSocket closed before ${entry.method} completed`));
    }
    pending.clear();
  });

  function send(method, params = {}, sessionId = undefined) {
    const id = nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      ws.send(JSON.stringify(payload));
    });
  }

  async function openPage(baseUrl, options = {}) {
    const { browserContextId } = await send("Target.createBrowserContext");
    const { targetId } = await send("Target.createTarget", {
      url: "about:blank",
      browserContextId,
    });
    const { sessionId } = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });

    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);

    if (options.grantClipboard) {
      await send("Browser.grantPermissions", {
        origin: baseUrl,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
        browserContextId,
      });
    }

    if (options.initScript) {
      await send(
        "Page.addScriptToEvaluateOnNewDocument",
        { source: options.initScript },
        sessionId
      );
    }

    const exceptions = [];
    const consoleErrors = [];
    const localNetworkErrors = [];
    const requestUrls = new Map();

    const listener = (msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === "Runtime.exceptionThrown") {
        const details = msg.params?.exceptionDetails;
        exceptions.push(
          details?.exception?.description || details?.text || "Unknown runtime exception"
        );
      } else if (msg.method === "Runtime.consoleAPICalled") {
        if (msg.params?.type === "error") {
          const text = (msg.params.args || [])
            .map((a) => a.value ?? a.description ?? "")
            .join(" ");
          if (!text.includes("fonts.googleapis.com") && !text.includes("fonts.gstatic.com")) {
            consoleErrors.push(text);
          }
        }
      } else if (msg.method === "Network.requestWillBeSent") {
        requestUrls.set(msg.params.requestId, msg.params.request?.url || "");
      } else if (msg.method === "Network.responseReceived") {
        const url = msg.params?.response?.url || "";
        const status = msg.params?.response?.status || 0;
        if (
          status >= 400 &&
          url.startsWith(baseUrl) &&
          !url.endsWith("/favicon.ico") &&
          !isExternalFontUrl(url)
        ) {
          localNetworkErrors.push({ url, status });
        }
      } else if (msg.method === "Network.loadingFailed") {
        const url = requestUrls.get(msg.params?.requestId) || "";
        if (url.startsWith(baseUrl) && !url.endsWith("/favicon.ico") && !isExternalFontUrl(url)) {
          localNetworkErrors.push({ url, errorText: msg.params?.errorText || "loadingFailed" });
        }
      }
    };

    eventListeners.add(listener);

    const targetUrl = options.url || baseUrl;
    await send("Page.navigate", { url: targetUrl }, sessionId);

    async function evaluate(expression) {
      const res = await send(
        "Runtime.evaluate",
        {
          expression,
          returnByValue: true,
          awaitPromise: true,
        },
        sessionId
      );
      if (res.exceptionDetails) {
        throw new Error(
          `Page evaluate error: ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`
        );
      }
      return res.result?.value;
    }

    async function waitFor(predicateExpr, timeoutMs = 5000) {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const val = await evaluate(`Boolean(${predicateExpr})`);
        if (val) return true;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`waitFor timed out after ${timeoutMs}ms: ${predicateExpr}`);
    }

    await waitFor('document.readyState === "complete"');

    if (options.waitForOperators !== false) {
      await waitFor(
        'document.querySelectorAll(".operator-card").length > 0 || document.querySelector("#results-count")?.textContent?.includes("Failed") || document.querySelector("#empty-state")?.hidden === false'
      );
    }

    const page = {
      sessionId,
      targetId,
      browserContextId,
      exceptions,
      consoleErrors,
      localNetworkErrors,
      evaluate,
      waitFor,
      async click(selector) {
        const ok = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.scrollIntoView({ block: "nearest" });
          el.click();
          return true;
        })()`);
        if (!ok) throw new Error(`click: element not found: ${selector}`);
      },
      async clickNth(selector, index) {
        const ok = await evaluate(`(() => {
          const els = document.querySelectorAll(${JSON.stringify(selector)});
          const el = els[${index}];
          if (!el) return false;
          el.scrollIntoView({ block: "nearest" });
          el.click();
          return true;
        })()`);
        if (!ok) throw new Error(`clickNth: element[${index}] not found: ${selector}`);
      },
      async setInputValue(selector, value) {
        const ok = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.value = ${JSON.stringify(String(value))};
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`);
        if (!ok) throw new Error(`setInputValue: element not found: ${selector}`);
      },
      async selectOption(selector, value) {
        const ok = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.value = ${JSON.stringify(String(value))};
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`);
        if (!ok) throw new Error(`selectOption: element not found: ${selector}`);
      },
      async setCheckbox(selector, checked) {
        const ok = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.checked = ${Boolean(checked)};
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        })()`);
        if (!ok) throw new Error(`setCheckbox: element not found: ${selector}`);
      },
      async pressKey(selector, key) {
        const ok = await evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return false;
          el.focus();
          return document.activeElement === el;
        })()`);
        if (!ok) throw new Error(`pressKey: element not focusable/found: ${selector}`);
        const keyCode = key === "Enter" ? 13 : key === " " ? 32 : 0;
        const code = key === " " ? "Space" : key;
        await send(
          "Input.dispatchKeyEvent",
          {
            type: "rawKeyDown",
            key,
            code,
            windowsVirtualKeyCode: keyCode,
            nativeVirtualKeyCode: keyCode,
          },
          sessionId
        );
        await send(
          "Input.dispatchKeyEvent",
          {
            type: "char",
            text: key === "Enter" ? "\r" : key,
            key,
            code,
            windowsVirtualKeyCode: keyCode,
            nativeVirtualKeyCode: keyCode,
          },
          sessionId
        );
        await send(
          "Input.dispatchKeyEvent",
          {
            type: "keyUp",
            key,
            code,
            windowsVirtualKeyCode: keyCode,
            nativeVirtualKeyCode: keyCode,
          },
          sessionId
        );
      },
      text(selector) {
        return evaluate(
          `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`
        );
      },
      texts(selector) {
        return evaluate(
          `Array.from(document.querySelectorAll(${JSON.stringify(selector)})).map(e => e.textContent.trim())`
        );
      },
      count(selector) {
        return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
      },
      exists(selector) {
        return evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      },
      isHidden(selector) {
        return evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)})?.hidden)`);
      },
      attr(selector, name) {
        return evaluate(
          `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(name)}) ?? null`
        );
      },
      hasClass(selector, className) {
        return evaluate(
          `Boolean(document.querySelector(${JSON.stringify(selector)})?.classList.contains(${JSON.stringify(className)}))`
        );
      },
      async close() {
        eventListeners.delete(listener);
        try {
          await send("Target.closeTarget", { targetId });
        } catch {
          // ignore if already closed
        }
        try {
          await send("Target.disposeBrowserContext", { browserContextId });
        } catch {
          // ignore if already disposed
        }
      },
    };

    return page;
  }

  async function close() {
    try {
      await Promise.race([
        send("Browser.close"),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    } catch {
      // ignore if already closed
    }
    try {
      ws.close();
    } catch {
      // ignore
    }
    await cleanupProcessAndDir();
  }

  return { openPage, close, send };
}

async function withTestContext(browser, serverOptionsOrFn, maybeFn) {
  let serverOptions = {};
  let fn = serverOptionsOrFn;
  if (typeof maybeFn === "function") {
    serverOptions = serverOptionsOrFn || {};
    fn = maybeFn;
  }
  const server = await startServer(serverOptions);
  let page = null;
  try {
    page = await browser.openPage(server.baseUrl, serverOptions.pageOptions || {});
    await fn({ page, server, baseUrl: server.baseUrl });
  } finally {
    if (page) await page.close();
    await server.close();
  }
}

module.exports = {
  ROOT_DIR,
  startServer,
  launchBrowser,
  withTestContext,
};
