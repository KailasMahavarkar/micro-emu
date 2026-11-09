import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Cpu, assemble, decode, disasm } from "../src/emulator/index.ts";

const { values } = parseArgs({ options: { seed: { type: "string", default: "12345" } } });
const ORIGIN = 0x100;
const ROUNDS = 40;
const R16 = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"], R8 = ["al", "cl", "dl", "bl", "ah", "ch", "dh", "bh"];
const BASES = ["bx", "bp", "si", "di", "bx+si", "bx+di", "bp+si", "bp+di"];
const DISPS = ["", "+5", "-7", "+127", "-128", "+300", "-300", "+1234h"];
const SEGO = ["", "", "", "es:", "cs:", "ss:", "ds:"];
const IMM8 = ["0", "1", "5", "127", "128", "255", "-1", "-128", "0Fh", "'A'"];
const IMM16 = ["0", "5", "-5", "127", "128", "-129", "300", "1000h", "0FFFFh", "-32768", "7FFFh"];
const SEGS = ["cs", "ds", "es", "ss"], WRITABLE_SEGS = ["ds", "es", "ss"];

let seed = Number(values.seed);
const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const pick = <T>(a: readonly T[]): T => a[rnd(a.length)];
const mem = (): string => { const b = pick(BASES); const d = b === "bp" && !rnd(3) ? "" : pick(DISPS); return `${pick(SEGO)}[${b}${d}]`; };
const memAny = (): string => (rnd(6) ? mem() : `${pick(SEGO)}[${pick(["0", "10h", "1234h", "0FFFEh"])}]`);

const corpus = (): string[] => {
  const lines: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const r16 = pick(R16), r8 = pick(R8), q16 = pick(R16), q8 = pick(R8), m = memAny();
    lines.push(`mov ${r16}, ${q16}`, `mov ${r8}, ${q8}`, `mov ${r16}, ${m}`, `mov ${m}, ${r8}`, `mov ${r8}, ${pick(IMM8)}`, `mov ${r16}, ${pick(IMM16)}`,
      `mov byte ptr ${memAny()}, ${pick(IMM8)}`, `mov word ptr ${memAny()}, ${pick(IMM16)}`, `mov ${pick(WRITABLE_SEGS)}, ${q16}`, `mov ${pick(WRITABLE_SEGS)}, ${mem()}`,
      `mov ${r16}, ${pick(SEGS)}`, `mov ${mem()}, ${pick(SEGS)}`);
    for (const op of ["add", "or", "adc", "sbb", "and", "sub", "xor", "cmp"])
      lines.push(`${op} ${r16}, ${q16}`, `${op} ${r8}, ${q8}`, `${op} ${r16}, ${mem()}`, `${op} ${mem()}, ${r8}`, `${op} ${r8}, ${pick(IMM8)}`, `${op} ${r16}, ${pick(IMM16)}`,
        `${op} byte ptr ${mem()}, ${pick(IMM8)}`, `${op} word ptr ${mem()}, ${pick(IMM16)}`, `${op} al, ${pick(IMM8)}`, `${op} ax, ${pick(IMM16)}`);
    lines.push(`test ${r16}, ${q16}`, `test ${mem()}, ${r8}`, `test ${r8}, ${pick(IMM8)}`, `test word ptr ${mem()}, ${pick(IMM16)}`, `test al, ${pick(IMM8)}`, `test ax, ${pick(IMM16)}`,
      `xchg ${r16}, ${q16}`, `xchg ${r8}, ${q8}`, `xchg ${mem()}, ${r16}`, `inc ${r16}`, `dec ${r8}`, `inc byte ptr ${mem()}`, `dec word ptr ${mem()}`);
    for (const op of ["not", "neg", "mul", "imul", "div", "idiv"]) lines.push(`${op} ${r16}`, `${op} ${r8}`, `${op} byte ptr ${mem()}`, `${op} word ptr ${mem()}`);
    for (const op of ["rol", "ror", "rcl", "rcr", "shl", "sal", "shr", "sar"]) lines.push(`${op} ${r16}, 1`, `${op} ${r8}, cl`, `${op} byte ptr ${mem()}, 1`, `${op} word ptr ${mem()}, cl`);
    lines.push(`push ${r16}`, `pop ${q16}`, `push ${pick(SEGS)}`, `pop ${pick(WRITABLE_SEGS)}`, `push word ptr ${mem()}`, `pop word ptr ${mem()}`,
      `lea ${r16}, ${mem()}`, `lds ${r16}, ${mem()}`, `les ${r16}, ${mem()}`, `int ${pick(["21h", "10h", "16h", "0", "3", "0FFh"])}`,
      `in ${pick(["al", "ax"])}, ${pick(["0", "60h", "0FFh", "dx"])}`, `out ${pick(["0", "61h", "0FFh", "dx"])}, ${pick(["al", "ax"])}`,
      `ret ${pick(["2", "4", "100h"])}`, `retf ${pick(["2", "6"])}`, `call ${q16}`, `jmp ${q16}`, `call word ptr ${mem()}`, `jmp word ptr ${mem()}`,
      `call dword ptr ${mem()}`, `jmp dword ptr ${mem()}`,
      `${pick(["rep", "repe", "repne", ""])} ${pick(["movsb", "movsw", "cmpsb", "cmpsw", "stosb", "stosw", "lodsb", "lodsw", "scasb", "scasw"])}`.trim());
  }
  lines.push("nop", "hlt", "clc", "stc", "cmc", "cld", "std", "cli", "sti", "cbw", "cwd", "pushf", "popf", "sahf", "lahf", "xlat", "aaa", "aas",
    "daa", "das", "aam", "aad", "wait", "into", "iret", "ret", "retf");
  return [...new Set(lines)];
};

const num = (s: string): string => s
  .replace(/\b0x([0-9a-f]+)\b/gi, (_m, h: string) => String(parseInt(h, 16)))
  .replace(/\b([0-9][0-9a-f]*)h\b/gi, (_m, h: string) => String(parseInt(h, 16)))
  .replace(/'(.)'/g, (_m, c: string) => String(c.charCodeAt(0)));

const SHIFTS_AND_IO = /^(shl|shr|sar|rol|ror|rcl|rcr|sal|in|out)\b/;
const REGISTER = /^(a[xlh]|b[xlhp]|c[xlhs]|d[xlhis]|s[ip]|[de]s|ss)$/;

const canon = (text: string): string => {
  let t = text.replace(/'(.)'/g, (_m, c: string) => String(c.charCodeAt(0))).toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/^notrack /, "").replace(/^fwait$/, "wait");
  t = t.replace(/^(rep[a-z]*) (movs|cmps|stos|lods|scas) (?:a[lx],)?(byte|word) ptr .*$/, (_m, r: string, op: string, sz: string) => `${r} ${op}${sz.charAt(0)}`);
  t = t.replace(/^(movs|cmps|stos|lods|scas) (?:a[lx],)?(byte|word) ptr .*$/, (_m, op: string, sz: string) => `${op}${sz.charAt(0)}`);
  t = t.replace(/^(rep|repz|repe) (cmps|scas)/, "repe $2").replace(/^repnz /, "repne ").replace(/^(repz|repe) (movs|stos|lods)/, "rep $2");
  t = t.replace(/^xlat .*$/, "xlat").replace(/^int3$/, "int 3").replace(/^xchg ax\s*,\s*ax$/, "nop");
  t = t.replace(/^sal /, "shl ");
  t = t.replace(/\b(cs|ds|es|ss):(0x[0-9a-f]+)/g, "$1:[$2]");
  t = t.replace(/\bds:\[(?!bp)/g, "[").replace(/\bss:\[bp/g, "[bp");
  if (t.startsWith("lea ")) t = t.replace(/\b(cs|ds|es|ss):\[/g, "[");
  const byteCtx = /\b(byte ptr|al|ah|bl|bh|cl|ch|dl|dh)\b/.test(t) && !SHIFTS_AND_IO.test(t);
  t = num(t).replace(/\b(near|far) /g, "");
  const parts = /^(\S+)\s*(.*)$/.exec(t);
  if (!parts) return t;
  const mn = parts[1], rest = parts.at(2) ?? "";
  let ops = rest ? rest.split(/\s*,\s*/) : [];
  const hasReg = ops.some(o => REGISTER.test(o));
  ops = ops.map(o => {
    let s = o.replace(/^(byte|word|dword) ptr /, w => (hasReg || mn === "lea" || mn === "lds" || mn === "les" ? "" : w));
    s = s.replace(/\[(.*)\]/, (_m, inner: string) => `[${inner.replace(/\+-/g, "-").replace(/\+0$/, "")}]`);
    s = s.replace(/^ds:\[/, "[").replace(/^ss:\[(bp[^\]]*)\]/, "[$1]");
    s = s.replace(/\[(\d+)\]/, (_m, d: string) => `[${Number(d) & 0xFFFF}]`);
    const mod = byteCtx ? 256 : 65536;
    if (/^-?\d+$/.test(s)) s = String(((Number(s) % mod) + mod) % mod);
    return s;
  });
  if (mn === "xchg") ops.sort();
  if (["ret", "retf", "int", "in", "out"].includes(mn)) ops = ops.map(o => (/^\d+$/.test(o) ? String(Number(o)) : o));
  if (mn === "aam" || mn === "aad") ops = [];
  return `${mn} ${ops.join(",")}`.trim();
};

const srcCanon = (s: string): string => {
  const t = s.replace(/'(.)'/g, (_m, c: string) => String(c.charCodeAt(0))).toLowerCase().replace(/\s+/g, " ").trim()
    .replace(/^repz /, "repe ").replace(/^repnz /, "repne ").replace(/^sal /, "shl ");
  const parts = /^(\S+)\s*(.*)$/.exec(t);
  if (!parts) return t;
  const rest = parts.at(2) ?? "", ops = rest ? rest.split(/\s*,\s*/) : [];
  return canon(`${parts[1]} ${ops.join(",")}`).replace(/\[(\w+)\+(\d+)\]/g, "[$1+$2]");
};

const items: { src: string; bytes: number[] }[] = [];
let asmErrors = 0;
for (const src of corpus()) {
  const p = assemble(`org 100h\n${src}\n`);
  const seg = p.segments.at(0);
  if (p.errors.length || !seg) { asmErrors++; process.stdout.write(`ASM ERROR ${src} ${JSON.stringify(p.errors[0])}\n`); continue; }
  items.push({ src, bytes: [...seg.bytes.slice(ORIGIN)] });
}

const dir = mkdtempSync(join(tmpdir(), "xcheck-"));
const bin = join(dir, "code.bin");
writeFileSync(bin, Buffer.from(items.flatMap(i => i.bytes)));
const dump = execFileSync("objdump", ["-D", "-b", "binary", "-m", "i8086", "-M", "intel", bin], { encoding: "utf8", maxBuffer: 1 << 26 });
rmSync(dir, { recursive: true });

const objdump = new Map<number, { len: number; text: string }>();
for (const l of dump.split("\n")) {
  const mm = /^\s*([0-9a-f]+):\t((?:[0-9a-f]{2} )+)\s*\t(.*)$/.exec(l);
  if (mm) objdump.set(parseInt(mm[1], 16), { len: mm[2].trim().split(" ").length, text: mm[3].trim() });
}

let off = 0, bad = 0;
const shown: string[] = [];
for (const it of items) {
  const o = objdump.get(off), cpu = new Cpu();
  cpu.mem.set(it.bytes, 0);
  const ins = decode(cpu), mine = canon(disasm(ins)), problems: string[] = [];
  if (!o) problems.push("objdump has no instruction at this offset");
  else {
    if (o.len !== it.bytes.length) problems.push(`objdump length ${o.len} vs ${it.bytes.length}`);
    if (ins.len !== it.bytes.length) problems.push(`decoder length ${ins.len}`);
    const theirs = canon(o.text);
    const notrackQuirk = o.text.startsWith("notrack ") && theirs === mine.replace("ds:[bp", "[bp");
    if (!notrackQuirk && theirs !== mine) problems.push(`objdump "${theirs}" vs decoder "${mine}"`);
    if (srcCanon(it.src) !== mine) problems.push(`source "${srcCanon(it.src)}" vs decoder "${mine}"`);
  }
  if (problems.length) {
    bad++;
    if (shown.length < 40) shown.push(`${it.src.padEnd(34)} ${it.bytes.map(b => b.toString(16).padStart(2, "0")).join(" ").padEnd(20)} ${problems.join(" | ")}`);
  }
  off += it.bytes.length;
}
process.stdout.write(`${shown.join("\n")}\n${items.length - bad}/${items.length} instructions agree three ways (source, decoder, objdump); ${asmErrors} assembler errors on valid input\n`);
process.exitCode = bad || asmErrors ? 1 : 0;
