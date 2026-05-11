import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import {
  DashboardAdminService,
  type DashboardAdminSnapshot
} from "../orchestrator/dashboardAdminService.js";

const require = createRequire(import.meta.url);
const escapeHtmlPackage = require("escape-html") as (value: string) => string;

function escapeHtml(value: string): string {
  return escapeHtmlPackage(value);
}

const HTML_RESPONSE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

function renderModuleCards(snapshot: DashboardAdminSnapshot): string {
  return snapshot.modules
    .map(
      (module) => `
        <article class="card module-card">
          <div class="eyebrow">${escapeHtml(module.key)}</div>
          <h3>${escapeHtml(module.label)}</h3>
          <p><strong>${escapeHtml(module.status)}</strong> / ${escapeHtml(module.mode)}</p>
          ${
            module.reason
              ? `<p class="muted">${escapeHtml(module.reason)}</p>`
              : '<p class="muted">Ready in this v1.</p>'
          }
        </article>
      `
    )
    .join("");
}

function renderPromptItems(snapshot: DashboardAdminSnapshot): string {
  if (!snapshot.prompts.items.length) {
    return '<li class="muted">No prompt items yet.</li>';
  }

  return snapshot.prompts.items
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.selector)}</strong>
          <span>${escapeHtml(item.label || "(no label)")}</span>
          <span class="muted">${escapeHtml(item.intent || "none")}</span>
          <span class="pill ${item.source === "builtin" ? "pill-builtin" : "pill-custom"}">${escapeHtml(item.source)}</span>
        </li>
      `
    )
    .join("");
}

function renderHistoryCandidates(snapshot: DashboardAdminSnapshot): string {
  if (!snapshot.history.candidates.length) {
    return '<li class="muted">No candidates.</li>';
  }

  return snapshot.history.candidates
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.selector)}</strong>
          <span>${escapeHtml(item.title)}</span>
          <span class="muted">${escapeHtml(item.stage || "none")}</span>
        </li>
      `
    )
    .join("");
}

function renderHistoryProposals(snapshot: DashboardAdminSnapshot): string {
  if (!snapshot.history.proposals.length) {
    return '<li class="muted">No proposals.</li>';
  }

  return snapshot.history.proposals
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.selector)}</strong>
          <span>${escapeHtml(item.title)}</span>
          <span class="muted">${escapeHtml(item.destination)}</span>
        </li>
      `
    )
    .join("");
}

function renderCapabilities(items: string[]): string {
  return items
    .map((item) => `<span class="pill">${escapeHtml(item)}</span>`)
    .join("");
}

function renderDashboardHtml(snapshot: DashboardAdminSnapshot): string {
  const refreshHref = `/admin?workdir=${encodeURIComponent(snapshot.workdir)}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dex Agent Admin Dashboard</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --panel: #fffaf2;
        --ink: #182026;
        --muted: #5f6b76;
        --line: #dccfb9;
        --accent: #0d6b5f;
        --accent-soft: #d9efe9;
        --builtin: #efe5cf;
        --custom: #e3edf8;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: linear-gradient(180deg, #f8f1e8 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: flex-start;
        margin-bottom: 24px;
      }
      h1, h2, h3, p { margin-top: 0; }
      .muted { color: var(--muted); }
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 999px;
        background: var(--accent);
        color: white;
        text-decoration: none;
        font-weight: 600;
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .modules {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-bottom: 20px;
      }
      .columns {
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      }
      .card {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 18px;
        box-shadow: 0 12px 40px rgba(80, 61, 28, 0.08);
      }
      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 8px;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
      }
      li {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 0;
        border-top: 1px solid rgba(220, 207, 185, 0.65);
      }
      li:first-child { border-top: 0; padding-top: 0; }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 600;
      }
      .pill-builtin {
        background: var(--builtin);
        color: #7a5d16;
      }
      .pill-custom {
        background: var(--custom);
        color: #275d91;
      }
      code {
        background: rgba(24, 32, 38, 0.06);
        padding: 2px 6px;
        border-radius: 8px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <div class="eyebrow">Dex Agent / admin web</div>
          <h1>Dashboard admin funcionando</h1>
          <p class="muted">Workdir: <code>${escapeHtml(snapshot.workdir)}</code></p>
        </div>
        <div class="actions">
          <a class="button" href="${escapeHtml(refreshHref)}">Refresh</a>
        </div>
      </header>

      <section class="grid modules">
        ${renderModuleCards(snapshot)}
      </section>

      <section class="grid columns">
        <article class="card">
          <div class="eyebrow">Prompts</div>
          <h2>Itens</h2>
          <p class="muted">Built-ins + customs no mesmo contrato do admin.</p>
          <ul>${renderPromptItems(snapshot)}</ul>
          <div class="actions" style="margin-top: 16px;">${renderCapabilities(
            snapshot.prompts.capabilities
          )}</div>
        </article>

        <article class="card">
          <div class="eyebrow">History</div>
          <h2>Candidates</h2>
          <ul>${renderHistoryCandidates(snapshot)}</ul>
          <h3 style="margin-top: 18px;">Proposals</h3>
          <ul>${renderHistoryProposals(snapshot)}</ul>
          <div class="actions" style="margin-top: 16px;">${renderCapabilities(
            snapshot.history.capabilities
          )}</div>
        </article>
      </section>
    </main>
  </body>
</html>`;
}

function renderErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Dex Agent Admin Error</title>
  </head>
  <body>
    <main>
      <h1>Admin dashboard error</h1>
      <p>${escapeHtml(message)}</p>
    </main>
  </body>
</html>`;
}

export class AdminWebServer {
  private server: http.Server | null = null;
  private startPromise: Promise<string> | null = null;
  private baseUrl: string | null = null;

  constructor(
    private readonly dashboardAdminService = new DashboardAdminService(),
    private readonly host = "127.0.0.1",
    private readonly port = 0
  ) {}

  async getLink(workdir: string): Promise<string> {
    const baseUrl = await this.ensureStarted();
    const resolvedWorkdir = path.resolve(workdir);
    return `${baseUrl}/admin?workdir=${encodeURIComponent(resolvedWorkdir)}`;
  }

  async shutdown(): Promise<void> {
    this.startPromise = null;
    this.baseUrl = null;

    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private async ensureStarted(): Promise<string> {
    if (this.baseUrl) {
      return this.baseUrl;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = new Promise<string>((resolve, reject) => {
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response);
      });

      server.once("error", reject);
      server.listen(this.port, this.host, () => {
        server.off("error", reject);
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("admin_web_server_address_unavailable"));
          return;
        }

        this.server = server;
        this.baseUrl = `http://${this.host}:${address.port}`;
        resolve(this.baseUrl);
      });
    });

    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const requestUrl = new URL(
      request.url || "/",
      this.baseUrl || `http://${this.host}`
    );

    if (requestUrl.pathname === "/") {
      response.writeHead(302, { location: "/admin" });
      response.end();
      return;
    }

    if (requestUrl.pathname !== "/admin") {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8"
      });
      response.end("Not found");
      return;
    }

    const workdir = requestUrl.searchParams.get("workdir") || process.cwd();

    try {
      const snapshot = await this.dashboardAdminService.inspect(workdir);
      response.writeHead(200, HTML_RESPONSE_HEADERS);
      response.end(renderDashboardHtml(snapshot));
    } catch (error) {
      response.writeHead(500, HTML_RESPONSE_HEADERS);
      response.end(
        renderErrorHtml(error instanceof Error ? error.message : String(error))
      );
    }
  }
}
