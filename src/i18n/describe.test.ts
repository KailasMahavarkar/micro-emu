import { describe, expect, it } from "vitest";
import { describeProblem } from "./describe.ts";

describe("describeProblem", () => {
  it.each(["en", "hi"] as const)("suggests the nearest mnemonic for a typo (%s)", lang => {
    expect(describeProblem("UNKNOWN_MN", { x: "movv" }, lang).why).toContain("MOV");
  });

  it("does not suggest anything for a word far from every mnemonic", () => {
    expect(describeProblem("UNKNOWN_MN", { x: "qqqqqqq" }, "en").why).not.toContain("?");
  });

  it("names operand sizes, value ranges and lower-cases _l placeholders", () => {
    const sizes = describeProblem("SIZE_MISMATCH", { mn: "MOV", a: "AX", b: "BL", sa: 2, sb: 1 }, "en").why;
    expect(sizes).toContain("16-bit");
    expect(sizes).toContain("8-bit");
    expect(describeProblem("IMM_RANGE", { v: "300", bits: 8 }, "en").why).toContain("-128 to 255");
    expect(describeProblem("SHIFT_COUNT", { mn: "SHL", x: "AX", v: "3" }, "en").fix).toContain("shl ax, cl");
  });

  it("drops placeholders that have no argument", () => {
    expect(describeProblem("OPERANDS", {}, "en").what).not.toContain("{");
  });
});
