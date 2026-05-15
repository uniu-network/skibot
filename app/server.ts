import { Elysia } from "elysia";
import { spawn, execSync } from "child_process";
import http from "http";
import * as fs from "fs";
import * as path from "path";
import { node } from "@elysiajs/node";
import { WebSocket, WebSocketServer } from "ws";
import config from "./config.js";
import logger from "./log.js";
import type { Runtime } from "./runtime.js";
import { createApiRoutes } from "../routers/api.js";
import { createMessageRoutes } from "../routers/message.js";
import AuthRoutes from "../routers/auth.js";

const VITE_PORT = 3000;
const FRONTEND_DIST = "./frontend/dist";

const assetContentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

function serveFrontendFile(filePath: string): Response {
  const absoluteDist = path.resolve(FRONTEND_DIST);
  const absolutePath = path.resolve(filePath);
  if (
    !absolutePath.startsWith(`${absoluteDist}${path.sep}`) &&
    absolutePath !== absoluteDist
  ) {
    return new Response("Not Found", { status: 404 });
  }

  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return new Response("Not Found", { status: 404 });
  }

  const ext = path.extname(absolutePath).toLowerCase();
  const contentType = assetContentTypes[ext] || "application/octet-stream";
  return new Response(fs.readFileSync(absolutePath), {
    headers: { "Content-Type": contentType },
  });
}

function setupWebSocketProxy(httpServer: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.url?.startsWith("/__vite")) {
      wss.handleUpgrade(request, socket, head, (clientWs) => {
        wss.emit("connection", clientWs, request);
      });
      return;
    }
  });

  wss.on("connection", (clientWs, request) => {
    const url = request.url || "/";
    const viteWs = new WebSocket(`ws://localhost:${VITE_PORT}${url}`);

    clientWs.on("message", (data) => {
      if (viteWs.readyState === WebSocket.OPEN) {
        viteWs.send(data);
      }
    });

    clientWs.on("close", () => {
      if (
        viteWs.readyState === WebSocket.OPEN ||
        viteWs.readyState === WebSocket.CONNECTING
      ) {
        viteWs.close();
      }
    });

    clientWs.on("error", () => {
      viteWs.close();
    });

    viteWs.on("message", (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data);
      }
    });

    viteWs.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close();
      }
    });

    viteWs.on("error", () => {
      clientWs.close();
    });
  });
}

export async function startServer(runtime: Runtime): Promise<void> {
  const port = config.get("web.port");
  const host = config.get("web.host");

  const app = new Elysia({ adapter: node() })
    .onError(({ code, error }) => {
      logger.error(`HTTP error: ${code} ${error}`);
      return new Response("Internal error", { status: 500 });
    })
    .use(
      createApiRoutes({
        botManager: runtime.botManager,
        config,
        version: runtime.version,
      }),
    )
    .use(createMessageRoutes(runtime.botManager))
    .use(AuthRoutes);

  const debugMode = config.get("dashboard.debug") === true;

  if (debugMode) {
    logger.warn("dashboard debug mode enabled");
    runtime.dashboardDevServer = spawn("npm", ["run", "dev:frontend"], {
      stdio: "inherit",
      detached: process.platform !== "win32",
      shell: process.platform === "win32",
    });

    runtime.dashboardDevServer.on("exit", (code) => {
      if (code !== null && code !== 0) {
        logger.error(`dashboard dev server exited with code ${code}`);
      }
    });

    const proxyDashboard = ({ request }: { request: Request }) => {
      const url = new URL(request.url);
      return fetch(
        `http://localhost:${VITE_PORT}${url.pathname}${url.search}`,
        {
          method: request.method,
          headers: request.headers,
          body:
            request.method === "GET" || request.method === "HEAD"
              ? undefined
              : request.body,
          duplex: "half",
        } as RequestInit & { duplex: "half" },
      );
    };

    app.all("*", proxyDashboard);
  }

  if (!debugMode) {
    if (!fs.existsSync(`${FRONTEND_DIST}/index.html`)) {
      logger.info("Frontend dist not found, building...");
      try {
        execSync("npm run build:frontend", {
          stdio: "pipe",
          cwd: process.cwd(),
        });
        logger.info("Frontend build completed");
      } catch (e) {
        logger.error(e);
        logger.warn(
          'Frontend build failed, serving may not work. Run "npm run build:frontend" manually.',
        );
      }
    }

    app.get("/assets/*", ({ request }) => {
      const url = new URL(request.url);
      const assetPath = decodeURIComponent(
        url.pathname.replace(/^\/assets\//, ""),
      );
      return serveFrontendFile(path.join(FRONTEND_DIST, "assets", assetPath));
    });

    app.get("/favicon.ico", () => {
      return serveFrontendFile(path.join(FRONTEND_DIST, "favicon.ico"));
    });

    const indexHtml = fs.readFileSync(`${FRONTEND_DIST}/index.html`, "utf-8");
    app.get("*", ({ request }) => {
      const accept = request.headers.get("accept") || "";
      if (accept.includes("text/html")) {
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not Found", { status: 404 });
    });
  }

  app.listen({ port, hostname: host }, (serverInfo) => {
    logger.info(`Server is running on http://${host}:${port}`);

    if (debugMode && serverInfo?.raw?.node?.server) {
      const httpServer = serverInfo.raw.node.server as http.Server;
      setupWebSocketProxy(httpServer);
      logger.info("WebSocket proxy for Vite HMR is active");
    }
  });
}
