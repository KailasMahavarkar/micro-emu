const { assemble, CPU, disasm } = require("../src/core.js");
const cases = [
  ["mov ax, bx", "MOV AX, BX", "8B C3"], ["mov al, 5", "MOV AL, 5", "B0 05"], ["mov cx, 1234h", "MOV CX, 1234h", "B9 34 12"],
  ["mov [bx], al", "MOV [BX], AL", "88 07"], ["mov ax, [bx+si+4]", "MOV AX, [BX+SI+04h]", "8B 40 04"],
  ["mov ax, [bp]", "MOV AX, [BP]", "8B 46 00"], ["mov byte ptr [di], 7", "MOV BYTE PTR [DI], 7", "C6 05 07"],
  ["mov word ptr [si+300h], 1", "MOV WORD PTR [SI+300h], 0001h", "C7 84 00 03 01 00"],
  ["mov ds, ax", "MOV DS, AX", "8E D8"], ["mov ax, es", "MOV AX, ES", "8C C0"], ["mov al, es:[di]", "MOV AL, ES:[DI]", "26 8A 05"],
  ["mov ax, [1234h]", "MOV AX, [1234h]", "A1 34 12"], ["mov [0010h], al", "MOV [0010h], AL", "A2 10 00"],
  ["add ax, bx", "ADD AX, BX", "03 C3"], ["add al, 1", "ADD AL, 1", "04 01"], ["add bx, 5", "ADD BX, 0005h", "83 C3 05"],
  ["add bx, 300h", "ADD BX, 0300h", "81 C3 00 03"], ["sub byte ptr [bx], 2", "SUB BYTE PTR [BX], 2", "80 2F 02"],
  ["cmp al, [si+1]", "CMP AL, [SI+01h]", "3A 44 01"], ["adc ah, 0", "ADC AH, 0", "80 D4 00"], ["sbb dx, cx", "SBB DX, CX", "1B D1"],
  ["and al, 0Fh", "AND AL, 0Fh", "24 0F"], ["or ax, ax", "OR AX, AX", "0B C0"], ["xor cx, cx", "XOR CX, CX", "33 C9"],
  ["test ax, ax", "TEST AX, AX", "85 C0"], ["test al, 80h", "TEST AL, 80h", "A8 80"], ["test byte ptr [bx], 1", "TEST BYTE PTR [BX], 1", "F6 07 01"],
  ["inc cx", "INC CX", "41"], ["dec bl", "DEC BL", "FE CB"], ["inc word ptr [bx]", "INC WORD PTR [BX]", "FF 07"],
  ["neg ax", "NEG AX", "F7 D8"], ["not bl", "NOT BL", "F6 D3"], ["mul cx", "MUL CX", "F7 E1"], ["imul bl", "IMUL BL", "F6 EB"],
  ["div bx", "DIV BX", "F7 F3"], ["idiv byte ptr [si]", "IDIV BYTE PTR [SI]", "F6 3C"],
  ["shl ax, 1", "SHL AX, 1", "D1 E0"], ["shr bl, cl", "SHR BL, CL", "D2 EB"], ["rol al, 1", "ROL AL, 1", "D0 C0"], ["sar dx, cl", "SAR DX, CL", "D3 FA"],
  ["rcl ax, 1", "RCL AX, 1", "D1 D0"], ["rcr byte ptr [bx], 1", "RCR BYTE PTR [BX], 1", "D0 1F"],
  ["push ax", "PUSH AX", "50"], ["pop di", "POP DI", "5F"], ["push ds", "PUSH DS", "1E"], ["pop es", "POP ES", "07"],
  ["push word ptr [bx]", "PUSH WORD PTR [BX]", "FF 37"], ["pop word ptr [bx]", "POP WORD PTR [BX]", "8F 07"],
  ["xchg ax, bx", "XCHG AX, BX", "93"], ["xchg al, [si+1]", "XCHG [SI+01h], AL", "86 44 01"], ["lea dx, [bx+di+10h]", "LEA DX, [BX+DI+10h]", "8D 51 10"],
  ["les di, [bx]", "LES DI, [BX]", "C4 3F"], ["int 21h", "INT 21h", "CD 21"], ["int 3", "INT 3", "CC"],
  ["in al, 60h", "IN AL, 60h", "E4 60"], ["out dx, al", "OUT DX, AL", "EE"], ["in ax, dx", "IN AX, DX", "ED"],
  ["rep movsb", "REP MOVSB", "F3 A4"], ["repne scasb", "REPNE SCASB", "F2 AE"], ["repe cmpsw", "REPE CMPSW", "F3 A7"],
  ["lodsb", "LODSB", "AC"], ["stosw", "STOSW", "AB"], ["cbw", "CBW", "98"], ["cwd", "CWD", "99"], ["xlat", "XLAT", "D7"],
  ["aam", "AAM 0Ah", "D4 0A"], ["aad", "AAD 0Ah", "D5 0A"], ["daa", "DAA", "27"], ["clc", "CLC", "F8"], ["std", "STD", "FD"],
  ["pushf", "PUSHF", "9C"], ["popf", "POPF", "9D"], ["lahf", "LAHF", "9F"], ["sahf", "SAHF", "9E"], ["hlt", "HLT", "F4"], ["nop", "NOP", "90"],
  ["ret", "RET", "C3"], ["ret 4", "RET 0004h", "C2 04 00"], ["retf", "RETF", "CB"], ["iret", "IRET", "CF"],
  ["call bx", "CALL BX", "FF D3"], ["jmp word ptr [bx]", "JMP WORD PTR [BX]", "FF 27"]
];
let bad = 0;
for (const [src, want, bytes] of cases) {
  const prog = assemble(`org 100h\n${src}\n`);
  if (prog.errors.length) { console.log("ASM ERROR", src, JSON.stringify(prog.errors)); bad++; continue; }
  const seg = prog.segments[0], code = [...seg.bytes.slice(0x100)];
  const got = code.map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const c = new CPU(); c.s[1] = 0x700; c.ip = 0x100; code.forEach((b, i) => { c.mem[0x7100 + i] = b; });
  const text = disasm(c.decode());
  if (text !== want || got !== bytes) { bad++; console.log(`MISMATCH ${src.padEnd(26)} bytes ${got.padEnd(18)} want ${bytes.padEnd(18)} | ${text} want ${want}`); }
}
const jumps = assemble(`org 100h
start: nop
  jmp start
  jz start
  loop start
  call far_away
  jmp far_away
  nop
far_away: ret
`);
const j = [...jumps.segments[0].bytes.slice(0x100)].map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const jWant = "90 EB FD 74 FB E2 F9 E8 04 00 E9 01 00 90 C3";
if (j !== jWant) { bad++; console.log("JUMPS", j, "want", jWant); }
const errs = [
  ["mov [bx], [si]", "TWO_MEM"], ["mov ds, 1234h", "SEG_IMM"], ["mul 5", "MUL_IMM"], ["shl ax, 3", "SHIFT_COUNT"], ["push 5", "PUSH_IMM"],
  ["push al", "PUSH_8"], ["mov ax, bl", "SIZE_MISMATCH"], ["mov [bx], 5", "SIZE_UNKNOWN"], ["mov ax, [ax]", "BAD_ADDR"], ["mov ax, [si+di]", "BAD_ADDR"],
  ["movv ax, 1", "UNKNOWN_MN"], ["jmp nowhere", "UNKNOWN_SYM"], ["mov al, 300", "IMM_RANGE"], ["mov cs, ax", "MOV_CS"], ["mov es, ds", "SEG_SEG"]
];
for (const [src, code] of errs) {
  const p = assemble(`org 100h\n${src}\n`);
  const got = p.errors.map(e => e.code).join(",");
  if (got !== code) { bad++; console.log(`ERRCODE ${src.padEnd(20)} got ${got || "-"} want ${code}`); }
}
const far = assemble(`org 100h\nstart: jz target\n${"nop\n".repeat(200)}target: ret\n`);
if (far.errors[0]?.code !== "JUMP_RANGE") { bad++; console.log("JUMP_RANGE not detected", JSON.stringify(far.errors)); }
console.log(bad ? `${bad} problems` : `all ${cases.length} encodings, jump layout, ${errs.length + 1} error checks ok`);
process.exit(bad ? 1 : 0);
