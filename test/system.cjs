const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { Machine, assemble, VIDEO_LIN, COLS, ROWS, F } = require("../src/core.js");
const { EXAMPLES } = require("../src/examples.js");

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { if (ok) pass++; else { fail++; console.log(`FAIL ${name} ${detail}`); } };
const build = src => {
  const p = assemble(src);
  if (p.errors.length) throw new Error(`asm: ${JSON.stringify(p.errors)}\n${src}`);
  const m = new Machine();
  m.load(p);
  return { m, p };
};
const run = (m, limit = 100000) => { let n = 0; m.waiting = false; while (!m.done && n++ < limit) { m.step(); if (m.waiting) break; } return n; };
const screen = m => {
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    let s = "";
    for (let c = 0; c < COLS; c++) s += String.fromCharCode(m.cpu.mem[VIDEO_LIN + (r * COLS + c) * 2]);
    rows.push(s.trimEnd());
  }
  return rows;
};
const attr = (m, r, c) => m.cpu.mem[VIDEO_LIN + (r * COLS + c) * 2 + 1];
const cur = m => [m.cpu.mem[0x451], m.cpu.mem[0x450]];
const keys = (m, s) => { for (const ch of s) m.pressKey(ch.charCodeAt(0), ch === "\r" ? 0x1C : 0x10); };
const reg = (m, n) => m.cpu.r[["AX", "CX", "DX", "BX", "SP", "BP", "SI", "DI"].indexOf(n)];

{
  const { m } = build(`org 100h
    mov dl, 'Q'
    mov ah, 2
    int 21h
    mov dx, offset s
    mov ah, 9
    int 21h
    mov ah, 4Ch
    mov al, 7
    int 21h
s db 'AB$CD'`);
  run(m);
  check("int21/02+09 output", screen(m)[0] === "QAB", JSON.stringify(screen(m)[0]));
  check("int21/09 stops at $", !screen(m)[0].includes("C"));
  check("int21/4C exit code from AL", m.exited && m.exitCode === 7, `${m.exitCode}`);
}
{
  const { m } = build(`org 100h
    mov ah, 1
    int 21h
    mov bl, al
    mov ah, 8
    int 21h
    mov bh, al
    mov ah, 7
    int 21h
    mov cl, al
    mov ah, 4Ch
    int 21h`);
  run(m);
  check("int21/01 waits without a key", m.waiting && m.steps === 1 && !m.exited, `steps=${m.steps}`);
  const ipBefore = m.cpu.ip;
  keys(m, "xyz");
  run(m);
  check("int21/01 echoes, 08/07 do not", screen(m)[0] === "x", JSON.stringify(screen(m)[0]));
  check("int21/01,08,07 return keys in AL", (reg(m, "BX") & 0xFF) === 120 && reg(m, "BX") >> 8 === 121 && (reg(m, "CX") & 0xFF) === 122);
  check("waiting does not advance IP", ipBefore === 0x102);
}
{
  const { m } = build(`org 100h
    mov ah, 6
    mov dl, 0FFh
    int 21h
    pushf
    pop bx
    mov ah, 4Ch
    int 21h`);
  run(m);
  check("int21/06 no key sets ZF", (reg(m, "BX") & F.ZF) !== 0);
  const b = build(`org 100h
    mov ah, 6
    mov dl, 0FFh
    int 21h
    pushf
    pop bx
    mov ah, 4Ch
    int 21h`).m;
  keys(b, "k");
  run(b);
  check("int21/06 with key clears ZF, AL=key", (reg(b, "BX") & F.ZF) === 0 && (reg(b, "AX") & 0xFF) === 0x6B);
}
{
  const { m } = build(`org 100h
    mov dx, offset buf
    mov ah, 0Ah
    int 21h
    mov ah, 4Ch
    int 21h
buf db 4, 0, 6 dup('.')`);
  keys(m, "ab\bcdef\r");
  run(m);
  const b = 0x7000 + m.prog.segments[0].bytes.length - 8;
  const mem = [...m.cpu.mem.slice(b, b + 8)];
  check("int21/0A buffered input: backspace, max-1 chars, count, CR", mem[1] === 3 && String.fromCharCode(...mem.slice(2, 5)) === "acd" && mem[5] === 13, JSON.stringify(mem));
  check("int21/0A echo matches", screen(m)[0] === "acd", JSON.stringify(screen(m)[0]));
}
{
  const { m } = build(`org 100h
    mov ah, 0Bh
    int 21h
    mov bp, ax
    mov ah, 25h
    mov al, 60h
    mov dx, offset handler
    int 21h
    mov ah, 35h
    mov al, 60h
    int 21h
    mov si, bx
    mov ax, 1
    int 60h
    mov ah, 4Ch
    int 21h
handler:
    add ax, 41
    iret`);
  run(m);
  check("int21/0B no key -> AL=0", (reg(m, "BP") & 0xFF) === 0, reg(m, "BP").toString(16));
  check("int21/25+35 set and get vector", reg(m, "SI") === m.prog.symbols.get("HANDLER").off);
  check("user INT 60h handler runs and IRETs", (reg(m, "AX") & 0xFF) === 42, `AX=${reg(m, "AX").toString(16)}`);
}
{
  const { m } = build(`org 100h
    mov ah, 2
    mov dh, 5
    mov dl, 10
    int 10h
    mov ah, 0Eh
    mov al, 'H'
    int 10h
    mov ah, 3
    int 10h
    mov si, dx
    mov ah, 9
    mov al, '*'
    mov bl, 4Eh
    mov cx, 3
    int 10h
    mov ah, 8
    int 10h
    mov di, ax
    mov ah, 4Ch
    int 21h`);
  run(m);
  check("int10/02+0E cursor and teletype", screen(m)[5].slice(10, 11) === "H");
  check("int10/03 returns cursor", m.cpu.r[6] === ((5 << 8) | 11), m.cpu.r[6].toString(16));
  check("int10/09 writes char+attr CX times without moving", screen(m)[5].slice(11, 14) === "***" && attr(m, 5, 13) === 0x4E && cur(m)[1] === 11);
  check("int10/08 reads char+attr at cursor", m.cpu.r[7] === 0x4E2A, m.cpu.r[7].toString(16));
}
{
  const { m } = build(`org 100h
    mov dx, offset l1
    mov ah, 9
    int 21h
    mov ax, 0601h
    mov bh, 1Fh
    mov cx, 0
    mov dx, 184Fh
    int 10h
    mov ah, 4Ch
    int 21h
l1 db 'top', 13, 10, 'second$'`);
  run(m);
  check("int10/06 scrolls up one line, fills with attr", screen(m)[0] === "second" && screen(m)[1] === "" && attr(m, 24, 0) === 0x1F, JSON.stringify(screen(m).slice(0, 2)));
}
{
  const { m } = build(`org 100h
    mov cx, 2000
    mov dl, 'x'
next:
    mov ah, 2
    int 21h
    loop next
    mov dl, 9
    int 21h
    mov dl, 'T'
    int 21h
    mov dl, 8
    int 21h
    mov dl, 'b'
    int 21h
    mov ah, 4Ch
    int 21h`);
  run(m, 200000);
  check("teletype wraps and scrolls at row 25", screen(m)[23] === "x".repeat(80) && cur(m)[0] === 24, JSON.stringify(cur(m)));
  check("teletype tab to column 8, then backspace overwrite", screen(m)[24] === "        b", JSON.stringify(screen(m)[24]));
}
{
  const { m } = build(`org 100h
    mov ah, 0
    int 16h
    mov bx, ax
    mov ah, 1
    int 16h
    pushf
    pop si
    mov ah, 4Ch
    int 21h`);
  keys(m, "\r");
  run(m);
  check("int16/00 AX = scan:ascii", reg(m, "BX") === 0x1C0D, reg(m, "BX").toString(16));
  check("int16/01 with empty buffer sets ZF", (reg(m, "SI") & F.ZF) !== 0);
}
{
  const { m, p } = build(`org 100h
    nop
    ret`);
  check("COM: CS=DS=ES=SS, IP=100h, SP=FFFEh", m.cpu.s.every(s => s === 0x700) && m.cpu.ip === 0x100 && m.cpu.r[4] === 0xFFFE);
  check("COM: PSP starts with INT 20h", m.cpu.mem[0x7000] === 0xCD && m.cpu.mem[0x7001] === 0x20);
  run(m);
  check("COM: RET goes to PSP and exits cleanly", m.exited && m.exitCode === 0 && !m.notice);
  void p;
}
{
  const { m, p } = build(`.model small
.stack 200h
.data
a dw 1234h
b db 'xy'
.code
start:
    mov ax, @data
    mov ds, ax
    mov ax, a
    mov bl, b+1
    mov ah, 4Ch
    int 21h
end start`);
  const st = p.segments.find(s => s.stack), dt = p.segments.find(s => s.name === "_DATA"), ct = p.segments.find(s => s.name === "_TEXT");
  check("EXE: DS=ES=PSP at entry", m.cpu.s[3] === 0x700 && m.cpu.s[0] === 0x700);
  check("EXE: SS:SP = stack segment, size", m.cpu.s[2] === st.base && m.cpu.r[4] === 0x200);
  check("EXE: CS:IP = END label", m.cpu.s[1] === ct.base && m.cpu.ip === 0);
  run(m);
  check("EXE: @data and variables", (reg(m, "AX") & 0xFF) === 0x34, reg(m, "AX").toString(16));
  check("EXE: byte var + offset", (reg(m, "BX") & 0xFF) === 0x79);
  check("EXE: segments do not overlap", st.base + Math.ceil(st.size / 16) <= dt.base && dt.base + Math.ceil(dt.size / 16) <= ct.base);
}
{
  const { m } = build(`org 100h
    mov ax, 5
msg db 'oops'`);
  run(m);
  check("runaway past the code is caught", m.notice && m.notice.code === "RUNAWAY" && m.notice.fatal, JSON.stringify(m.notice));
}
{
  const { m } = build(`org 100h
    mov ax, 10
    xor bl, bl
    div bl
    mov ah, 4Ch
    int 21h`);
  run(m);
  check("divide by zero: DOS message and stop", m.notice && m.notice.code === "DIV0" && screen(m).join("\n").includes("Divide overflow") && m.exited);
}
{
  const p = assemble(`org 100h
msg db 'Hi there'
len equ $ - msg
tbl db 2 dup(1, 2 dup(9))
w dw tbl, -1
dd1 dd 12345678h
arr label byte
    db 7
start:
    mov cx, len
    mov al, arr
    mov bx, offset w
    mov dx, seg msg
    jmp short done
    nop
done:
    call far_proc
    ret
far_proc proc far
    ret
far_proc endp`);
  check("assembler: $, EQU, DUP, DD, LABEL, SEG, PROC FAR", !p.errors.length, JSON.stringify(p.errors));
  const b = [...p.segments[0].bytes.slice(0x100)];
  check("DUP nested layout", b.slice(8, 14).join() === "1,9,9,1,9,9", b.slice(8, 14).join());
  check("DW label + negative", b[14] === 0x08 && b[15] === 0x01 && b[16] === 0xFF && b[17] === 0xFF, b.slice(14, 18).join());
  check("DD little endian", b.slice(18, 22).join() === "120,86,52,18", b.slice(18, 22).join());
  check("len equ $ - msg = 8", b.includes(0xB9) && b[b.indexOf(0xB9) + 1] === 8);
  check("RET inside PROC FAR becomes RETF", b[b.length - 1] === 0xCB && b[b.length - 2] === 0xC3);
}
{
  const p = assemble(`include 'emu8086.inc'
org 100h
twice macro x
    local again
again:
    add ax, x
    add ax, x
endm
    twice 2
    twice 3
    printn 'ok'
    ret`);
  check("macros with LOCAL expand twice without clashes", !p.errors.length, JSON.stringify(p.errors));
  const m = new Machine(); m.load(p); run(m);
  check("macro result and emu8086 PRINTN", m.cpu.r[0] === 10 && screen(m)[0] === "ok", `AX=${m.cpu.r[0]} ${JSON.stringify(screen(m)[0])}`);
}
{
  const { m, p } = build(fs.readFileSync(path.join(__dirname, "coverage.asm"), "utf8"));
  run(m);
  const sym = n => p.symbols.get(n).off;
  check("coverage program exits cleanly", m.exited && m.exitCode === 0 && !m.notice, JSON.stringify(m.notice));
  check("PROC FAR called with far CALL and returns with RETF", m.cpu.r[5] === 0x0FA2 && p.listing.filter(l => l.bytes[0] === 0x9A).length === 2);
  check("REP MOVSB copies the string", String.fromCharCode(...m.cpu.mem.slice(0x7000 + sym("DST"), 0x7000 + sym("DST") + 4)) === "ABCD");
  check("memory arithmetic chain gives FDF6h", m.cpu.rw(0x700, sym("COUNTER2")) === 0xFDF6, m.cpu.rw(0x700, sym("COUNTER2")).toString(16));
  check("direct video write lands at B800:0000", m.cpu.mem[VIDEO_LIN] === 0x41 && m.cpu.mem[VIDEO_LIN + 1] === 0x2F);
}
{
  const { m } = build(`org 100h
    in ax, 70h
    mov bx, ax
    mov ax, 1234h
    out 70h, ax
    in al, 71h
    mov cl, al
    in ax, 70h
    mov ah, 4Ch
    int 21h`);
  run(m);
  check("IN AX from an unused port reads the floating bus FFFFh", reg(m, "BX") === 0xFFFF, reg(m, "BX").toString(16));
  check("OUT AX writes two ports, IN reads them back", (reg(m, "CX") & 0xFF) === 0x12 && (reg(m, "AX") & 0xFF) === 0x34, `${reg(m, "CX").toString(16)} ${reg(m, "AX").toString(16)}`);
}
for (const ex of EXAMPLES) {
  const { m } = build(ex.src);
  keys(m, "12\r30\rabc\r");
  const hash = () => crypto.createHash("sha1").update(Buffer.from(m.cpu.mem)).update(Buffer.from(m.cpu.r.buffer)).update(Buffer.from(m.cpu.s.buffer)).update(String(m.cpu.ip + ":" + m.cpu.flags)).digest("hex");
  const seq = [hash()];
  while (!m.done && seq.length < 3000) { m.step(); if (m.waiting) break; seq.push(hash()); }
  let ok = true;
  for (let i = seq.length - 1; i > 0; i--) { m.back(); if (hash() !== seq[i - 1]) { ok = false; break; } }
  const kp = m.keyPos;
  const replay = [hash()];
  while (!m.done && replay.length < seq.length) { m.step(); if (m.waiting) break; replay.push(hash()); }
  check(`step-back + replay is exact: ${ex.id} (${seq.length - 1} steps)`, ok && kp === 0 && replay.join() === seq.join());
}
{
  const app = fs.readFileSync(path.join(__dirname, "../src/app.js"), "utf8"), core = fs.readFileSync(path.join(__dirname, "../src/core.js"), "utf8");
  const codes = new Set([...core.matchAll(/fail\("([A-Z_0-9]+)"/g)].map(x => x[1]).concat([...core.matchAll(/code: "([A-Z_0-9]+)"/g)].map(x => x[1])));
  const missing = [...codes].filter(c => !new RegExp(`\\n  ${c}: \\{\\n    en: \\{[^\\n]+\\n    hi: \\{`).test(app));
  check(`every error/notice code has English and Hinglish text (${codes.size} codes)`, !missing.length, missing.join(","));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
