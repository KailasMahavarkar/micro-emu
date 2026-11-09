const { Machine, assemble, hex, VIDEO_LIN, COLS, ROWS } = require("../src/core.js");
const { EXAMPLES } = require("../src/examples.js");
const expect = {
  hello: { out: "Hello from the 8086!" },
  factorial: { out: "120" },
  sum: { out: "Sum = 75" },
  sort: { out: "Sorted: 3 9 12 23 45 56 78" },
  reverse: { out: "BAL 6808" },
  video: { out: "8086 LAB IS ALIVE" },
  upper: { keys: "abc Z1\r", out: "Type something: ABC Z1" },
  macros: { keys: "12\r30\r", out: "Sum = 42" }
};
const screen = m => {
  const lines = [];
  for (let r = 0; r < ROWS; r++) {
    let s = "";
    for (let c = 0; c < COLS; c++) s += String.fromCharCode(m.cpu.mem[VIDEO_LIN + (r * COLS + c) * 2]);
    lines.push(s.trimEnd());
  }
  return lines.join("\n").trimEnd();
};
let failed = 0;
for (const ex of EXAMPLES) {
  const prog = assemble(ex.src);
  if (prog.errors.length) { console.log(`FAIL ${ex.id}: asm errors`, JSON.stringify(prog.errors)); failed++; continue; }
  const m = new Machine();
  m.load(prog);
  const e = expect[ex.id];
  for (const ch of e.keys || "") m.pressKey(ch.charCodeAt(0), ch === "\r" ? 0x1C : 0);
  let n = 0;
  while (!m.done && n < 200000) { m.step(true); n++; if (m.waiting) break; }
  const out = screen(m);
  const ok = out.includes(e.out) && (m.exited || m.cpu.halted) && !(m.notice && m.notice.fatal);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${ex.id.padEnd(10)} steps=${String(m.steps).padStart(6)} exited=${m.exited} waiting=${m.waiting} notice=${m.notice ? m.notice.code : "-"} bytes=${prog.segments.reduce((a, s) => a + s.size, 0)}`);
  if (!ok) console.log("  screen:", JSON.stringify(out.slice(0, 300)));
}
const m = new Machine();
const prog = assemble(EXAMPLES[1].src);
m.load(prog);
for (let i = 0; i < 20; i++) m.step(true);
const mid = JSON.stringify([...m.cpu.r]);
for (let i = 0; i < 10; i++) m.step(true);
for (let i = 0; i < 10; i++) m.back();
console.log(JSON.stringify([...m.cpu.r]) === mid ? "ok   step-back restores registers" : "FAIL step-back");
process.exit(failed ? 1 : 0);
