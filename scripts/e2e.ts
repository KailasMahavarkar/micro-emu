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
await page.getByLabel("Run speed").selectOption("max");

let bad = 0;
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

await page.getByLabel("Run speed").selectOption("normal");
await page.getByRole("button", { name: "Run" }).click();
await page.waitForTimeout(1500);
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
