const fs = require("fs"), os = require("os"), path = require("path"), { execFileSync } = require("child_process");
const { assemble, CPU, disasm } = require("../src/core.js");
const R16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"], R8 = ["al", "cl", "dl", "bl", "ah", "ch", "dh", "bh"];
const BASES = ["bx", "bp", "si", "di", "bx+si", "bx+di", "bp+si", "bp+di"];
const DISPS = ["", "+5", "-7", "+127", "-128", "+300", "-300", "+1234h"];
const SEGO = ["", "", "", "es:", "cs:", "ss:", "ds:"];
let seed = Number(process.env.SEED || 12345);
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = a => a[rnd(a.length)];
const mem = () => { const b = pick(BASES); const d = b === "bp" && !rnd(3) ? "" : pick(DISPS); return `${pick(SEGO)}[${b}${d}]`; };
const memAny = () => (rnd(6) ? mem() : `${pick(SEGO)}[${pick(["0", "10h", "1234h", "0FFFEh"])}]`);
const IMM8 = ["0", "1", "5", "127", "128", "255", "-1", "-128", "0Fh", "'A'"];
const IMM16 = ["0", "5", "-5", "127", "128", "-129", "300", "1000h", "0FFFFh", "-32768", "7FFFh"];
const lines = [];
for (let i = 0; i < 40; i++) {
  const r16 = pick(R16), r8 = pick(R8), q16 = pick(R16), q8 = pick(R8), m = memAny();
  lines.push(`mov ${r16}, ${q16}`, `mov ${r8}, ${q8}`, `mov ${r16}, ${m}`, `mov ${m}, ${r8}`, `mov ${r8}, ${pick(IMM8)}`, `mov ${r16}, ${pick(IMM16)}`,
    `mov byte ptr ${memAny()}, ${pick(IMM8)}`, `mov word ptr ${memAny()}, ${pick(IMM16)}`, `mov ${pick(["ds", "es", "ss"])}, ${q16}`, `mov ${pick(["ds", "es", "ss"])}, ${mem()}`,
    `mov ${r16}, ${pick(["cs", "ds", "es", "ss"])}`, `mov ${mem()}, ${pick(["cs", "ds", "es", "ss"])}`);
  for (const op of ["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp"])
    lines.push(`${op} ${r16}, ${q16}`, `${op} ${r8}, ${q8}`, `${op} ${r16}, ${mem()}`, `${op} ${mem()}, ${r8}`, `${op} ${r8}, ${pick(IMM8)}`, `${op} ${r16}, ${pick(IMM16)}`,
      `${op} byte ptr ${mem()}, ${pick(IMM8)}`, `${op} word ptr ${mem()}, ${pick(IMM16)}`, `${op} al, ${pick(IMM8)}`, `${op} ax, ${pick(IMM16)}`);
  lines.push(`test ${r16}, ${q16}`, `test ${mem()}, ${r8}`, `test ${r8}, ${pick(IMM8)}`, `test word ptr ${mem()}, ${pick(IMM16)}`, `test al, ${pick(IMM8)}`, `test ax, ${pick(IMM16)}`,
    `xchg ${r16}, ${q16}`, `xchg ${r8}, ${q8}`, `xchg ${mem()}, ${r16}`, `inc ${r16}`, `dec ${r8}`, `inc byte ptr ${mem()}`, `dec word ptr ${mem()}`);
  for (const op of ["not", "neg", "mul", "imul", "div", "idiv"]) lines.push(`${op} ${r16}`, `${op} ${r8}`, `${op} byte ptr ${mem()}`, `${op} word ptr ${mem()}`);
  for (const op of ["rol", "ror", "rcl", "rcr", "shl", "sal", "shr", "sar"]) lines.push(`${op} ${r16}, 1`, `${op} ${r8}, cl`, `${op} byte ptr ${mem()}, 1`, `${op} word ptr ${mem()}, cl`);
  lines.push(`push ${r16}`, `pop ${q16}`, `push ${pick(["cs", "ds", "es", "ss"])}`, `pop ${pick(["ds", "es", "ss"])}`, `push word ptr ${mem()}`, `pop word ptr ${mem()}`,
    `lea ${r16}, ${mem()}`, `lds ${r16}, ${mem()}`, `les ${r16}, ${mem()}`, `int ${pick(["21h", "10h", "16h", "0", "3", "0FFh"])}`,
    `in ${pick(["al", "ax"])}, ${pick(["0", "60h", "0FFh", "dx"])}`, `out ${pick(["0", "61h", "0FFh", "dx"])}, ${pick(["al", "ax"])}`,
    `ret ${pick(["2", "4", "100h"])}`, `retf ${pick(["2", "6"])}`, `call ${q16}`, `jmp ${q16}`, `call word ptr ${mem()}`, `jmp word ptr ${mem()}`, `call dword ptr ${mem()}`, `jmp dword ptr ${mem()}`,
    `${pick(["rep", "repe", "repne", ""])} ${pick(["movsb", "movsw", "cmpsb", "cmpsw", "stosb", "stosw", "lodsb", "lodsw", "scasb", "scasw"])}`.trim());
}
lines.push("nop", "hlt", "clc", "stc", "cmc", "cld", "std", "cli", "sti", "cbw", "cwd", "pushf", "popf", "sahf", "lahf", "xlat", "aaa", "aas", "daa", "das", "aam", "aad", "wait", "into", "iret", "ret", "retf");
const uniq = [...new Set(lines)];
const items = [];
let asmErrors = 0;
for (const src of uniq) {
  const p = assemble(`org 100h\n${src}\n`);
  if (p.errors.length) { asmErrors++; console.log("ASM ERROR", src, JSON.stringify(p.errors[0])); continue; }
  items.push({ src, bytes: [...p.segments[0].bytes.slice(0x100)] });
}
const bin = path.join(os.tmpdir(), `xcheck-${process.pid}.bin`);
const all = items.flatMap(i => i.bytes);
fs.writeFileSync(bin, Buffer.from(all));
const dump = execFileSync("objdump", ["-D", "-b", "binary", "-m", "i8086", "-M", "intel", bin], { encoding: "utf8", maxBuffer: 1 << 26 });
fs.unlinkSync(bin);
const obj = new Map();
for (const l of dump.split("\n")) {
  const mm = /^\s*([0-9a-f]+):\t((?:[0-9a-f]{2} )+)\s*\t(.*)$/.exec(l);
  if (mm) obj.set(parseInt(mm[1], 16), { len: mm[2].trim().split(" ").length, text: mm[3].trim() });
}
const num = s => s.replace(/\b0x([0-9a-f]+)\b/gi, (_, h) => String(parseInt(h, 16))).replace(/\b([0-9][0-9a-f]*)h\b/gi, (_, h) => String(parseInt(h, 16)))
  .replace(/'(.)'/g, (_, c) => String(c.charCodeAt(0)));
const canon = (text, isObj) => {
  let t = text.replace(/'(.)'/g, (_, c) => String(c.charCodeAt(0))).toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/^notrack /, "").replace(/^fwait$/, "wait");
  t = t.replace(/^(rep[a-z]*) (movs|cmps|stos|lods|scas) (?:a[lx],)?(byte|word) ptr .*$/, (_, r, op, sz) => `${r} ${op}${sz[0]}`);
  t = t.replace(/^(movs|cmps|stos|lods|scas) (?:a[lx],)?(byte|word) ptr .*$/, (_, op, sz) => `${op}${sz[0]}`);
  t = t.replace(/^(rep|repz|repe) (cmps|scas)/, "repe $2").replace(/^repnz /, "repne ").replace(/^(repz|repe) (movs|stos|lods)/, "rep $2");
  t = t.replace(/^xlat .*$/, "xlat").replace(/^int3$/, "int 3").replace(/^xchg ax\s*,\s*ax$/, "nop");
  t = t.replace(/^sal /, "shl ");
  t = t.replace(/\b(cs|ds|es|ss):(0x[0-9a-f]+)/g, "$1:[$2]");
  t = t.replace(/\bds:\[(?!bp)/g, "[").replace(/\bss:\[bp/g, "[bp");
  if (/^lea /.test(t)) t = t.replace(/\b(cs|ds|es|ss):\[/g, "[");
  const byteCtx = /\b(byte ptr|al|ah|bl|bh|cl|ch|dl|dh)\b/.test(t) && !/^(shl|shr|sar|rol|ror|rcl|rcr|sal|in|out)\b/.test(t);
  t = t.replace(/\b(cs|ds|es|ss):(0x[0-9a-f]+)/g, "$1:[$2]");
  t = num(t);
  t = t.replace(/\b(near|far) /g, "");
  const parts = t.match(/^(\S+)\s*(.*)$/), mn = parts[1];
  let ops = parts[2] ? parts[2].split(/\s*,\s*/) : [];
  const hasReg = ops.some(o => /^(a[xlh]|b[xlhp]|c[xlhs]|d[xlhis]|s[ip]|[de]s|ss)$/.test(o));
  ops = ops.map(o => {
    let s = o.replace(/^(byte|word|dword) ptr /, w => (hasReg || mn === "lea" || mn === "lds" || mn === "les" ? "" : w));
    s = s.replace(/\[(.*)\]/, (_, inner) => `[${inner.replace(/\+-/g, "-").replace(/\+0$/, "")}]`);
    s = s.replace(/^ds:\[/, "[").replace(/^ss:\[(bp[^\]]*)\]/, "[$1]");
    s = s.replace(/\[(\d+)\]/, (_, d) => `[${Number(d) & 0xFFFF}]`);
    const mod = byteCtx ? 256 : 65536;
    if (/^-?\d+$/.test(s)) s = String(((Number(s) % mod) + mod) % mod);
    return s;
  });
  if (mn === "xchg") ops.sort();
  if (["ret", "retf", "int"].includes(mn) || /^(in|out)$/.test(mn)) ops = ops.map(o => (/^\d+$/.test(o) ? String(Number(o)) : o));
  if (mn === "aam" || mn === "aad") ops = [];
  if (/^(shl|shr|sar|rol|ror|rcl|rcr)$/.test(mn) && ops[1] === "1") ops[1] = "1";
  return `${mn} ${ops.join(",")}`.trim();
};
const srcCanon = s => {
  let t = s.replace(/'(.)'/g, (_, c) => String(c.charCodeAt(0))).toLowerCase().replace(/\s+/g, " ").trim().replace(/^repz /, "repe ").replace(/^repnz /, "repne ").replace(/^sal /, "shl ");
  const mm = t.match(/^(\S+)\s*(.*)$/), mn = mm[1];
  const ops = mm[2] ? mm[2].split(/\s*,\s*/) : [];
  const fixMem = o => o.replace(/\[([^\]]*)\]/, (_, inner) => `[${inner}]`).replace(/^(byte|word|dword) ptr /, "$1 ptr ");
  return canon(`${mn} ${ops.map(fixMem).join(",")}`.replace(/(es|cs|ss|ds):\[/g, "$1:["), false).replace(/\[(\w+)\+(\d+)\]/g, "[$1+$2]");
};
let off = 0, bad = 0, checked = 0;
const show = [];
for (const it of items) {
  const o = obj.get(off);
  const cpu = new CPU(); cpu.s[1] = 0; cpu.ip = 0; it.bytes.forEach((b, i) => { cpu.mem[i] = b; });
  const ins = cpu.decode(), mine = disasm(ins);
  const problems = [];
  if (!o) problems.push("objdump has no instruction at this offset");
  else {
    if (o.len !== it.bytes.length) problems.push(`objdump length ${o.len} vs ${it.bytes.length}`);
    if (ins.len !== it.bytes.length) problems.push(`decoder length ${ins.len}`);
    const notrackQuirk = /^notrack /.test(o.text) && canon(o.text, true) === canon(mine, false).replace("ds:[bp", "[bp");
    if (!notrackQuirk && canon(o.text, true) !== canon(mine, false)) problems.push(`objdump "${canon(o.text, true)}" vs decoder "${canon(mine, false)}"`);
    if (srcCanon(it.src) !== canon(mine, false)) problems.push(`source "${srcCanon(it.src)}" vs decoder "${canon(mine, false)}"`);
  }
  checked++;
  if (problems.length) { bad++; if (show.length < 40) show.push(`${it.src.padEnd(34)} ${it.bytes.map(b => b.toString(16).padStart(2, "0")).join(" ").padEnd(20)} ${problems.join(" | ")}`); }
  off += it.bytes.length;
}
console.log(show.join("\n"));
console.log(`\n${checked - bad}/${checked} instructions agree three ways (source, our decoder, objdump); ${asmErrors} assembler errors on valid input`);
