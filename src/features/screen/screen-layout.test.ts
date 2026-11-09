import { describe, expect, it } from "vitest";
import { build, run } from "../../emulator/test-kit.ts";
import { focusRow, keyCode, screenRuns } from "./screen-layout.ts";

describe("screen layout", () => {
  it("groups characters with the same attribute into runs with CGA colours", () => {
    const { m } = build(`org 100h
    mov ax, 0B800h
    mov es, ax
    mov word ptr es:[0], 1F41h
    mov word ptr es:[2], 1F42h
    ret`);
    run(m);
    const [row] = screenRuns(m.cpu.mem, 0, 1, 3);
    expect(row[0]).toEqual({ text: "AB", className: "text-cga-15 bg-cga-1" });
    expect(row[1]).toEqual({ text: " ", className: "text-cga-7" });
    expect(focusRow(m.cpu.mem, m.cpu.lastVideo)).toBe(0);
  });

  it.each([
    [{ key: "Enter", ctrlKey: false, metaKey: false, altKey: false }, [13, 0x1C]],
    [{ key: "a", ctrlKey: false, metaKey: false, altKey: false }, [97, 0]],
    [{ key: "a", ctrlKey: true, metaKey: false, altKey: false }, null],
    [{ key: "€", ctrlKey: false, metaKey: false, altKey: false }, null],
    [{ key: "Shift", ctrlKey: false, metaKey: false, altKey: false }, null]
  ])("maps the key %j", (e, expected) => {
    expect(keyCode(e)).toEqual(expected);
  });
});
