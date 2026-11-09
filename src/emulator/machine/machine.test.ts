import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { F, R, S } from "../cpu/registers.ts";
import { BIOS_SEG, CURSOR_COL, CURSOR_ROW, LOAD_SEG, VIDEO_LIN } from "../layout.ts";
import { attrAt, build, run, screenRows, type } from "../test-kit.ts";

const EXIT = "    mov ah, 4Ch\n    int 21h";
const cursor = (m: ReturnType<typeof build>["m"]): [number, number] => [m.cpu.rb(BIOS_SEG, CURSOR_ROW), m.cpu.rb(BIOS_SEG, CURSOR_COL)];
const COVERAGE = readFileSync(new URL("../coverage.asm", import.meta.url), "utf8");

describe("DOS services (INT 21h)", () => {
  it("02 and 09 print, 09 stops at $, 4C exits with AL", () => {
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
    expect(screenRows(m)[0]).toBe("QAB");
    expect([m.exited, m.exitCode]).toEqual([true, 7]);
  });

  it("01 waits for a key without moving IP, then 01 echoes while 08 and 07 do not", () => {
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
${EXIT}`);
    run(m);
    expect([m.isWaiting(), m.steps, m.exited, m.cpu.ip]).toEqual([true, 1, false, 0x102]);
    type(m, "xyz");
    run(m);
    expect(screenRows(m)[0]).toBe("x");
    expect([m.cpu.r[R.BX], m.cpu.r[R.CX] & 0xFF]).toEqual([0x7978, 0x7A]);
  });

  it.each([["", true, 0], ["k", false, 0x6B]])("06 direct input with keys %j sets ZF=%s and AL", (keys, zf, al) => {
    const { m } = build(`org 100h
    mov ah, 6
    mov dl, 0FFh
    int 21h
    pushf
    pop bx
${EXIT}`);
    type(m, keys);
    run(m);
    expect((m.cpu.r[R.BX] & F.ZF) !== 0).toBe(zf);
    if (keys) expect(m.cpu.r[R.AX] & 0xFF).toBe(al);
  });

  it("0A reads a line with backspace, a max-1 limit, the count and CR", () => {
    const { m, p } = build(`org 100h
    mov dx, offset buf
    mov ah, 0Ah
    int 21h
${EXIT}
buf db 4, 0, 6 dup('.')`);
    type(m, "ab\bcdef\r");
    run(m);
    const at = (LOAD_SEG << 4) + p.segments[0].bytes.length - 8, mem = [...m.cpu.mem.slice(at, at + 8)];
    expect(mem[1]).toBe(3);
    expect(String.fromCharCode(...mem.slice(2, 5))).toBe("acd");
    expect(mem[5]).toBe(13);
    expect(screenRows(m)[0]).toBe("acd");
  });

  it("0B reports no key, 25/35 set and get a vector, and a user INT handler runs and IRETs", () => {
    const { m, p } = build(`org 100h
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
${EXIT}
handler:
    add ax, 41
    iret`);
    run(m);
    const handler = p.symbols.get("HANDLER");
    expect(m.cpu.r[R.BP] & 0xFF).toBe(0);
    expect(handler?.kind === "label" ? handler.off : null).toBe(m.cpu.r[R.SI]);
    expect(m.cpu.r[R.AX] & 0xFF).toBe(42);
  });
});

describe("BIOS services", () => {
  it("INT 10h 02/0E/03/09/08 move the cursor, write, and read back", () => {
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
${EXIT}`);
    run(m);
    expect(screenRows(m)[5].slice(10, 14)).toBe("H***");
    expect(m.cpu.r[R.SI]).toBe((5 << 8) | 11);
    expect([attrAt(m, 5, 13), cursor(m)[1]]).toEqual([0x4E, 11]);
    expect(m.cpu.r[R.DI]).toBe(0x4E2A);
  });

  it("INT 10h 06 scrolls up and fills with the attribute", () => {
    const { m } = build(`org 100h
    mov dx, offset l1
    mov ah, 9
    int 21h
    mov ax, 0601h
    mov bh, 1Fh
    mov cx, 0
    mov dx, 184Fh
    int 10h
${EXIT}
l1 db 'top', 13, 10, 'second$'`);
    run(m);
    expect(screenRows(m).slice(0, 2)).toEqual(["second", ""]);
    expect(attrAt(m, 24, 0)).toBe(0x1F);
  });

  it("teletype wraps and scrolls at row 25, tabs to column 8 and backspaces", () => {
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
${EXIT}`);
    run(m, 200_000);
    expect(screenRows(m)[23]).toBe("x".repeat(80));
    expect(cursor(m)[0]).toBe(24);
    expect(screenRows(m)[24]).toBe("        b");
  });

  it("INT 16h 00 returns scan:ascii and 01 sets ZF on an empty buffer", () => {
    const { m } = build(`org 100h
    mov ah, 0
    int 16h
    mov bx, ax
    mov ah, 1
    int 16h
    pushf
    pop si
${EXIT}`);
    type(m, "\r");
    run(m);
    expect(m.cpu.r[R.BX]).toBe(0x1C0D);
    expect(m.cpu.r[R.SI] & F.ZF).not.toBe(0);
  });
});

describe("program loading and faults", () => {
  it("loads a COM file with every segment at the PSP and returns to INT 20h", () => {
    const { m } = build("org 100h\n    nop\n    ret");
    expect([[...m.cpu.s], m.cpu.ip, m.cpu.r[R.SP]]).toEqual([[LOAD_SEG, LOAD_SEG, LOAD_SEG, LOAD_SEG], 0x100, 0xFFFE]);
    expect([m.cpu.mem[LOAD_SEG << 4], m.cpu.mem[(LOAD_SEG << 4) + 1]]).toEqual([0xCD, 0x20]);
    run(m);
    expect([m.exited, m.exitCode, m.notice]).toEqual([true, 0, null]);
  });

  it("loads an EXE with DS=ES=PSP, its stack, its END entry and non-overlapping segments", () => {
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
${EXIT}
end start`);
    const seg = (name: string): { base: number; size: number } => {
      const s = p.segments.find(x => x.name === name);
      if (!s) throw new Error(`no segment ${name}`);
      return s;
    };
    const st = seg("STACK"), dt = seg("_DATA"), ct = seg("_TEXT");
    expect([m.cpu.s[S.DS], m.cpu.s[S.ES], m.cpu.s[S.SS], m.cpu.r[R.SP], m.cpu.s[S.CS], m.cpu.ip]).toEqual([LOAD_SEG, LOAD_SEG, st.base, 0x200, ct.base, 0]);
    run(m);
    expect([m.cpu.r[R.AX] & 0xFF, m.cpu.r[R.BX] & 0xFF]).toEqual([0x34, 0x79]);
    expect(st.base + Math.ceil(st.size / 16)).toBeLessThanOrEqual(dt.base);
    expect(dt.base + Math.ceil(dt.size / 16)).toBeLessThanOrEqual(ct.base);
  });

  it("stops a program that runs past its code", () => {
    const { m } = build("org 100h\n    mov ax, 5\nmsg db 'oops'");
    run(m);
    expect(m.notice).toMatchObject({ code: "RUNAWAY", fatal: true });
  });

  it("prints Divide overflow and stops on divide by zero", () => {
    const { m } = build(`org 100h\n    mov ax, 10\n    xor bl, bl\n    div bl\n${EXIT}`);
    run(m);
    expect(m.notice?.code).toBe("DIV0");
    expect(m.exited).toBe(true);
    expect(screenRows(m).join("\n")).toContain("Divide overflow");
  });

  it("reads FFFFh from a floating port and reads back what OUT wrote", () => {
    const { m } = build(`org 100h
    in ax, 70h
    mov bx, ax
    mov ax, 1234h
    out 70h, ax
    in al, 71h
    mov cl, al
    in ax, 70h
${EXIT}`);
    run(m);
    expect([m.cpu.r[R.BX], m.cpu.r[R.CX] & 0xFF, m.cpu.r[R.AX] & 0xFF]).toEqual([0xFFFF, 0x12, 0x34]);
  });

  it("runs the coverage program: far procs, REP MOVSB, memory arithmetic and direct video writes", () => {
    const { m, p } = build(COVERAGE);
    run(m);
    const off = (name: string): number => {
      const s = p.symbols.get(name);
      if (s?.kind !== "var" && s?.kind !== "label") throw new Error(`no address symbol ${name}`);
      return s.off;
    };
    expect([m.exited, m.exitCode, m.notice]).toEqual([true, 0, null]);
    expect(m.cpu.r[R.BP]).toBe(0x0FA2);
    expect(p.listing.filter(l => l.bytes[0] === 0x9A)).toHaveLength(2);
    expect(String.fromCharCode(...m.cpu.mem.slice((LOAD_SEG << 4) + off("DST"), (LOAD_SEG << 4) + off("DST") + 4))).toBe("ABCD");
    expect(m.cpu.rw(LOAD_SEG, off("COUNTER2"))).toBe(0xFDF6);
    expect([m.cpu.mem[VIDEO_LIN], m.cpu.mem[VIDEO_LIN + 1]]).toEqual([0x41, 0x2F]);
  });
});
