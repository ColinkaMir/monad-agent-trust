#!/usr/bin/env node
/**
 * Drive the live product in a real browser and record it, so the demo video shows the product
 * working rather than a slideshow about it. The track requires exactly that: "must show the live
 * working product, not slides or a code walkthrough".
 *
 * Deterministic on purpose: every wait is for something visible on the page, never a bare sleep
 * chosen to look right once. If the site is slow the shot waits; if an element never arrives the
 * run fails loudly instead of recording a blank panel and calling it a demo.
 *
 * The wallet-signing shot is NOT here. It needs a funded wallet and a human approving a signature,
 * and faking that on video would be the one thing this project exists to object to.
 *
 *   node tools/record-demo.mjs            # writes build/video/demo-raw.webm plus shots.json
 */
import { chromium } from "/home/solana/discord-reader/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.DEMO_BASE ?? "https://prooflines.org/monad/agent-trust/";
const OUT = "build/video";
const SHOTS = [];

const shot = (name, at) => SHOTS.push({ name, at: Math.round(at) });

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    recordVideo: { dir: OUT, size: { width: 1600, height: 900 } },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const started = Date.now();
  const since = () => (Date.now() - started) / 1000;

  // 1. The question the product asks, before anything is typed into it.
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("text=/deserve its reputation/i", { timeout: 30_000 });
  shot("question", since());
  await page.waitForTimeout(4000);

  // 2. The most rated agent on the chain, and the verdict it earns.
  const box = page.getByPlaceholder(/agent id/i).first();
  const ask = page.getByRole("button", { name: /^ask$/i });
  await box.click();
  // Поле приходит с заготовленным значением: без очистки набор дописывается к нему и
  // получается несуществующий агент. Один раз уже отсняли пустой экран из-за этого.
  await box.fill("");
  await box.type("182", { delay: 180 });
  await ask.click();
  await page.waitForSelector("text=/farmed/i", { timeout: 60_000 });
  shot("verdict-182", since());
  await page.waitForTimeout(6000);

  // 3. Scroll through the evidence under the verdict at reading speed rather than in one jump.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 320);
    await page.waitForTimeout(900);
  }
  shot("evidence", since());
  await page.waitForTimeout(3000);

  // 4. The purchased corroboration: the half of the answer that cost money.
  const bought = page.locator("text=/bought|corroborat|nansen/i").first();
  if (await bought.count()) {
    await bought.scrollIntoViewIfNeeded();
    shot("corroboration", since());
    await page.waitForTimeout(5000);
  }

  // 5. Every rating on the chain as one dot, which is the only honest way to show 16 of 9,188.
  const map = page.locator("canvas, svg").first();
  if (await map.count()) {
    await map.scrollIntoViewIfNeeded();
    shot("farm-map", since());
    await page.waitForTimeout(6000);
    const b = await map.boundingBox();
    if (b) {
      // Hover a few points so the tooltips show the picture is data, not decoration.
      for (const [dx, dy] of [[0.3, 0.4], [0.55, 0.6], [0.75, 0.35]]) {
        await page.mouse.move(b.x + b.width * dx, b.y + b.height * dy);
        await page.waitForTimeout(1200);
      }
    }
  }

  // 6. The other end of the scale, so the demo is not one agent repeated.
  await page.keyboard.press("Home");
  await box.click();
  await box.fill("");
  await box.type("145", { delay: 180 });
  await ask.click();
  await page.waitForSelector("text=/single-source/i", { timeout: 60_000 });
  shot("verdict-145", since());
  await page.waitForTimeout(5000);

  // 7. The same answer a program gets, which is the part the track calls the primitive.
  await page.goto(`${BASE}api/agent/182`, { waitUntil: "networkidle" });
  shot("api", since());
  await page.waitForTimeout(5000);

  await context.close();
  await browser.close();
  writeFileSync(`${OUT}/shots.json`, JSON.stringify({ base: BASE, shots: SHOTS }, null, 2));
  console.log("снято, отметки кадров:");
  for (const s of SHOTS) console.log(`  ${String(s.at).padStart(3)} c  ${s.name}`);
}

main().catch((err) => {
  console.error("запись не удалась:", err.message);
  process.exit(1);
});
