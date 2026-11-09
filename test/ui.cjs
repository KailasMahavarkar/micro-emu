const { chromium } = require("playwright");
const path = require("path");
const url = "file://" + path.resolve(__dirname, "../index.html");
const out = process.argv[2] || "/tmp";
const expect = {
  hello: "Hello from the 8086!", factorial: "120", sum: "Sum = 75", sort: "Sorted: 3 9 12 23 45 56 78",
  reverse: "BAL 6808", video: "8086 LAB IS ALIVE", upper: "ABC Z1", macros: "Sum = 42"
};
const keys = { upper: "abc Z1\n", macros: "12\n30\n" };
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.selectOption("#speed", "max");
  let bad = 0;
  for (const [id, want] of Object.entries(expect)) {
    await page.selectOption("#examples", id);
    await page.waitForTimeout(150);
    await page.click("#run");
    if (keys[id]) {
      await page.waitForFunction(() => document.getElementById("status").textContent.includes("Waiting"), null, { timeout: 5000 });
      for (const ch of keys[id]) { await page.keyboard.press(ch === "\n" ? "Enter" : ch === " " ? "Space" : ch); await page.waitForTimeout(30); }
    }
    await page.waitForFunction(() => /Finished|Stopped/.test(document.getElementById("status").textContent), null, { timeout: 8000 }).catch(() => {});
    const status = await page.textContent("#status"), screen = await page.textContent("#crt");
    const ok = screen.includes(want) && status.includes("Finished");
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${id.padEnd(10)} ${status.slice(0, 60)}`);
    if (id === "video") await page.screenshot({ path: `${out}/ui-video.png` });
  }
  await page.selectOption("#examples", "factorial");
  await page.waitForTimeout(100);
  for (let i = 0; i < 7; i++) await page.keyboard.press("F10");
  const afterSteps = await page.textContent("#status");
  await page.keyboard.press("Shift+F10");
  const afterBack = await page.textContent("#status");
  console.log("step/back:", afterSteps.match(/Steps \d+/)?.[0], "->", afterBack.match(/Steps \d+/)?.[0]);
  await page.screenshot({ path: `${out}/ui-panels.png` });
  await page.fill("#src", "org 100h\n    mul 5\n    mov [bx], [si]\n    ret\n");
  await page.waitForTimeout(500);
  console.log("error panel:", (await page.textContent("#problemWhat")).trim());
  await page.click('[data-lang="hi"]');
  console.log("hinglish:", (await page.textContent("#problemWhat")).trim());
  await page.screenshot({ path: `${out}/ui-error.png` });
  await page.click('[data-lang="en"]');
  await page.selectOption("#examples", "sum");
  await page.waitForTimeout(100);
  await page.click('.viewbar [data-view="board"]');
  for (let i = 0; i < 2; i++) await page.keyboard.press("F10");
  await page.waitForTimeout(150);
  await page.keyboard.press("F10");
  await page.waitForTimeout(1300);
  await page.screenshot({ path: `${out}/ui-board-mid.png` });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/ui-board-end.png` });
  console.log("board caption:", (await page.textContent("#caption")).trim().slice(0, 120));
  const fit = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log("page overflow:", fit, "js errors:", errors.length ? errors : "none");
  await browser.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
