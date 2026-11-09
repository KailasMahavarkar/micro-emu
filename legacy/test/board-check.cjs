const { chromium } = require("playwright");
const path = require("path");
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("file://" + path.resolve(__dirname, "../index.html"));
  const coverage = require("fs").readFileSync(path.join(__dirname, "coverage.asm"), "utf8");
  const result = await page.evaluate(coverageSrc => {
    const out = { instructions: 0, hops: 0, problems: [], byMn: {} };
    const NODES = new Set([...Object.keys(REG_POS), ...Object.keys(UNITS)]);
    for (const ex of [...EXAMPLES, { id: "coverage", src: coverageSrc }]) {
      const prog = assemble(ex.src);
      m.load(prog);
      ui.prog = prog;
      for (const ch of "12\r30\rabc\r") m.pressKey(ch.charCodeAt(0), ch === "\r" ? 0x1C : 0);
      let guard = 0;
      while (!m.done && guard++ < 5000) {
        const B = capture();
        const ins = m.step(true);
        if (!ins || m.waiting) break;
        const A = capture();
        const plan = buildPlan(ins, B, A);
        const hops = plan.filter(h => h.from);
        out.instructions++; out.hops += hops.length;
        out.byMn[ins.mn] = (out.byMn[ins.mn] || 0) + 1;
        const where = `${ex.id} step ${m.steps} ${disasm(ins)}`;
        for (const h of hops) {
          if (!NODES.has(h.from) || !NODES.has(h.to)) out.problems.push(`${where}: unknown node ${h.from}->${h.to}`);
          const pts = route(h.from, h.to);
          if (!pts.length || pts.some(p => p.some(Number.isNaN))) out.problems.push(`${where}: bad route ${h.from}->${h.to}`);
          if (!h.text) out.problems.push(`${where}: hop without caption`);
        }
        for (const r of Object.keys(A.regs)) {
          if (r === "IP" || A.regs[r] === B.regs[r]) continue;
          const into = hops.filter(h => h.to === r);
          if (!into.length) out.problems.push(`${where}: ${r} changed ${hex(B.regs[r])}->${hex(A.regs[r])} but no packet goes to ${r}`);
          else {
            const last = into[into.length - 1].label.replace(/^'(.)'$/, (_, c) => hex(c.charCodeAt(0), 2)).replace(/^([0-9A-F]{2,4})h$/, "$1");
            const full = hex(A.regs[r]), low = hex(A.regs[r] & 0xFF, 2), high = hex(A.regs[r] >> 8, 2);
            if (![full, low, high].includes(last) && /^[0-9A-F]{2,4}$/.test(last)) out.problems.push(`${where}: last packet into ${r} says ${last}, register is ${full}`);
          }
        }
        if (A.flags !== B.flags && !hops.some(h => h.to === "FLAGS")) out.problems.push(`${where}: flags changed but no packet goes to FLAGS`);
        const rec = m.lastRecord, writes = new Set();
        for (let i = 0; i < rec.log.length; i += 2) writes.add(rec.log[i]);
        const ram = [...writes].some(a => a >= 0x500 && !(a >= VIDEO_LIN && a < VIDEO_LIN + 4000));
        const video = [...writes].some(a => a >= VIDEO_LIN && a < VIDEO_LIN + 4000);
        if (ram && !hops.some(h => h.to === "MEM")) out.problems.push(`${where}: wrote RAM but no packet goes to MEM`);
        const busAddrs = new Set(hops.filter(h => h.from === "SIGMA").map(h => parseInt(h.label, 16)));
        const repeated = ins.rep && ["MOVS", "STOS"].includes(ins.mn);
        for (const a of writes) {
          if (a < 0x500 || repeated || (ins.mn === "INT")) continue;
          if (!busAddrs.has(a) && !busAddrs.has(a - 1)) out.problems.push(`${where}: wrote ${hex(a, 5)} but the address bus never shows it`);
        }
        if (video && !hops.some(h => h.to === "SCREEN")) out.problems.push(`${where}: wrote video RAM but no packet goes to SCREEN`);
        const fetch = hops.slice(0, 4).map(h => `${h.from}>${h.to}`).join(" ");
        if (ui.showFetch && fetch !== "IP>SIGMA SIGMA>MEM MEM>QUEUE QUEUE>CU") out.problems.push(`${where}: fetch sequence is ${fetch}`);
      }
      if (!m.done) out.problems.push(`${ex.id}: did not finish (${m.waiting ? "waiting" : "guard"})`);
    }
    return out;
  }, coverage);
  console.log(`checked ${result.instructions} executed instructions, ${result.hops} packet moves, mnemonics: ${Object.keys(result.byMn).length}`);
  console.log(Object.entries(result.byMn).map(([k, v]) => `${k}:${v}`).join(" "));
  console.log(result.problems.length ? result.problems.slice(0, 40).join("\n") : "no problems");
  console.log("js errors:", errors.length ? errors : "none");
  await browser.close();
})();
