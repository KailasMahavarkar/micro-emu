import { describe, expect, it } from "vitest";
import { shareUrl, sourceFromHash } from "./share.ts";

describe("share links", () => {
  it.each(["mov ax, 1\n  int 21h ; done", "db 'héllo', 0 ; ünïcode ✓", ""])("round-trips %j through the URL hash", src => {
    const url = shareUrl("https://micro-emu.pages.dev/?view=board#old", src);
    expect(url.startsWith("https://micro-emu.pages.dev/?view=board#src=")).toBe(true);
    expect(sourceFromHash(new URL(url).hash)).toBe(src);
  });

  it("rejects a hash that is not valid text", () => {
    expect(sourceFromHash("#src=__8")).toBeNull();
    expect(sourceFromHash("#other=abc")).toBeNull();
  });
});
