import { describe, expect, it } from "vitest";
import { Cpu } from "../cpu/cpu.ts";
import { decode } from "../cpu/decode.ts";
import { S } from "../cpu/registers.ts";
import { disasm } from "../disasm.ts";
import { COM_ORIGIN, LOAD_SEG } from "../layout.ts";
import { build, run, screenRows } from "../test-kit.ts";
import { assemble } from "./assemble.ts";
import type { AsmErrorCode } from "./errors.ts";

const hexBytes = (bytes: Iterable<number>): string => [...bytes].map(b => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
const comCode = (src: string): Uint8Array => {
  const p = assemble(`org 100h\n${src}\n`);
  expect(p.errors).toEqual([]);
  return p.segments[0].bytes.slice(COM_ORIGIN);
};

const ENCODINGS: [string, string, string][] = [
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

const ERRORS: [string, AsmErrorCode][] = [
  ["mov [bx], [si]", "TWO_MEM"], ["mov ds, 1234h", "SEG_IMM"], ["mul 5", "MUL_IMM"], ["shl ax, 3", "SHIFT_COUNT"], ["push 5", "PUSH_IMM"],
  ["push al", "PUSH_8"], ["mov ax, bl", "SIZE_MISMATCH"], ["mov [bx], 5", "SIZE_UNKNOWN"], ["mov ax, [ax]", "BAD_ADDR"], ["mov ax, [si+di]", "BAD_ADDR"],
  ["movv ax, 1", "UNKNOWN_MN"], ["jmp nowhere", "UNKNOWN_SYM"], ["mov al, 300", "IMM_RANGE"], ["mov cs, ax", "MOV_CS"], ["mov es, ds", "SEG_SEG"]
];

describe("assembler", () => {
  it.each(ENCODINGS)("encodes %s and disassembles it back", (src, text, bytes) => {
    const code = comCode(src), cpu = new Cpu();
    expect(hexBytes(code)).toBe(bytes);
    cpu.s[S.CS] = LOAD_SEG;
    cpu.ip = COM_ORIGIN;
    cpu.mem.set(code, (LOAD_SEG << 4) + COM_ORIGIN);
    expect(disasm(decode(cpu))).toBe(text);
  });

  it("picks short and near jump forms by distance and direction", () => {
    const code = comCode("start: nop\n  jmp start\n  jz start\n  loop start\n  call far_away\n  jmp far_away\n  nop\nfar_away: ret");
    expect(hexBytes(code)).toBe("90 EB FD 74 FB E2 F9 E8 04 00 E9 01 00 90 C3");
  });

  it.each(ERRORS)("reports %s as %s", (src, code) => {
    expect(assemble(`org 100h\n${src}\n`).errors.map(e => e.code)).toEqual([code]);
  });

  it("reports a conditional jump that cannot reach its label", () => {
    const p = assemble(`org 100h\nstart: jz target\n${"nop\n".repeat(200)}target: ret\n`);
    expect(p.errors[0]?.code).toBe("JUMP_RANGE");
  });

  it("lays out $, EQU, DUP, DW, DD, LABEL and turns RET inside PROC FAR into RETF", () => {
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
    expect(p.errors).toEqual([]);
    const b = [...p.segments[0].bytes.slice(COM_ORIGIN)];
    expect(b.slice(8, 14)).toEqual([1, 9, 9, 1, 9, 9]);
    expect(b.slice(14, 18)).toEqual([0x08, 0x01, 0xFF, 0xFF]);
    expect(b.slice(18, 22)).toEqual([0x78, 0x56, 0x34, 0x12]);
    expect(b[b.indexOf(0xB9) + 1]).toBe(8);
    expect(b.slice(-2)).toEqual([0xC3, 0xCB]);
  });

  it("expands a macro with LOCAL labels twice and the emu8086.inc PRINTN helper", () => {
    const { m } = build(`include 'emu8086.inc'
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
    run(m);
    expect(m.cpu.r[0]).toBe(10);
    expect(screenRows(m)[0]).toBe("ok");
  });
});
