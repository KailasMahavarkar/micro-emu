const { chromium } = require("playwright");
const path = require("path"), fs = require("fs");
const out = process.argv[2];
const coverage = fs.readFileSync(path.join(__dirname, "coverage.asm"), "utf8");
const cases = [
  ["mem-read", "sum", null, "ADD AL, [SI]", ""],
  ["xchg-mem", "sort", null, "XCHG [SI+01h], AL", ""],
  ["dos-09", "hello", null, "INT 21h", ""],
  ["video-stosw", "video", null, "STOSW", ""],
  ["kbd-int21-08", "upper", null, "INT 21h@2", "q"],
  ["rep-movsb", null, coverage, "REP MOVSB", ""],
  ["call-far", null, coverage, "CALL FAR", ""],
  ["out-port", null, coverage, "OUT 61h, AL", ""],
  ["loopne", null, coverage, "LOOPNE", ""]
];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  await page.evaluate(() => localStorage.clear());
  for (const [name, exId, src, target, keysToPress] of cases) {
    const info = await page.evaluate(({ exId, src, target, keysToPress }) => {
      setView("panels");
      if (exId) chooseExample(exId); else setSource(src);
      for (const ch of keysToPress) m.pressKey(ch.charCodeAt(0), 0);
      const [want, nth] = target.split("@");
      let seen = 0, guard = 0;
      while (!m.done && guard++ < 3000) {
        const d = disasm(nextIns());
        if (d.startsWith(want) && ++seen >= Number(nth || 1)) break;
        m.step(true);
        if (m.waiting) break;
      }
      setView("board");
      ui.boardSpeed = 1;
      const B = capture();
      const before = disasm(nextIns());
      doStep();
      const plan = ui.lastPlan.plan.filter(h => !h.instant);
      const total = plan.reduce((t, h) => t + (h.from ? HOP_MS + HOP_GAP_MS : CAPTION_ONLY_MS), 0);
      const A = capture();
      const changed = Object.keys(A.regs).filter(r => A.regs[r] !== B.regs[r]).map(r => `${r} ${hex(B.regs[r])}->${hex(A.regs[r])}`);
      return { before, total, moves: plan.map(h => `${h.from || "-"}>${h.to || "-"} [${h.label || ""}] ${h.text}`), changed, flags: (B.flags ^ A.flags) ? `${hex(B.flags)}->${hex(A.flags)}` : "same" };
    }, { exId, src, target, keysToPress });
    console.log(`\n== ${name}: ${info.before}  (${info.moves.length} moves, ${info.total} ms)\n   changed: ${info.changed.join(", ") || "-"}; flags ${info.flags}`);
    info.moves.forEach((mv, i) => console.log(`   ${i + 1}. ${mv}`));
    await page.waitForTimeout(Math.round(info.total * 0.55));
    await page.screenshot({ path: `${out}/vv-${name}-mid.png` });
    console.log(`   mid caption: ${await page.textContent("#caption")}`);
    await page.waitForTimeout(Math.round(info.total * 0.45) + 600);
    await page.screenshot({ path: `${out}/vv-${name}-end.png` });
  }
  console.log("\njs errors:", errors.length ? errors : "none");
  await browser.close();
})();
