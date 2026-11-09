const fs = require("fs"), zlib = require("zlib"), path = require("path");
const { CPU } = require("../src/core.js");
const dir = path.join(__dirname, "sst");
const meta = require("./sst/metadata.json").opcodes;
const LIMIT = Number(process.env.LIMIT || 2000);
const ORDER = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"];
const SEGS = ["es", "cs", "ss", "ds"];
const maskFor = name => {
  const [op, reg] = name.replace(".json.gz", "").split(".");
  const m = meta[op];
  const e = reg !== undefined && m && m.reg ? m.reg[reg] : m;
  return e && e["flags-mask"] !== undefined ? e["flags-mask"] : 0xFFFF;
};
let total = 0, bad = 0;
const files = fs.readdirSync(dir).filter(f => f.endsWith(".json.gz")).sort();
for (const f of files) {
  const tests = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, f)))).slice(0, LIMIT);
  const mask = maskFor(f);
  let pass = 0, first = null;
  for (const t of tests) {
    const c = new CPU();
    const I = t.initial.regs;
    ORDER.forEach((r, i) => { c.r[i] = I[r]; });
    SEGS.forEach((r, i) => { c.s[i] = I[r]; });
    c.ip = I.ip; c.flags = I.flags;
    for (const [a, v] of t.initial.ram) c.mem[a] = v;
    c.step();
    const exp = { ...I, ...t.final.regs };
    const diffs = [];
    ORDER.forEach((r, i) => { if (c.r[i] !== exp[r]) diffs.push(`${r} ${c.r[i].toString(16)} != ${exp[r].toString(16)}`); });
    SEGS.forEach((r, i) => { if (c.s[i] !== exp[r]) diffs.push(`${r} ${c.s[i].toString(16)} != ${exp[r].toString(16)}`); });
    if (c.ip !== exp.ip) diffs.push(`ip ${c.ip.toString(16)} != ${exp.ip.toString(16)}`);
    if ((c.flags & mask) !== (exp.flags & mask)) diffs.push(`flags ${(c.flags & mask).toString(2).padStart(16, "0")} != ${(exp.flags & mask).toString(2).padStart(16, "0")}`);
    for (const [a, v] of t.final.ram) if (c.mem[a] !== v) diffs.push(`ram[${a}] ${c.mem[a]} != ${v}`);
    if (!diffs.length) pass++;
    else if (!first) first = `${t.name}: ${diffs.slice(0, 3).join("; ")}`;
  }
  total += tests.length; bad += tests.length - pass;
  if (pass !== tests.length) console.log(`FAIL ${f.padEnd(14)} ${pass}/${tests.length}  ${first}`);
}
console.log(`\n${total - bad}/${total} passed across ${files.length} opcode files (limit ${LIMIT} per file)`);
