import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values } = parseArgs({ options: { out: { type: "string", default: "/tmp" }, url: { type: "string" } } });
const ORIGIN = "http://app.local";
const HTML = readFileSync(join(import.meta.dirname, "..", "dist", "index.html"), "utf8");
const VIEWPORT = { width: 1366, height: 768 };
const EXPECT: Record<string, { out: string; keys?: string }> = {
  hello: { out: "Hello from the 8086!" }, factorial: { out: "120" }, sum: { out: "Sum = 75" },
  sort: { out: "Sorted: 3 9 12 23 45 56 78" }, reverse: { out: "BAL 6808" }, video: { out: "8086 LAB IS ALIVE" },
  upper: { out: "ABC Z1", keys: "abc Z1\n" }, macros: { out: "Sum = 42", keys: "12\n30\n" }
};

const statusText = async (page: Page): Promise<string> => (await page.locator("footer").textContent()) ?? "";
const screenText = async (page: Page): Promise<string> => (await page.locator("[data-crt]").first().textContent()) ?? "";
const typeKeys = async (page: Page, text: string): Promise<void> => {
  for (const ch of text) { await page.keyboard.press(ch === "\n" ? "Enter" : ch === " " ? "Space" : ch); await page.waitForTimeout(30); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const errors: string[] = [];
page.on("pageerror", e => { errors.push(e.message); });
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
if (!values.url) await page.route(`${ORIGIN}/**`, route => route.fulfill({ contentType: "text/html", body: HTML }));
const base = values.url ?? `${ORIGIN}/`;
await page.goto(base);
await page.evaluate(() => { localStorage.clear(); });
await page.goto(base);
await page.locator("footer").waitFor();

let bad = 0;
const speedSelect = page.getByLabel("Run speed");
const defaultSpeed = await speedSelect.inputValue();
const backDisabled = await page.getByRole("button", { name: "Step back" }).isDisabled();
await page.getByLabel("Example program").selectOption("custom");
await page.getByLabel("Assembly source code").fill("org 100h\n    mov cx, 0FFFFh\nspin:\n    loop spin\n    ret\n");
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Run" }).click();
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "Pause" }).click();
const steps3s = Number(/Steps ([\d,]+)/.exec(await statusText(page))?.[1]?.replace(/,/g, "") ?? "0");
await page.getByRole("button", { name: "Reset" }).click();
const afterReset = await statusText(page);
process.stdout.write(`toolbar: default speed ${defaultSpeed}, step back disabled at start ${backDisabled}, ${steps3s} steps in 3 s, after reset "${afterReset.slice(0, 40)}"\n`);
if (defaultSpeed !== "medium" || !backDisabled || steps3s < 50 || steps3s > 66 || !afterReset.includes("Ready") || !afterReset.includes("Steps 0")) bad++;

const migrated = await browser.newPage({ viewport: VIEWPORT });
if (!values.url) await migrated.route(`${ORIGIN}/**`, route => route.fulfill({ contentType: "text/html", body: HTML }));
await migrated.goto(base);
await migrated.evaluate(() => { localStorage.setItem("lab8086.prefs", JSON.stringify({ state: { speed: "fast", lang: "en" }, version: 0 })); });
await migrated.goto(base);
await migrated.locator("footer").waitFor();
const migratedSpeed = await migrated.getByLabel("Run speed").inputValue();
process.stdout.write(`old saved 200 / sec opens as: ${migratedSpeed}\n`);
if (migratedSpeed !== "medium") bad++;
await migrated.close();
await page.bringToFront();

await page.getByLabel("Example program").selectOption("factorial");
await page.getByLabel("Example program").selectOption("hello");
await speedSelect.selectOption("max");

for (const [id, want] of Object.entries(EXPECT)) {
  await page.getByLabel("Example program").selectOption(id);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Run" }).click();
  if (want.keys) {
    await page.waitForFunction(() => document.querySelector("footer")?.textContent.includes("Waiting"), null, { timeout: 5000 });
    await typeKeys(page, want.keys);
  }
  await page.waitForFunction(() => /Finished|Stopped/.test(document.querySelector("footer")?.textContent ?? ""), null, { timeout: 8000 }).catch(() => undefined);
  const status = await statusText(page), screen = await screenText(page);
  const ok = screen.includes(want.out) && status.includes("Finished");
  if (!ok) bad++;
  process.stdout.write(`${ok ? "ok  " : "FAIL"} ${id.padEnd(10)} ${status.slice(0, 70)}\n`);
  if (id === "video") await page.screenshot({ path: `${values.out}/react-video.png` });
}

await page.getByLabel("Example program").selectOption("factorial");
await page.waitForTimeout(100);
await page.locator("body").click({ position: { x: 5, y: 5 } });
for (let i = 0; i < 7; i++) await page.keyboard.press("F10");
const afterSteps = /Steps \d+/.exec(await statusText(page))?.[0];
await page.keyboard.press("Shift+F10");
const afterBack = /Steps \d+/.exec(await statusText(page))?.[0];
process.stdout.write(`step/back: ${afterSteps ?? "-"} -> ${afterBack ?? "-"}\n`);
if (afterSteps !== "Steps 7" || afterBack !== "Steps 6") bad++;
await speedSelect.selectOption("slow");
await page.keyboard.press("F5");
await page.waitForTimeout(1100);
const f5Running = await statusText(page);
await page.keyboard.press("F5");
const f5Paused = await statusText(page);
process.stdout.write(`F5: "${f5Running.slice(0, 7)}" then "${f5Paused.slice(0, 6)}"\n`);
if (!f5Running.startsWith("Running") || !f5Paused.startsWith("Paused")) bad++;
await speedSelect.selectOption("max");
await page.screenshot({ path: `${values.out}/react-panels.png` });

await page.getByLabel("Assembly source code").fill("org 100h\n    mul 5\n    mov [bx], [si]\n    ret\n");
await page.waitForTimeout(500);
const english = (await page.getByRole("alert").locator("p").first().textContent()) ?? "";
await page.getByRole("button", { name: "Hinglish" }).click();
const hinglish = (await page.getByRole("alert").locator("p").first().textContent()) ?? "";
process.stdout.write(`error panel: ${english}\nhinglish: ${hinglish}\n`);
if (!english.includes("MUL") || english === hinglish) bad++;
await page.screenshot({ path: `${values.out}/react-error.png` });
await page.getByRole("button", { name: "English" }).click();

await page.getByLabel("Example program").selectOption("sum");
await page.waitForTimeout(100);
await page.getByRole("tab", { name: "Board" }).click();
await page.locator("body").click({ position: { x: 5, y: 5 } });
for (let i = 0; i < 2; i++) await page.keyboard.press("F10");
await page.waitForTimeout(150);
await page.keyboard.press("F10");
await page.waitForTimeout(1300);
const packets = await page.locator(".animate-travel").count();
await page.screenshot({ path: `${values.out}/react-board-mid.png` });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${values.out}/react-board-end.png` });
const caption = ((await page.locator("[data-caption]").textContent()) ?? "").trim();
process.stdout.write(`board: packets mid-hop ${packets}, caption: ${caption.slice(0, 110)}\n`);
if (!caption.includes("moves")) bad++;

await page.getByLabel("Example program").selectOption("custom");
await page.waitForTimeout(150);
await page.getByRole("button", { name: "Reset" }).click();
await page.getByLabel("Run speed").selectOption("every5s");
await page.getByRole("button", { name: "Run" }).click();
await page.waitForTimeout(1300);
const crawlPackets = await page.locator(".animate-travel").count();
await page.screenshot({ path: `${values.out}/react-board-every5s.png` });
await page.getByRole("button", { name: "Pause" }).click();
process.stdout.write(`board run at 1 every 5 sec: packet visible after 1.3 s: ${crawlPackets}\n`);
if (crawlPackets !== 1) bad++;
const BOARD_RATES = [["one", 1], ["slow", 2], ["normal", 10], ["medium", 20]] as const;
for (const [speed, perSecond] of BOARD_RATES) {
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByLabel("Run speed").selectOption(speed);
  await page.getByRole("button", { name: "Run" }).click();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Pause" }).click();
  const ran = Number(/Steps (\d+)/.exec(await statusText(page))?.[1] ?? "0") / 3;
  process.stdout.write(`board run at ${speed}: ${ran.toFixed(1)} instructions per second (target ${perSecond})\n`);
  if (Math.abs(ran - perSecond) > Math.max(0.5, perSecond * 0.05)) bad++;
}
await page.getByRole("button", { name: "Reset" }).click();
await page.getByLabel("Run speed").selectOption("normal");
await page.getByRole("button", { name: "Run" }).click();
await page.waitForTimeout(150);
const animatedRun = await page.locator(".animate-travel").count();
await page.getByRole("button", { name: "Pause" }).click();
const pausedSteps = /Steps \d+/.exec(await statusText(page))?.[0];
await page.waitForTimeout(1200);
const stillPaused = /Steps \d+/.exec(await statusText(page))?.[0] === pausedSteps && (await statusText(page)).includes("Paused");
process.stdout.write(`animated run: packets ${animatedRun}, pause holds at ${pausedSteps ?? "-"}: ${stillPaused}\n`);
if (!stillPaused) bad++;

await page.getByRole("tab", { name: "Panels" }).click();
await page.getByLabel("Run speed").selectOption("max");
await page.getByLabel("Example program").selectOption("sum");
await page.waitForTimeout(150);
await page.getByLabel("Breakpoint on line 19").click();
await page.getByRole("button", { name: "Run" }).click();
await page.waitForTimeout(400);
const atBreak = await statusText(page);
process.stdout.write(`breakpoint: ${atBreak.slice(0, 50)}\n`);
if (!atBreak.includes("Line 19") || !atBreak.includes("Paused")) bad++;
await page.getByLabel("Breakpoint on line 19").click();

await page.getByRole("button", { name: "Open full size screen" }).click();
const modalOpen = await page.getByRole("dialog").count();
await page.keyboard.press("Escape");
const modalClosed = await page.getByRole("dialog").count();
process.stdout.write(`modal: open ${modalOpen}, after Escape ${modalClosed}\n`);
if (modalOpen !== 1 || modalClosed !== 0) bad++;

const dark = await browser.newPage({ viewport: VIEWPORT, colorScheme: "dark" });
if (!values.url) await dark.route(`${ORIGIN}/**`, route => route.fulfill({ contentType: "text/html", body: HTML }));
await dark.goto(base);
await dark.bringToFront();
await dark.locator("footer").waitFor();
for (let i = 0; i < 6; i++) await dark.keyboard.press("F10");
const darkSteps = /Steps \d+/.exec(await statusText(dark))?.[0];
process.stdout.write(`dark mode F10 without a click: ${darkSteps ?? "-"}\n`);
if (darkSteps !== "Steps 6") bad++;
await dark.screenshot({ path: `${values.out}/react-dark.png` });

const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
process.stdout.write(`page overflow: ${overflow}, js errors: ${errors.length ? errors.join(" | ") : "none"}\n`);
await browser.close();
process.exitCode = bad || errors.length || overflow > 0 ? 1 : 0;
