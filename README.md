<div align="center">

# 8086 Lab

**Write 8086 assembly, run it, and watch every byte travel across the CPU.**

[![Live](https://img.shields.io/badge/live-8086--emu.pages.dev-FFE45C?style=flat-square&logo=cloudflarepages&logoColor=white&labelColor=1B2430)](https://8086-emu.pages.dev)
[![Single file](https://img.shields.io/badge/ships_as-one_HTML_file-026A60?style=flat-square&labelColor=1B2430)](#-build-and-run-locally)
[![Hardware tests](https://img.shields.io/badge/SingleStepTests_8088-2.98M_passing-026A60?style=flat-square&labelColor=1B2430)](#-verification)
[![No dependencies](https://img.shields.io/badge/runtime_deps-none-026A60?style=flat-square&labelColor=1B2430)](#-how-it-is-built)

<img src="media/8086-emu.gif" alt="8086 Lab: values travel across the board view, then a program paints colour into video memory" width="820">

</div>

8086 Lab is a browser-based 8086 emulator, assembler and debugger for students who learn the 8086 in engineering labs. It accepts the EMU8086 dialect and classic MASM/TASM programs, runs them on a CPU checked against recordings of a real 8088, and shows each instruction moving through the BIU, EU and system bus. The whole app is one HTML file that works offline.

## 🚀 Try it

Open **https://8086-emu.pages.dev** (also at https://micro-emu.pages.dev), pick an example, press **Run** or **F10** to step.

## ✨ What it does

| Area | What you get |
|---|---|
| Assembler | EMU8086 style (`org 100h`), `.model small` with `.data` / `.code`, and `data segment ... ends` MASM style; `equ`, `dup`, `offset`, `seg`, `byte ptr`, `$`, macros with `local`, `proc far` |
| `emu8086.inc` helpers | `print`, `printn`, `putc`, `gotoxy`, `scan_num`, `print_num`, `print_num_uns`, `print_string`, `clear_screen`, written from scratch (the original file is not copied) |
| CPU | Every documented 8086 instruction, including string ops with `REP`, BCD adjust, far calls and the 8088 quirks the test suite checks |
| DOS and BIOS | INT 21h (01, 02, 06-09, 0A, 0B, 25, 2A, 2C, 30, 35, 4C), INT 10h (teletype, cursor, scroll, char and attribute, write string), INT 16h, INT 1Ah; video memory at B800h with CGA colours |
| Debugger | Run at 2, 10, 200 per second or full speed, step, step back (20,000 steps), breakpoints, registers and flags with "changed" marks, stack, memory and listing views |
| Board view | The 8086 as a circuit board: packets carry real values from CS:IP through the address adder, buses, queue, decoder, ALU and memory, with a caption for every move |
| Teaching help | Assembler errors explain what is wrong, why, and the fix, in English or Hinglish (for example `MUL 5`, two memory operands, `SHL AX, 3`, a jump out of range) |
| Sharing | Copy a link that carries the program, download or open `.asm` files |

<details>
<summary>📚 Built-in examples</summary>

| Example | Shows |
|---|---|
| Hello, world | INT 21h service 09h |
| Factorial of 5 | `MUL`, `LOOP`, printing a number with the stack |
| Sum of an array | `.model small` EXE layout and `@data` |
| Bubble sort | `data segment` / `code segment` MASM style |
| Reverse a string | `PUSH` / `POP` |
| Paint video memory | `STOSW` and `REP STOSW` straight into B800h |
| Uppercase as you type | keyboard input with INT 21h service 08h |
| Add two numbers | `include 'emu8086.inc'` with `scan_num` and `print_num` |

</details>

## 🛠️ Build and run locally

Tested with Node 24 and Bun 1.4.

```bash
bun install
bun run build        # writes index.html, one self-contained file
xdg-open index.html  # or open it in any browser
```

| Script | Does |
|---|---|
| `bun run build` | Bundles `src/` (CPU, assembler, UI, styles, icons, fonts) into `index.html` |
| `bun run test` | Examples, assembler round-trip, three-way check against GNU objdump, DOS/BIOS system tests |
| `bun run test:ui` | Builds, then drives the app in Chromium and checks every board animation against real CPU state |
| `bun run test:sst` | Streams all 323 SingleStepTests 8088 files (761 MB downloaded, each deleted after its run) |

`bun run test` needs `objdump` from GNU binutils.

## 🧩 How it is built

| Path | Role |
|---|---|
| `src/core.js` | CPU (decode and execute), two-pass assembler, DOS/BIOS layer, step-back history |
| `src/app.js` | Editor, panels, CRT screen, board view and its animation planner |
| `src/examples.js` | The example programs |
| `src/style.css`, `src/shell.html`, `src/icons.svg`, `src/fonts/` | Look, markup, Hugeicons sprite, Geist fonts |
| `build.cjs` | Inlines everything (fonts as base64) into one HTML file |
| `test/` | Test suites, `coverage.asm`, the clip recorder |

## ✅ Verification

| Check | Result |
|---|---|
| SingleStepTests 8088 v2, all 323 opcode files, 3,007,000 tests | 2,981,951 pass; the other 25,049 are DIV/IDIV/AAM divide errors where only the undefined flag bits pushed on the stack differ; registers, IP, flags and all other memory match |
| Assembler and decoder vs GNU objdump, 4 random corpora | 4,504 of 4,504 instructions agree three ways (source, decoder, objdump) |
| DOS, BIOS, COM/EXE layout, step back + replay | 58 of 58 |
| Board view vs real CPU state, 71 mnemonics | 1,622 executed instructions, 10,830 moves, no mismatch |
| Examples in the browser | 8 of 8 produce the expected screen output |

## ⚠️ Limits

- The board shows fetch and execute one after the other; the real 8086 overlaps them with its prefetch queue.
- 8255, 8253 and 8259 are placeholders on the board; there are no virtual LEDs, displays or motors yet.
- Board captions are English only; the Hinglish toggle covers error messages.
- `REP` string instructions are drawn as one iteration, with the count in the caption.

## 🙏 Credits

- CPU checked against [SingleStepTests/8088](https://github.com/SingleStepTests/8088) (MIT), a test suite generated from a real 8088.
- Icons from [Hugeicons](https://hugeicons.com) free set (MIT); fonts [Geist and Geist Mono](https://github.com/vercel/geist-font) (SIL OFL 1.1, licence in `src/fonts/OFL.txt`).
- Inspired by EMU8086; no code, text or assets from it are used.

## 📄 License

Not chosen yet.
