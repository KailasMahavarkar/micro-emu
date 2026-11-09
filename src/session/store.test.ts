// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SPEED_PLAN } from "./constants.ts";
import { usePrefs } from "./prefs.ts";
import { machine, useSession } from "./store.ts";
import { CUSTOM_PROGRAM, type Speed } from "./types.ts";

const LOOP = "org 100h\n    mov cx, 0FFFFh\nspin:\n    loop spin\n    ret\n";
const KEY_READ = "org 100h\n    mov ah, 8\n    int 21h\n    mov ah, 4Ch\n    int 21h\n";
const KEY_READ_INT_LINE = 2;

const load = (src: string): void => { useSession.getState().open(CUSTOM_PROGRAM, src, "test.asm"); };
const session = () => useSession.getState();

beforeEach(() => {
  vi.useFakeTimers();
  usePrefs.setState({ speed: "medium" });
});

afterEach(() => {
  session().stop();
  vi.useRealTimers();
});

describe("speed", () => {
  it("defaults to 20 instructions per second", () => {
    expect(usePrefs.getInitialState().speed).toBe("medium");
    expect(SPEED_PLAN.medium.label).toBe("20 / sec");
  });

  it.each([["slow", 2], ["normal", 10], ["medium", 20]] as const)("runs %s at about %i instructions per second", (speed: Speed, perSecond: number) => {
    usePrefs.setState({ speed });
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(3000);
    expect(machine.steps / 3).toBeGreaterThanOrEqual(perSecond - 1);
    expect(machine.steps / 3).toBeLessThanOrEqual(perSecond + 1);
  });

  it("runs 200 / sec far faster than 20 / sec", () => {
    usePrefs.setState({ speed: "fast" });
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(1000);
    expect(machine.steps).toBeGreaterThan(100);
  });

  it("applies a new speed while the program is running", () => {
    usePrefs.setState({ speed: "slow" });
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(2000);
    const slowSteps = machine.steps;
    usePrefs.setState({ speed: "medium" });
    session().applySpeed("instant");
    vi.advanceTimersByTime(2000);
    expect(machine.steps - slowSteps).toBeGreaterThanOrEqual(39);
  });

  it("switches between animated and instant running when the speed changes mid-run", () => {
    load(LOOP);
    session().runToggle("animated");
    session().applySpeed("instant");
    vi.advanceTimersByTime(1000);
    expect(session().running).toBe(true);
    expect(machine.steps).toBeGreaterThanOrEqual(19);
  });
});

describe("run, pause, step, step back, reset", () => {
  it("pause stops the clock and run continues from the same place", () => {
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(1000);
    session().runToggle("instant");
    const paused = machine.steps;
    vi.advanceTimersByTime(2000);
    expect([session().running, machine.steps]).toEqual([false, paused]);
    session().runToggle("instant");
    vi.advanceTimersByTime(1000);
    expect(machine.steps).toBeGreaterThan(paused);
  });

  it("step runs one instruction, step back undoes it, and both are ignored while running", () => {
    load(LOOP);
    session().step("instant");
    session().step("instant");
    expect(machine.steps).toBe(2);
    session().back();
    expect([machine.steps, machine.cpu.ip]).toEqual([1, 0x103]);
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    const during = machine.steps;
    session().step("instant");
    session().back();
    expect(machine.steps).toBe(during);
  });

  it("reset stops a running program and puts it back at its entry point", () => {
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(1000);
    session().reset();
    vi.advanceTimersByTime(1000);
    expect([session().running, machine.steps, machine.cpu.ip]).toEqual([false, 0, 0x100]);
  });

  it("run on a finished program starts it again", () => {
    load("org 100h\n    nop\n    ret\n");
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    expect([machine.exited, machine.steps]).toEqual([true, 3]);
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    expect([machine.exited, machine.steps]).toEqual([true, 3]);
  });

  it("choosing another program while running stops the run and loads it", () => {
    load(LOOP);
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    session().chooseProgram("hello");
    vi.advanceTimersByTime(500);
    expect([session().running, session().programId, machine.steps]).toEqual([false, "hello", 0]);
  });
});

describe("breakpoints and keys", () => {
  it("stops at a breakpoint, and a key typed for that line does not stop it there again", () => {
    load(KEY_READ);
    session().toggleBreakpoint(KEY_READ_INT_LINE);
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    expect([session().running, machine.steps]).toEqual([false, 1]);
    session().runToggle("instant");
    vi.advanceTimersByTime(500);
    expect(machine.isWaiting()).toBe(true);
    session().pressKey(0x41, 0x1E);
    vi.advanceTimersByTime(500);
    expect([machine.exited, machine.cpu.r[0] & 0xFF]).toEqual([true, 0x41]);
  });

  it("a key typed after a waiting step finishes that step", () => {
    load(KEY_READ);
    session().step("instant");
    session().step("instant");
    expect(session().pendingStep).toBe(true);
    session().pressKey(0x42, 0x30);
    expect([session().pendingStep, machine.steps, machine.cpu.r[0] & 0xFF]).toEqual([false, 2, 0x42]);
  });
});
