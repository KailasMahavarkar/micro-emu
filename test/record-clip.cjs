const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const outDir = path.resolve(__dirname, "../media/raw");
const W = 1366, H = 768;
(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: outDir, size: { width: W, height: H } } });
  const t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto("https://8086-emu.pages.dev/", { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  const planMs = await page.evaluate(() => {
    setView("panels");
    chooseExample("factorial");
    for (let i = 0; i < 28; i++) m.step(true);
    ui.boardSpeed = 1.5;
    setView("board");
    return 0;
  });
  void planMs;
  await page.waitForTimeout(400);
  const tStart = Date.now();
  const stepAndWait = async () => {
    const ms = await page.evaluate(() => {
      doStep();
      return ui.lastPlan.plan.filter(h => !h.instant).reduce((t, h) => t + (h.from ? (HOP_MS + HOP_GAP_MS) : CAPTION_ONLY_MS), 0) / ui.boardSpeed;
    });
    await page.waitForTimeout(ms + 500);
  };
  await stepAndWait();
  await stepAndWait();
  await page.click('.viewbar [data-view="panels"]');
  await page.waitForTimeout(700);
  await page.selectOption("#examples", "video");
  await page.selectOption("#speed", "fast");
  await page.waitForTimeout(500);
  await page.click("#run");
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("Finished"), null, { timeout: 10000 });
  await page.waitForTimeout(1300);
  await page.click("#expandBtn");
  await page.evaluate(() => {
    const tag = document.createElement("div");
    tag.textContent = "8086-emu.pages.dev  ·  an 8086 emulator in your browser";
    tag.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99;background:#FFE45C;color:#1B2430;font:600 22px Geist,system-ui,sans-serif;padding:10px 22px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.45)";
    document.body.appendChild(tag);
  });
  await page.waitForTimeout(2600);
  const tEnd = Date.now();
  await ctx.close();
  await browser.close();
  const video = fs.readdirSync(outDir).find(f => f.endsWith(".webm"));
  fs.writeFileSync(path.join(outDir, "timing.json"), JSON.stringify({ video: path.join(outDir, video), start: (tStart - t0) / 1000, end: (tEnd - t0) / 1000 }));
  console.log(JSON.stringify({ video, start: (tStart - t0) / 1000, end: (tEnd - t0) / 1000 }));
})();
