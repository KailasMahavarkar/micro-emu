import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { disasm, hex, layout, peek } from "../../emulator/index.ts";
import { build, type } from "../../emulator/test-kit.ts";
import { EXAMPLES, EXAMPLE_IDS } from "../../examples/index.ts";
import { capture, isHop } from "./board-model.ts";
import { REGISTER_NODES, UNIT_NODES, route } from "./geometry.ts";
import { buildPlan } from "./plan.ts";
import type { BoardNode } from "./types.ts";

const COVERAGE = readFileSync(new URL("../../emulator/coverage.asm", import.meta.url), "utf8");
const PROGRAMS: [string, string][] = [...EXAMPLE_IDS.map((id): [string, string] => [id, EXAMPLES[id].src]), ["coverage", COVERAGE]];
const NODES: ReadonlySet<BoardNode> = new Set<BoardNode>([...REGISTER_NODES, ...UNIT_NODES]);
const FETCH = "IP>SIGMA SIGMA>MEM MEM>QUEUE QUEUE>CU";
const LOW_RAM = 0x500;
const MAX_STEPS = 5000;
const isVideo = (a: number): boolean => a >= layout.VIDEO_LIN && a < layout.VIDEO_LIN + layout.VIDEO_BYTES;
const normalizeLabel = (label: string): string => label.replace(/^'(.)'$/, (_m, c: string) => hex(c.charCodeAt(0), 2)).replace(/^([0-9A-F]{2,4})h$/, "$1");

describe.each(PROGRAMS)("board plan for %s", (_id, src) => {
  it("moves every changed value, flag, write and bus address the CPU actually produced", () => {
    const { m, p } = build(src);
    type(m, "12\r30\rabc\r");
    const problems: string[] = [];
    for (let n = 0; n < MAX_STEPS && !m.finished(); n++) {
      const before = capture(m, p, peek(m.cpu).len);
      const record = m.step(true);
      if (!record || m.isWaiting()) break;
      const after = capture(m, p, null);
      const hops = buildPlan({ ins: record.ins, values: record.values, before, after, cpu: m.cpu, notice: m.notice?.code ?? null, showFetch: true }).filter(isHop);
      const where = `step ${m.steps} ${disasm(record.ins)}`;
      for (const h of hops) {
        if (!NODES.has(h.from) || !NODES.has(h.to)) problems.push(`${where}: unknown node ${h.from}->${h.to}`);
        if (route(h.from, h.to).some(pt => pt.some(Number.isNaN))) problems.push(`${where}: bad route ${h.from}->${h.to}`);
        if (!h.text) problems.push(`${where}: hop without caption`);
      }
      for (const r of REGISTER_NODES) {
        if (r === "IP" || after.regs[r] === before.regs[r]) continue;
        const into = hops.filter(h => h.to === r).at(-1);
        if (!into) { problems.push(`${where}: ${r} changed but no packet goes to ${r}`); continue; }
        const label = normalizeLabel(into.label), v = after.regs[r];
        if (/^[0-9A-F]{2,4}$/.test(label) && ![hex(v), hex(v & 0xFF, 2), hex(v >> 8, 2)].includes(label)) problems.push(`${where}: last packet into ${r} says ${label}, register is ${hex(v)}`);
      }
      if (after.flags !== before.flags && !hops.some(h => h.to === "FLAGS")) problems.push(`${where}: flags changed but no packet goes to FLAGS`);
      const writes = new Set(record.log.filter((_v, i) => i % 2 === 0));
      if ([...writes].some(a => a >= LOW_RAM && !isVideo(a)) && !hops.some(h => h.to === "MEM")) problems.push(`${where}: wrote RAM but no packet goes to MEM`);
      if ([...writes].some(isVideo) && !hops.some(h => h.to === "SCREEN")) problems.push(`${where}: wrote video RAM but no packet goes to SCREEN`);
      const bus = new Set(hops.filter(h => h.from === "SIGMA").map(h => parseInt(h.label, 16)));
      const repeated = record.ins.rep !== 0 && (record.ins.mn === "MOVS" || record.ins.mn === "STOS");
      for (const a of writes) {
        if (a < LOW_RAM || repeated || record.ins.mn === "INT") continue;
        if (!bus.has(a) && !bus.has(a - 1)) problems.push(`${where}: wrote ${hex(a, 5)} but the address bus never shows it`);
      }
      const fetch = hops.slice(0, 4).map(h => `${h.from}>${h.to}`).join(" ");
      if (fetch !== FETCH) problems.push(`${where}: fetch sequence is ${fetch}`);
    }
    expect(m.finished()).toBe(true);
    expect(problems).toEqual([]);
  });
});
