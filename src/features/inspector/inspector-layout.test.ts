import { describe, expect, it } from "vitest";
import { build, run } from "../../emulator/test-kit.ts";
import { changedAddresses, listingRows, memoryRows, parseAddress, stackRows } from "./inspector-layout.ts";

describe("inspector layout", () => {
  it("shows the stack top with SP marked, free rows above it and the last write highlighted", () => {
    const { m, p } = build("org 100h\n    mov ax, 1234h\n    push ax\n    nop\n    ret");
    m.step();
    const rec = m.step();
    const rows = stackRows(m.cpu, p, changedAddresses(rec));
    const sp = rows.find(r => r.role === "sp");
    expect(sp).toMatchObject({ offset: "SS:FFFC", value: "1234", changed: true });
    expect(rows.slice(0, 2).every(r => r.role === "free")).toBe(true);
  });

  it.each([
    ["0700:0100", { seg: 0x700, off: 0x100 }],
    ["b800:0h", { seg: 0xB800, off: 0 }],
    ["200h", { seg: 0x1234, off: 0x200 }],
    ["xyz", null]
  ])("parses the memory address %s", (text, expected) => {
    expect(parseAddress(text, 0x1234)).toEqual(expected);
  });

  it("dumps memory with printable ASCII and marks changed bytes", () => {
    const { m } = build("org 100h\n    mov byte ptr [200h], 'Z'\n    ret");
    const rec = m.step();
    const row = memoryRows(m.cpu, { seg: 0x700, off: 0x200 }, changedAddresses(rec))[0];
    expect(row.bytes[0]).toEqual({ text: "5A", changed: true });
    expect(row.ascii.startsWith("Z")).toBe(true);
  });

  it("marks the listing row at IP", () => {
    const { m, p } = build("org 100h\n    nop\n    ret");
    run(m, 1);
    const rows = listingRows(p, "org 100h\n    nop\n    ret", m.cpu.lin(m.cpu.s[1], m.cpu.ip));
    expect(rows.map(r => r.current)).toEqual([false, true]);
    expect(rows[1].source).toBe("ret");
  });
});
