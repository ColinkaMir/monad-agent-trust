#!/usr/bin/env node
/**
 * Makes both submission videos end to end: drives the live product in a real browser, lays the
 * captions over the page while it records, and joins the scenes into two MP4 files with ffmpeg.
 *
 * Everything on screen is the deployed product or a page that calls it: our site, our API in a
 * browser tab, and Sentinel, the other Metropolis project that embeds our check. The one shot
 * that is not a product page is the pitch's opening team card, and the pitch is allowed one.
 *
 * The wallet scene is real. It signs with a Dynamic embedded wallet that was created by an ordinary
 * email login, holds its own USDC, and spends it: one cent per question goes from that wallet to
 * Nansen. The profile directory holding that login lives outside the repository (VIDEO_PROFILE).
 *
 * Captions are the script's text verbatim (outputs/2026-10-01-metropolis-video-script-v3.md in
 * the operator's notes). Numbers in them are checked against the live API before anything records,
 * so a figure that moved overnight stops the run instead of shipping in a video.
 *
 *   VIDEO_PROFILE=/path/to/profile node tools/make-videos.mjs [demo|pitch|all]
 */
import { chromium } from "/home/solana/discord-reader/node_modules/playwright/index.mjs";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const SITE = "https://prooflines.org/monad/agent-trust/";
const API = "https://prooflines.org/monad/agent-trust/api";
const SENTINEL = "https://sentinel-monad.vercel.app/agents";
const PROFILE = process.env.VIDEO_PROFILE;
const OUT = resolve("build/video");
const W = 1536, H = 864; // recorded at this size, scaled to 1920x1080 at the end
const which = process.argv[2] ?? "all";
// The paid question must be about an address nobody has asked about: the service caches Nansen's
// answer for six hours and, rightly, does not re-show an earlier payment as this one. So the
// recording picks a rater of the 10182 ring that is not in the purchase ledger yet.
const asked = new Set(readFileSync("data/purchases.jsonl", "utf8").trim().split("\n")
  .map((l) => JSON.parse(l).about?.toLowerCase()));
const PAID_ASK = JSON.parse(readFileSync("data/indexed.json", "utf8")).feedback
  .filter((f) => f.agentId === 10182).map((f) => f.client.toLowerCase())
  .find((a) => !asked.has(a));
if (!PAID_ASK) throw new Error("no unasked ring rater left for the paid question");
const OWNER_182 = "0x97cd97cfe21799bacbf39d0a53469e5f82f30996";

if (!PROFILE) throw new Error("set VIDEO_PROFILE to the browser profile that holds the demo login");

// ---------------------------------------------------------------- numbers gate
const health = await fetch(`${API}/health`).then((r) => r.json());
const farm = await fetch(`${SITE}farm.json`).then((r) => r.json());
const a182 = await fetch(`${API}/agent/182`).then((r) => r.json());
const a10182 = await fetch(`${API}/agent/10182`).then((r) => r.json());
const spend = await fetch(`${API}/spend`).then((r) => r.json());
const expect = [
  ["registrations", health.totals.registrations, 10275],
  ["ratings", health.totals.feedbackEvents, 9288],
  ["rated agents", health.totals.ratedAgents, 93],
  ["february share", farm.februaryShare, 0.97],
  ["three-day share", farm.busiestThreeDayShare, 0.8651],
  ["182 raters", a182.raters, 7665],
  ["182 owner funded", a182.ownerFunded, 7665],
  ["median payout", farm.loop.monMedian, 11],
  ["seconds to rating", farm.loop.secondsToRating, 8],
  ["seconds to return", farm.loop.secondsToReturn, 4],
  ["green dots", farm.totals[farm.buckets.findIndex((b) => b.key === "independent")], 16],
  ["10182 verdict", a10182.verdict, "ring"],
  ["10182 funder paid", a10182.counterparties?.funderPaidRaters, 15],
];
const drift = expect.filter(([, got, want]) => got !== want);
if (drift.length) {
  for (const [k, got, want] of drift) console.log(`DRIFT ${k}: live ${got}, captions say ${want}`);
  throw new Error("captions no longer match the live numbers; update them before recording");
}
// The pitch quotes the bill, which moves with every purchase, including the one the demo makes.
// It is read here and written into the caption rather than frozen in the text.
const bill = { calls: spend.calls, delivered: spend.delivered, cents: Math.round(spend.usdcSpent * 100) };
// Shares are written from the live value too. A hand-typed "86.6%" survived three weeks after the
// data had moved to 86.51%, while the page itself said 86.5% on the same screen.
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const febPct = `${Math.round(farm.februaryShare * 100)}%`;
const threeDayPct = pct(farm.busiestThreeDayShare);
console.log("numbers match the live service; bill now", bill);

// Every caption, in one place, so the narration can be synthesised before anything records.
const CAP = {
  c1: "ERC-8004 lets any agent carry a reputation. Nothing in it says who paid for that reputation.",
  c2: "Agent 182 holds 7,665 ratings, the most on Monad. Every rater was funded by the agent's own owner.",
  c3: "Median payout 11 MON. Eight seconds from funding to rating, four more until the money comes back. 99.9% of the loops close inside thirty seconds.",
  c4: "What Monad cannot show is bought per call from Nansen over x402, paid on Monad. Eleven raters checked for eleven cents: all eleven trace back to the owner.",
  c5: "The same answer goes to programs, over HTTP and MCP. The page is the shop window.",
  c6: "27 September: 20 wallets rated 12 agents in under six hours, and no money moved. Every payment filter misses that, so the service measures who rates whom.",
  c7: "One address funded 8 of the 9 raters that ever received MON, all on 22 February. Nansen's counterparties show it paying 15 of 16, in five tokens across chains. The owner's own counterparties hold none of them.",
  c8: "Every rating on Monad, one dot each, coloured by where the money came from. Sixteen of 9,288 are green, and they come from two wallets.",
  c9: "Signed in with an email; Dynamic created the wallet. You sign one authorisation per question, worth a cent, valid for a day.",
  c10: "The agent spends them one at a time, straight to the seller. Asking about a wallet buys one Nansen answer with your cent.",
  c11: "Paid one cent from the visitor's own voucher, reconciled on chain. The money never passes through us.",
  c12: "The unused authorisation is revoked from the same wallet: one signature, then a transaction on USDC.",
  c13: "Revoke with cancelAuthorization, a transaction on USDC itself, and the rest die. Nothing depends on us honouring a request.",
  c14: "Sentinel, another Metropolis project, runs this check on its agent registration screen. Merged on 29 September, live in production.",
  c15: "Where there is no evidence, the answer says so instead of inventing a score. 93 of 10,275 agents have ever been rated.",
  c16: "ProofLines. One person, based in Czechia. We measure the Monad network from the outside: validator census, stake geography, latency, all published. Receipts points the same habit at agent reputation.",
  c17: `Agents are starting to choose each other by on-chain reputation. On Monad that reputation is 9,288 ratings: ${febPct} from one month, ${threeDayPct} from three days.`,
  c18: "One question: is this reputation backed by money the owner did not put there. The answer is words, not a score, over HTTP and MCP, so an agent can ask before it trusts a counterparty.",
  c19: `The free half comes from the chain. The half no chain shows is bought from Nansen per call, and the bill is public: ${bill.calls} calls, ${bill.delivered} answers, ${bill.cents} cents, reconciled against the chain, nothing paid for silence.`,
  c20: "Already running inside another Metropolis project. Next: more integrations like Sentinel's. Open source, GPL-3.0, registered as agent 10253 in the registry it measures.",
  c22: "Everything we have built for Monad is public at prooflines.org: live pages, machine-readable feeds and open-source code.",
  c23: "The same answer comes back as JSON, so any agent or app can ask before it trusts a counterparty.",
  c24: "Try it live at prooflines.org. The code is on GitHub: ColinkaMir/monad-agent-trust.",
};

// ---------------------------------------------------------------- narration
// A synthetic English voice reads each caption. The operator does not present live in English, and
// the voice says exactly what the caption says, so sound and text never disagree. Piper runs
// locally (no account, no key); PIPER_BIN and VIDEO_VOICE point at the binary and the voice model.
const PIPER = process.env.PIPER_BIN;
const VOICE = process.env.VIDEO_VOICE;
const NARRATE = Boolean(PIPER && VOICE);
const voiceDir = join(OUT, "voice");
const voiceFor = new Map(); // caption text -> { file, seconds }
function synthesise(text) {
  if (!NARRATE || voiceFor.has(text)) return;
  mkdirSync(voiceDir, { recursive: true });
  const file = join(voiceDir, `v${voiceFor.size + 1}.wav`);
  execFileSync(PIPER, ["-m", VOICE, "-f", file], { input: text, stdio: ["pipe", "ignore", "ignore"] });
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", file]).toString());
  voiceFor.set(text, { file, seconds });
}
for (const t of Object.values(CAP)) synthesise(t);
if (NARRATE) console.log(`narration: ${voiceFor.size} lines synthesised`);

// ---------------------------------------------------------------- page helpers
const CAPTION_CSS = `
  position: fixed; left: 50%; bottom: 44px; transform: translateX(-50%);
  max-width: 1300px; width: max-content; box-sizing: border-box;
  padding: 18px 30px; border-radius: 10px;
  background: rgba(9, 13, 24, 0.92); border: 1px solid rgba(255,255,255,0.18);
  color: #f3f2ec; font: 500 27px/1.38 Inter, "DejaVu Sans", system-ui, sans-serif;
  text-align: center; z-index: 2147483647; pointer-events: none;
  box-shadow: 0 10px 40px rgba(0,0,0,0.45);`;

// `top` moves the caption up for shots whose subject sits at the bottom of the page, where a
// bottom caption would cover the very thing it describes (the bill line did, in the first cut).
// `voice: false` shows a caption without speaking it, for a line that stays up across a cut and was
// already spoken. `block: false` starts the line and returns at once, for narration that plays
// over an action (the wallet prompts) instead of stopping it.
let current = null; // set by scene(): { opened, events, busyUntil }
async function caption(page, text, seconds, { top = false, voice = true, block = true } = {}) {
  // Never start a line over the end of the previous one.
  if (current && Date.now() < current.busyUntil) await page.waitForTimeout(current.busyUntil - Date.now());
  const css = top ? CAPTION_CSS.replace("bottom: 44px", "top: 44px") : CAPTION_CSS;
  await page.evaluate(({ text, css }) => {
    let el = document.getElementById("__cap");
    if (!el) { el = document.createElement("div"); el.id = "__cap"; document.body.appendChild(el); }
    el.setAttribute("style", css);
    el.textContent = text;
  }, { text, css });
  const v = voice && NARRATE ? voiceFor.get(text) : null;
  if (v && current) {
    current.events.push({ t: (Date.now() - current.opened) / 1000, file: v.file });
    current.busyUntil = Date.now() + (v.seconds + 0.5) * 1000;
  }
  const hold = Math.max(seconds, v ? v.seconds + 0.6 : 0);
  if (block) await page.waitForTimeout(hold * 1000);
}
const clearCaption = (page) => page.evaluate(() => document.getElementById("__cap")?.remove());

async function typeSlowly(page, selector, text) {
  const el = page.locator(selector).first();
  await el.click();
  await el.fill("");
  await el.type(text, { delay: 90 });
}

async function askOnSite(page, q, waitFor) {
  await typeSlowly(page, "input", q);
  await page.getByRole("button", { name: /^ask$/i }).click();
  await page.waitForFunction(waitFor, null, { timeout: 90_000 });
}

const scrollTo = (page, selector) =>
  page.locator(selector).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));

/// Dynamic's embedded wallet asks for each signature and transaction in its own modal.
async function approveWalletPrompts(page, doneWhen, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await doneWhen()) return;
    // Only a VISIBLE button counts: Dynamic leaves a closed modal's buttons in the DOM, and the
    // first version of this tried to click one of those and timed out.
    const prompt = page.locator("button:visible").filter({ hasText: /^\s*(sign|confirm|approve)\s*$/i }).first();
    if (await prompt.count()) {
      await page.waitForTimeout(900); // let the viewer see the prompt before it is approved
      await prompt.click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(700);
  }
  throw new Error("wallet prompts did not finish");
}

// ---------------------------------------------------------------- recording
const clips = [];
async function scene(name, fn) {
  const dir = join(OUT, "raw", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    colorScheme: "dark",
  });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const opened = Date.now();
  current = { opened, events: [], busyUntil: 0 };
  let start = 0;
  // Everything before `begin()` is page loading and is trimmed off: it is not part of the story.
  const begin = () => { start = (Date.now() - opened) / 1000; };
  await fn(page, begin);
  // Let the last line finish before the clip ends.
  if (Date.now() < current.busyUntil) await page.waitForTimeout(current.busyUntil - Date.now());
  const end = (Date.now() - opened) / 1000;
  await ctx.close();
  const file = readdirSync(dir).find((f) => f.endsWith(".webm"));
  clips.push({ name, file: join(dir, file), start, end, events: current.events });
  console.log(`  ${name}: ${(end - start).toFixed(1)} s`);
}

const DEMO = async () => {
  await scene("d1-question", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await caption(page, CAP.c1, 7);
  });

  await scene("d2-farm", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await askOnSite(page, "182", () => /farmed/.test(document.querySelector(".card .verdict")?.textContent ?? ""));
    await scrollTo(page, ".card");
    await page.waitForTimeout(1200);
    await caption(page, CAP.c2, 7);
    await caption(page, CAP.c3, 8);
  });

  await scene("d3-bought", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".bought-line");
    await scrollTo(page, ".bought-line");
    await page.waitForTimeout(1500);
    begin();
    await caption(page, CAP.c4, 8);
    await page.goto(`${API}/agent/182`, { waitUntil: "load" });
    await page.addStyleTag({ content: "pre{white-space:pre-wrap;font-size:15px;line-height:1.45;color:#ddd} body{background:#0b0f1a;padding:24px}" });
    await caption(page, CAP.c5, 6);
  });

  await scene("d4-ring", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await askOnSite(page, "10182", () => /ring/.test(document.querySelector(".card .verdict")?.textContent ?? ""));
    await scrollTo(page, ".card .why");
    await page.waitForTimeout(1200);
    await caption(page, CAP.c6, 9);
    await scrollTo(page, ".bought-line");
    await page.waitForTimeout(1000);
    await caption(page, CAP.c7, 11);
  });

  await scene("d5-map", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".farm");
    await scrollTo(page, ".farm");
    await page.waitForTimeout(2500);
    begin();
    await caption(page, CAP.c8, 8);
  });

  await scene("d6-wallet", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    const panel = page.locator(".fund").filter({ hasText: /YOUR DELEGATED QUESTIONS/i });
    await panel.waitFor({ timeout: 60_000 });
    await panel.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1500);
    begin();
    await caption(page, CAP.c9, 5);
    await panel.locator("input").fill("2");
    await panel.getByRole("button", { name: /^sign/i }).click();
    await approveWalletPrompts(page, async () => /2 ready of/.test(await panel.innerText()));
    await caption(page, CAP.c10, 4);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    await askOnSite(page, PAID_ASK, () => /delegated voucher/.test(document.querySelector(".card")?.textContent ?? ""));
    await scrollTo(page, ".card");
    await caption(page, CAP.c11, 6);
    await panel.evaluate((el) => el.scrollIntoView({ block: "center" }));
    // A caption stays until the next one replaces it, so the cancel step gets its own; otherwise
    // the "paid one cent" line sat over the revocation's transaction prompt.
    await caption(page, CAP.c12, 0.5, { block: false });
    await panel.getByRole("button", { name: /cancel the rest/i }).click();
    await approveWalletPrompts(page, async () => (await panel.locator(".fund-hint", { hasText: /cancelled on chain/ }).count()) > 0);
    await page.waitForTimeout(4500); // the panel re-reads the chain a few seconds after the cancel
    await caption(page, CAP.c13, 6);
  });

  await scene("d7-sentinel", async (page, begin) => {
    await page.goto(SENTINEL, { waitUntil: "networkidle" });
    await page.locator("text=ERC-8004 Reputation Provenance").scrollIntoViewIfNeeded();
    begin();
    await typeSlowly(page, "#agentAddress", OWNER_182);
    await page.getByText("Check reputation").click();
    await page.waitForSelector("text=/Agent #182: farmed/", { timeout: 60_000 });
    await page.locator("text=ERC-8004 Reputation Provenance").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await caption(page, CAP.c14, 9);
  });

  await scene("d8-refusal", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await askOnSite(page, "99999", () => /fewer than|covered minimum|not exist/i.test(document.body.innerText));
    await caption(page, CAP.c15, 8);
    await page.waitForTimeout(1500); // same breath at the end of the demo
  });
};

const PITCH = async () => {
  const avatar = readFileSync(process.env.VIDEO_AVATAR ?? join(PROFILE, "..", "avatar.png")).toString("base64");
  const card = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
    background:#0b1220;color:#f3f2ec;font-family:Inter,'DejaVu Sans',sans-serif">
    <div style="display:flex;align-items:center;gap:56px">
      <img src="data:image/png;base64,${avatar}" style="width:240px;height:240px;border-radius:18px">
      <div><div style="font-size:72px;font-weight:700;letter-spacing:-1px">ProofLines</div>
      <div style="font-size:30px;opacity:.8;margin-top:10px">one person · Czechia</div>
      <div style="font-size:24px;opacity:.6;margin-top:24px">prooflines.org</div></div></div></body></html>`;

  await scene("p1-team", async (page, begin) => {
    await page.setContent(card);
    begin();
    await caption(page, CAP.c16, 9);
    await page.goto("https://prooflines.org/monad/", { waitUntil: "networkidle" });
    await caption(page, CAP.c22, 5);
  });

  await scene("p2-problem", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await caption(page, CAP.c17, 9);
  });

  await scene("p3-built", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .why");
    await scrollTo(page, ".card");
    await page.waitForTimeout(1200);
    begin();
    await caption(page, CAP.c18, 8);
    await page.goto(`${API}/agent/182`, { waitUntil: "load" });
    await page.addStyleTag({ content: "pre{white-space:pre-wrap;font-size:15px;line-height:1.45;color:#ddd} body{background:#0b0f1a;padding:24px}" });
    await caption(page, CAP.c23, 4);
  });

  await scene("p4-bill", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".bill");
    await scrollTo(page, ".bill");
    await page.waitForTimeout(1500);
    begin();
    await page.locator(".bill").evaluate((el) => el.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(800);
    await caption(page, CAP.c19, 10, { top: true });
  });

  await scene("p5-next", async (page, begin) => {
    await page.goto(SENTINEL, { waitUntil: "networkidle" });
    // Run the check before the shot starts, so the pitch shows Sentinel answering, not an empty box.
    await page.locator("#agentAddress").fill(OWNER_182);
    await page.getByText("Check reputation").click();
    await page.waitForSelector("text=/Agent #182: farmed/", { timeout: 60_000 });
    await page.locator("text=ERC-8004 Reputation Provenance").evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(800);
    begin();
    await caption(page, CAP.c20, 9);
  });

  // Its own scene, so the page load between Sentinel and our site is trimmed rather than recorded
  // as four seconds of nothing.
  await scene("p6-close", async (page, begin) => {
    await page.goto(SITE, { waitUntil: "networkidle" });
    await page.waitForSelector(".card .verdict");
    await page.evaluate(() => window.scrollTo(0, 0));
    begin();
    await caption(page, CAP.c24, 5);
    // A breath after the last word: without it the cut landed on "trust" and swallowed it.
    await page.waitForTimeout(1500);
  });
};

// ---------------------------------------------------------------- assembly
function assemble(prefix, outName) {
  const parts = clips.filter((c) => c.name.startsWith(prefix));
  const list = [];
  for (const c of parts) {
    const seg = join(OUT, `${c.name}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", c.start.toFixed(2), "-to", c.end.toFixed(2), "-i", c.file,
      "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "19",
      "-an", seg]);
    list.push(`file '${seg}'`);
    // The encoded clip is what the viewer gets, and it is a little shorter than end-start (the
    // recorder does not flush its last frames). Narration offsets are built from these measured
    // lengths: built from end-start they drifted 1.6 s late by the end of the demo and the cut
    // swallowed the final word.
    c.actual = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
      "-of", "csv=p=0", seg]).toString());
  }
  const listFile = join(OUT, `${prefix}-list.txt`);
  writeFileSync(listFile, list.join("\n") + "\n");
  const out = join(OUT, outName);
  const silent = join(OUT, `${prefix}-silent.mp4`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy",
    "-movflags", "+faststart", silent]);
  // Narration: every spoken line placed at the moment its caption appeared, on the joined
  // timeline (each clip's own offset, minus what was trimmed off its head).
  let offset = 0;
  const lines = [];
  for (const c of parts) {
    for (const e of c.events ?? []) {
      if (e.t >= c.start && e.t < c.end) lines.push({ file: e.file, at: offset + (e.t - c.start) });
    }
    offset += c.actual;
  }
  if (!lines.length) {
    renameSync(silent, out);
  } else {
    const inputs = lines.flatMap((l) => ["-i", l.file]);
    const delays = lines.map((l, i) => `[${i + 1}:a]adelay=${Math.round(l.at * 1000)}:all=1[a${i}]`);
    const mix = `${lines.map((_, i) => `[a${i}]`).join("")}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,`
      + "aresample=48000,volume=0.85,alimiter=limit=0.89:level=false,apad[aout]";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, ...inputs,
      "-filter_complex", [...delays, mix].join(";"),
      "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest",
      "-movflags", "+faststart", out]);
    rmSync(silent);
    console.log(`  narration: ${lines.length} lines mixed at ${lines.map((l) => l.at.toFixed(1)).join(", ")} s`);
  }
  const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim();
  console.log(`${outName}: ${Number(dur).toFixed(1)} s`);
  return Number(dur);
}

mkdirSync(OUT, { recursive: true });
if (which === "demo" || which === "all") {
  console.log("recording demo");
  await DEMO();
  if (assemble("d", "receipts-demo.mp4") > 180) throw new Error("demo is over the 3 minute limit");
}
if (which === "pitch" || which === "all") {
  if (which === "all") {
    // The demo just bought an answer, so the bill the pitch quotes has moved: read it again and
    // re-voice that one line, or the caption says 48 calls over a page that says 49.
    const s2 = await fetch(`${API}/spend`).then((r) => r.json());
    const fresh = CAP.c19.replace(`${bill.calls} calls, ${bill.delivered} answers, ${bill.cents} cents`,
      `${s2.calls} calls, ${s2.delivered} answers, ${Math.round(s2.usdcSpent * 100)} cents`);
    if (fresh !== CAP.c19) { CAP.c19 = fresh; synthesise(fresh); console.log("bill re-read after the demo"); }
  }
  console.log("recording pitch");
  await PITCH();
  if (assemble("p", "receipts-pitch.mp4") > 120) throw new Error("pitch is over the 2 minute limit");
}
