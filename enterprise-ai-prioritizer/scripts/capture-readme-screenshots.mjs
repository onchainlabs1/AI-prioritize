import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "..");
const screenshotDir = path.join(projectDir, "docs", "screenshots");
const host = "127.0.0.1";
const port = 8791;
const baseUrl = `http://${host}:${port}`;
const chromeExecutablePath =
  process.env.PLAYWRIGHT_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const screenshotTargets = [
  {
    path: "/index.html",
    waitFor: { type: "text", value: "Decision Snapshot" },
    file: "decision-dashboard.png",
  },
  {
    path: "/assessment.html?id=AII-2026-0006",
    waitFor: { type: "selector", value: "#decisionHeadline" },
    file: "assessment-workspace.png",
  },
  {
    path: "/board.html",
    waitFor: { type: "text", value: "Decision Queue" },
    file: "decision-review.png",
  },
  {
    path: "/how-it-works.html",
    waitFor: { type: "text", value: "What This Workbench Helps You Decide" },
    file: "how-it-works.png",
  },
];

function startServer() {
  return spawn("python3", ["server.py", "--host", host, "--port", String(port)], {
    cwd: projectDir,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForTarget(page, target) {
  if (target.waitFor.type === "selector") {
    await page.waitForSelector(target.waitFor.value, { timeout: 15000 });
    return;
  }
  await page.getByText(target.waitFor.value, { exact: true }).waitFor({ timeout: 15000 });
}

async function captureScreenshots() {
  await mkdir(screenshotDir, { recursive: true });

  const server = startServer();
  let serverLogs = "";
  server.stdout.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverLogs += chunk.toString();
  });

  try {
    await waitForServer(`${baseUrl}/api/health`);

    const browser = await chromium.launch({
      executablePath: chromeExecutablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-component-update",
        "--no-first-run",
      ],
    });

    try {
      for (const target of screenshotTargets) {
        const page = await browser.newPage({
          viewport: { width: 1600, height: 1100 },
          deviceScaleFactor: 1,
        });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${baseUrl}${target.path}`, { waitUntil: "networkidle" });
        await waitForTarget(page, target);
        await page.screenshot({
          path: path.join(screenshotDir, target.file),
          fullPage: false,
        });
        console.log(`saved ${path.join(screenshotDir, target.file)}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
    if (serverLogs.trim()) {
      process.stdout.write(serverLogs);
    }
  }
}

captureScreenshots().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
