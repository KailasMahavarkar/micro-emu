import { describe, expect, it } from "vitest";
import { highlightLine } from "./highlight.ts";

const kinds = (line: string): string[] => highlightLine(line).filter(t => t.kind).map(t => `${t.kind}:${t.text}`);

describe("highlightLine", () => {
  it.each([
    ["start: mov ax, 0B800h ; go", ["label:start", "op:mov", "reg:ax", "number:0B800h", "comment:; go"]],
    ["msg db 'hi$', 0", ["label:msg", "dir:db", "string:'hi$'", "number:0"]],
    ["include 'emu8086.inc'", ["dir:include", "string:'emu8086.inc'"]],
    ["    printn 'ok'", ["dir:printn", "string:'ok'"]]
  ])("classifies %s", (line, expected) => {
    expect(kinds(line)).toEqual(expected);
  });

  it("keeps every character of the line", () => {
    const line = "  add [bx+si+4], cl  ; x";
    expect(highlightLine(line).map(t => t.text).join("")).toBe(line);
  });
});
