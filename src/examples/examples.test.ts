import { describe, expect, it } from "vitest";
import { build, run, screenRows, type } from "../emulator/test-kit.ts";
import { EXAMPLES, EXAMPLE_IDS, type ExampleId } from "./index.ts";

const EXPECTED: Record<ExampleId, { keys: string; out: string }> = {
  hello: { keys: "", out: "Hello from the 8086!" },
  factorial: { keys: "", out: "120" },
  sum: { keys: "", out: "Sum = 75" },
  sort: { keys: "", out: "Sorted: 3 9 12 23 45 56 78" },
  reverse: { keys: "", out: "BAL 6808" },
  video: { keys: "", out: "8086 LAB IS ALIVE" },
  upper: { keys: "abc Z1\r", out: "Type something: ABC Z1" },
  macros: { keys: "12\r30\r", out: "Sum = 42" }
};
const REPLAY_LIMIT = 3000;

const fingerprint = (m: ReturnType<typeof build>["m"]): string => {
  let h = 2166136261;
  for (const b of m.cpu.mem) h = Math.imul(h ^ b, 16777619);
  return `${h >>> 0}|${[...m.cpu.r].join()}|${[...m.cpu.s].join()}|${m.cpu.ip}|${m.cpu.flags}`;
};

describe.each(EXAMPLE_IDS)("example %s", id => {
  it("runs to completion and prints its result", () => {
    const { m } = build(EXAMPLES[id].src);
    type(m, EXPECTED[id].keys);
    run(m, 200_000);
    expect(m.exited || m.cpu.halted).toBe(true);
    expect(m.notice?.fatal ?? false).toBe(false);
    expect(screenRows(m).join("\n")).toContain(EXPECTED[id].out);
  });

  it("steps back to every earlier state and replays identically", () => {
    const { m } = build(EXAMPLES[id].src);
    type(m, "12\r30\rabc\r");
    const seq = [fingerprint(m)];
    while (!m.finished() && seq.length < REPLAY_LIMIT) {
      m.step();
      if (m.isWaiting()) break;
      seq.push(fingerprint(m));
    }
    for (let i = seq.length - 1; i > 0; i--) {
      m.back();
      expect(fingerprint(m)).toBe(seq[i - 1]);
    }
    expect(m.keyPos).toBe(0);
    const replay = [fingerprint(m)];
    while (!m.finished() && replay.length < seq.length) {
      m.step();
      if (m.isWaiting()) break;
      replay.push(fingerprint(m));
    }
    expect(replay).toEqual(seq);
  });
});
