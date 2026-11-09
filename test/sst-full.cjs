const fs = require("fs"), zlib = require("zlib"), path = require("path"), { execFileSync } = require("child_process");
const { CPU } = require("../src/core.js");
const dir = path.join(__dirname, "sst"), meta = require("./sst/metadata.json").opcodes;
const ORDER = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"], SEGS = ["es", "cs", "ss", "ds"];
const names = process.env.FILES ? process.env.FILES.split(",") : fs.readFileSync(path.join(__dirname, "sst-files.txt"), "utf8").trim().split(/\s+/);
const info = name => {
  const [op, reg] = name.replace(".json.gz", "").split(".");
  const m = meta[op], e = reg !== undefined && m && m.reg ? m.reg[reg] : m;
  return { status: e ? e.status : "?", mask: e && e["flags-mask"] !== undefined ? e["flags-mask"] : 0xFFFF };
};
const summary = { files: 0, tests: 0, pass: 0, regFail: 0, flagFail: 0, pushedFlagsOnly: 0, ramFail: 0 };
const failures = [];
for (const name of names) {
  const file = path.join(dir, name);
  let fresh = false;
  if (!fs.existsSync(file)) {
    execFileSync("curl", ["-sSL", "--max-time", "120", "-o", file, `https://raw.githubusercontent.com/SingleStepTests/8088/main/v2/${name}`]);
    fresh = true;
  }
  const tests = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const { status, mask } = info(name);
  const c = { tests: tests.length, pass: 0, reg: 0, flags: 0, pushed: 0, ram: 0, first: null };
  for (const t of tests) {
    const cpu = new CPU(), I = t.initial.regs;
    ORDER.forEach((r, i) => { cpu.r[i] = I[r]; }); SEGS.forEach((r, i) => { cpu.s[i] = I[r]; });
    cpu.ip = I.ip; cpu.flags = I.flags;
    for (const [a, v] of t.initial.ram) cpu.mem[a] = v;
    cpu.step();
    const exp = { ...I, ...t.final.regs };
    const regBad = ORDER.some((r, i) => cpu.r[i] !== exp[r]) || SEGS.some((r, i) => cpu.s[i] !== exp[r]) || cpu.ip !== exp.ip;
    const flagBad = (cpu.flags & mask) !== (exp.flags & mask);
    const ramBad = t.final.ram.filter(([a, v]) => cpu.mem[a] !== v).map(([a]) => a);
    const fl = ((exp.ss << 4) + ((exp.sp + 4) & 0xFFFF)) & 0xFFFFF;
    if (!regBad && !flagBad && !ramBad.length) { c.pass++; continue; }
    if (regBad) c.reg++;
    else if (flagBad) c.flags++;
    const fl2 = ((exp.ss << 4) + ((exp.sp + 5) & 0xFFFF)) & 0xFFFFF;
    const pushedOnly = ramBad.every(a => a === fl || a === fl2);
    if (regBad || flagBad) {}
    else if (pushedOnly) c.pushed++;
    else c.ram++;
    if (!c.first && (regBad || flagBad || !pushedOnly)) c.first = `${t.name} [${regBad ? "regs" : flagBad ? "flags" : "ram"}]`;
  }
  if (fresh) fs.unlinkSync(file);
  summary.files++; summary.tests += c.tests; summary.pass += c.pass;
  summary.regFail += c.reg; summary.flagFail += c.flags; summary.pushedFlagsOnly += c.pushed; summary.ramFail += c.ram;
  if (c.pass !== c.tests) failures.push(`${name.padEnd(14)} ${status.padEnd(12)} ${c.pass}/${c.tests} regs=${c.reg} flags=${c.flags} pushedFlagsOnly=${c.pushed} ram=${c.ram} ${c.first || ""}`);
  process.stdout.write(`file ${summary.files}/${names.length} ${name}\n`);
}
console.log("\nFAILURES:\n" + failures.join("\n"));
console.log("\nSUMMARY " + JSON.stringify(summary));
