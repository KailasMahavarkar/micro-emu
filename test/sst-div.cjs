const fs = require("fs"), zlib = require("zlib");
const { CPU } = require("../src/core.js");
const ORDER = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"], SEGS = ["es", "cs", "ss", "ds"];
for (const f of ["F6.6", "F6.7", "F7.6", "F7.7", "D4"]) {
  const tests = JSON.parse(zlib.gunzipSync(fs.readFileSync(`test/sst/${f}.json.gz`))).slice(0, 500);
  let regFail = 0, flagWordOnly = 0, other = 0, sample = null;
  for (const t of tests) {
    const c = new CPU(), I = t.initial.regs;
    ORDER.forEach((r, i) => { c.r[i] = I[r]; }); SEGS.forEach((r, i) => { c.s[i] = I[r]; });
    c.ip = I.ip; c.flags = I.flags;
    for (const [a, v] of t.initial.ram) c.mem[a] = v;
    c.step();
    const exp = { ...I, ...t.final.regs };
    const regBad = ORDER.some((r, i) => c.r[i] !== exp[r]) || SEGS.some((r, i) => c.s[i] !== exp[r]) || c.ip !== exp.ip;
    const ramBad = t.final.ram.filter(([a, v]) => c.mem[a] !== v).map(([a]) => a);
    const flagAddr = ((exp.ss << 4) + exp.sp + 4) & 0xFFFFF;
    if (regBad) { regFail++; if (!sample) sample = t.name; }
    else if (ramBad.length && ramBad.every(a => a === flagAddr || a === flagAddr + 1)) flagWordOnly++;
    else if (ramBad.length) other++;
  }
  console.log(`${f}: register/IP mismatches=${regFail} pushed-flags-word-only=${flagWordOnly} other-ram=${other} ${sample ? "e.g. " + sample : ""}`);
}
