import { describe, expect, it } from "vitest";
import { readPrefs } from "./prefs.ts";

describe("readPrefs", () => {
  it("moves users still on the old 200 / sec default to 20 / sec once", () => {
    expect(readPrefs({ speed: "fast" }, 0).speed).toBe("medium");
    expect(readPrefs({ speed: "fast" }, 1).speed).toBe("fast");
  });

  it("keeps a speed the user picked and their saved programs", () => {
    const prefs = readPrefs({ speed: "slow", lang: "hi", drafts: { custom: "nop", sort: 7 } }, 0);
    expect(prefs).toMatchObject({ speed: "slow", lang: "hi", drafts: { custom: "nop" } });
  });

  it.each([null, "x", { speed: "warp", lang: "fr", boardSpeed: "9" }])("falls back to defaults for unreadable storage %j", raw => {
    expect(readPrefs(raw, 0)).toMatchObject({ speed: "medium", lang: "en", boardSpeed: 1 });
  });
});
