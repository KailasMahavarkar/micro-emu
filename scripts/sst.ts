import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { Cpu, step } from "../src/emulator/index.ts";

interface Regs { ax: number; bx: number; cx: number; dx: number; sp: number; bp: number; si: number; di: number; es: number; cs: number; ss: number; ds: number; ip: number; flags: number }
interface SstCase { name: string; initial: { regs: Regs; ram: [number, number][] }; final: { regs: Partial<Regs>; ram: [number, number][] } }
interface MetaEntry { status?: string; "flags-mask"?: number; reg?: Record<string, MetaEntry> }

const DATA_DIR = join(import.meta.dirname, "sst");
const SOURCE = "https://raw.githubusercontent.com/SingleStepTests/8088/main/v2";
const ORDER = ["ax", "cx", "dx", "bx", "sp", "bp", "si", "di"] as const;
const SEGS = ["es", "cs", "ss", "ds"] as const;
const ALL_FLAGS = 0xFFFF;
const ADDRESS_MASK = 0xFFFFF;

const { values } = parseArgs({ options: { files: { type: "string" } } });
const meta = (JSON.parse(readFileSync(join(DATA_DIR, "metadata.json"), "utf8")) as { opcodes: Partial<Record<string, MetaEntry>> }).opcodes;
const names = values.files?.split(",") ?? readFileSync(join(import.meta.dirname, "sst-files.txt"), "utf8").trim().split(/\s+/);

const info = (name: string): { status: string; mask: number } => {
  const parts = name.replace(".json.gz", "").split("."), op = parts[0], reg = parts.at(1);
  const m = meta[op], e = reg !== undefined && m?.reg ? m.reg[reg] : m;
  return { status: e?.status ?? "?", mask: e?.["flags-mask"] ?? ALL_FLAGS };
};

const pushedFlagAddresses = (r: Regs): number[] => [4, 5].map(k => ((r.ss << 4) + ((r.sp + k) & 0xFFFF)) & ADDRESS_MASK);

const summary = { files: 0, tests: 0, pass: 0, regFail: 0, flagFail: 0, pushedFlagsOnly: 0, ramFail: 0 };
const failures: string[] = [];
for (const name of names) {
  const file = join(DATA_DIR, name), fresh = !existsSync(file);
  if (fresh) execFileSync("curl", ["-sSL", "--max-time", "120", "-o", file, `${SOURCE}/${name}`]);
  const tests = JSON.parse(gunzipSync(readFileSync(file)).toString()) as SstCase[];
  const { status, mask } = info(name);
  const c = { pass: 0, reg: 0, flags: 0, pushed: 0, ram: 0, first: "" };
  for (const t of tests) {
    const cpu = new Cpu(), init = t.initial.regs, exp: Regs = { ...init, ...t.final.regs };
    ORDER.forEach((r, i) => { cpu.r[i] = init[r]; });
    SEGS.forEach((r, i) => { cpu.s[i] = init[r]; });
    cpu.ip = init.ip;
    cpu.flags = init.flags;
    for (const [a, v] of t.initial.ram) cpu.mem[a] = v;
    step(cpu);
    const regBad = ORDER.some((r, i) => cpu.r[i] !== exp[r]) || SEGS.some((r, i) => cpu.s[i] !== exp[r]) || cpu.ip !== exp.ip;
    const flagBad = (cpu.flags & mask) !== (exp.flags & mask);
    const ramBad = t.final.ram.filter(([a, v]) => cpu.mem[a] !== v).map(([a]) => a);
    if (!regBad && !flagBad && !ramBad.length) { c.pass++; continue; }
    const pushed = pushedFlagAddresses(exp), pushedOnly = ramBad.every(a => pushed.includes(a));
    if (regBad) c.reg++;
    else if (flagBad) c.flags++;
    else if (pushedOnly) c.pushed++;
    else c.ram++;
    if (!c.first && (regBad || flagBad || !pushedOnly)) c.first = `${t.name} [${regBad ? "regs" : flagBad ? "flags" : "ram"}]`;
  }
  if (fresh) unlinkSync(file);
  summary.files++; summary.tests += tests.length; summary.pass += c.pass;
  summary.regFail += c.reg; summary.flagFail += c.flags; summary.pushedFlagsOnly += c.pushed; summary.ramFail += c.ram;
  if (c.pass !== tests.length) failures.push(`${name.padEnd(14)} ${status.padEnd(12)} ${c.pass}/${tests.length} regs=${c.reg} flags=${c.flags} pushedFlagsOnly=${c.pushed} ram=${c.ram} ${c.first}`);
  process.stdout.write(`file ${summary.files}/${names.length} ${name}\n`);
}
process.stdout.write(`\nFAILURES:\n${failures.join("\n")}\n\nSUMMARY ${JSON.stringify(summary)}\n`);
process.exitCode = summary.regFail + summary.flagFail + summary.ramFail ? 1 : 0;
