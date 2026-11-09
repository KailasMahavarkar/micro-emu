import { describe, expect, it } from "vitest";
import { SPEED_PLAN } from "../../session/constants.ts";
import { HOP_GAP_MS, HOP_MS, timeline, type SlotKind } from "./timeline.ts";

const FETCH_AND_MOV: SlotKind[] = ["hop", "hop", "hop", "hop", "hop"];
const WITH_NOTE: SlotKind[] = ["hop", "hop", "hop", "hop", "note"];

describe("board timeline", () => {
  it.each([["slow", 2], ["normal", 10], ["medium", 20]] as const)("fits one instruction into 1/%s second when running (%i per second)", (speed, perSecond) => {
    const msPerInstruction = SPEED_PLAN[speed].delay;
    for (const kinds of [FETCH_AND_MOV, WITH_NOTE, ["hop"] as SlotKind[]]) {
      const t = timeline(kinds, { kind: "run", msPerInstruction }, 1);
      expect(t.end + t.pause).toBeCloseTo(1000 / perSecond);
      expect(t.slots.every(s => s.start + s.travel <= t.end + 1e-9)).toBe(true);
    }
  });

  it("plays hops back to back without overlap when running", () => {
    const { slots } = timeline(FETCH_AND_MOV, { kind: "run", msPerInstruction: 100 }, 3);
    slots.slice(1).forEach((s, i) => { expect(s.start).toBeCloseTo(slots[i].start + slots[i].travel); });
  });

  it("ignores the board slider when running and uses it when stepping", () => {
    expect(timeline(FETCH_AND_MOV, { kind: "run", msPerInstruction: 500 }, 0.25)).toEqual(timeline(FETCH_AND_MOV, { kind: "run", msPerInstruction: 500 }, 3));
    const slow = timeline(FETCH_AND_MOV, { kind: "step" }, 1), fast = timeline(FETCH_AND_MOV, { kind: "step" }, 2);
    expect(slow.slots[0].travel).toBe(HOP_MS);
    expect(slow.slots[1].start).toBe(HOP_MS + HOP_GAP_MS);
    expect(fast.end).toBeCloseTo(slow.end / 2);
  });

  it("still finishes on time when an instruction has nothing to animate", () => {
    expect(timeline([], { kind: "run", msPerInstruction: 50 }, 1).end).toBe(50);
  });
});
