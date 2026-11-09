"use strict";

const $ = id => document.getElementById(id);
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const LH = 24;
const ASSEMBLE_DEBOUNCE_MS = 250;
const TICK_BUDGET_MS = 12;
const RENDER_EVERY_MS = 120;
const HOP_MS = 560;
const HOP_GAP_MS = 80;
const BOARD_PAUSE_MS = 280;
const CAPTION_ONLY_MS = 700;
const STACK_FREE_ROWS = 2;
const STACK_SHOW_ROWS = 14;
const MEM_ROWS = 16;
const LISTING_BYTES = 6;
const CRT_CHAR_RATIO = 0.602;
const CRT_FONT_MIN = 8;
const CRT_FONT_MAX = 15;
const MINI_ROWS = 9;
const MINI_COLS = 40;
const TOAST_MS = 1800;
const STORE = { src: "lab8086.src.", ex: "lab8086.example", lang: "lab8086.lang", view: "lab8086.view", speed: "lab8086.speed" };
const SPEEDS = { slow: { delay: 500, per: 1 }, normal: { delay: 100, per: 1 }, fast: { delay: 16, per: 3 }, max: { delay: 0, per: Infinity } };
const CGA = ["#000000", "#0000AA", "#00AA00", "#00AAAA", "#AA0000", "#AA00AA", "#AA5500", "#AAAAAA", "#555555", "#5555FF", "#55FF55", "#55FFFF", "#FF5555", "#FF55FF", "#FFFF55", "#FFFFFF"];
const CP437 = Array.from(" ☺☻♥♦♣♠•◘○◙♂♀♪♫☼►◄↕‼¶§▬↨↑↓→←∟↔▲▼" +
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~⌂" +
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ");
const REG_GROUPS = [["General", ["AX", "BX", "CX", "DX"]], ["Pointers", ["IP", "SP", "BP", "SI", "DI"]], ["Segment", ["CS", "DS", "ES", "SS"]]];
const SPLIT = ["AX", "BX", "CX", "DX"];
const FLAG_FULL = { CF: "Carry", PF: "Parity", AF: "Auxiliary carry", ZF: "Zero", SF: "Sign", TF: "Trap", IF: "Interrupt enable", DF: "Direction", OF: "Overflow" };
const REGISTER_WORDS = new Set([...REG16, ...REG8, ...SREG]);
const OPSYM = { ADD: "+", ADC: "+ CF +", SUB: "-", SBB: "- CF -", CMP: "-", AND: "and", OR: "or", XOR: "xor", TEST: "and" };
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)");

const MSG = {
  TWO_MEM: {
    en: { what: "{mn} can't use two memory operands.", why: "The 8086 reads at most one memory operand per instruction.", fix: "Load one of them into a register first:\n    mov ax, <first>\n    {mn_l} <second>, ax" },
    hi: { what: "{mn} mein dono operands memory nahi ho sakte.", why: "8086 ek instruction mein sirf ek memory operand padh sakta hai.", fix: "Pehle ek value ko register mein lao:\n    mov ax, <first>\n    {mn_l} <second>, ax" }
  },
  SIZE_MISMATCH: {
    en: { what: "{a} and {b} are different sizes.", why: "{a} is {sa} and {b} is {sb}. Both sides of {mn} must be the same size.", fix: "Use a matching pair, for example AL with BL, or AX with BX." },
    hi: { what: "{a} aur {b} ka size alag hai.", why: "{a} {sa} hai aur {b} {sb}. {mn} ke dono taraf same size chahiye.", fix: "Matching pair lo, jaise AL ke saath BL, ya AX ke saath BX." }
  },
  SIZE_UNKNOWN: {
    en: { what: "{mn} can't tell if this is a byte or a word.", why: "Neither operand says how big it is.", fix: "Write BYTE PTR or WORD PTR:\n    {mn_l} byte ptr [bx], 5" },
    hi: { what: "{mn} ko pata nahi ye byte hai ya word.", why: "Kisi bhi operand mein size nahi likha hai.", fix: "BYTE PTR ya WORD PTR likho:\n    {mn_l} byte ptr [bx], 5" }
  },
  SEG_IMM: {
    en: { what: "A segment register can't take a number directly.", why: "The 8086 has no MOV {x}, number instruction.", fix: "Go through AX:\n    mov ax, value\n    mov {x_l}, ax" },
    hi: { what: "Segment register mein seedha number nahi daal sakte.", why: "8086 mein MOV {x}, number jaisa instruction hi nahi hai.", fix: "AX ke through bhejo:\n    mov ax, value\n    mov {x_l}, ax" }
  },
  SEG_SEG: {
    en: { what: "MOV can't copy one segment register into another.", why: "The 8086 has no segment-to-segment MOV.", fix: "Go through AX:\n    mov ax, ds\n    mov es, ax" },
    hi: { what: "Ek segment register se doosre mein seedha MOV nahi hota.", why: "8086 mein segment se segment MOV nahi hai.", fix: "AX ke through bhejo:\n    mov ax, ds\n    mov es, ax" }
  },
  MOV_CS: {
    en: { what: "CS can't be loaded with MOV.", why: "Changing CS alone would make the next instruction come from the wrong place.", fix: "Use a far JMP or a far CALL to change CS." },
    hi: { what: "CS ko MOV se nahi badal sakte.", why: "Sirf CS badalne se agla instruction galat jagah se aayega.", fix: "CS badalna ho to far JMP ya far CALL use karo." }
  },
  MUL_IMM: {
    en: { what: "{mn} can't take a number directly.", why: "On the 8086, {mn} works with a register or a memory value, never a typed-in number.", fix: "Put the number in a register first:\n    mov bx, {v}\n    {mn_l} bx" },
    hi: { what: "{mn} ko seedha number nahi de sakte.", why: "8086 mein {mn} register ya memory value ke saath chalta hai, seedhe likhe number ke saath nahi.", fix: "Pehle number ko register mein daalo:\n    mov bx, {v}\n    {mn_l} bx" }
  },
  SHIFT_COUNT: {
    en: { what: "The 8086 shifts by 1 or by CL only.", why: "Shifting by {v} in one instruction arrived with the 80186.", fix: "Put the count in CL:\n    mov cl, {v}\n    {mn_l} {x_l}, cl" },
    hi: { what: "8086 sirf 1 ya CL se shift karta hai.", why: "{v} se ek saath shift karna 80186 mein aaya tha.", fix: "Count ko CL mein daalo:\n    mov cl, {v}\n    {mn_l} {x_l}, cl" }
  },
  PUSH_IMM: {
    en: { what: "The 8086 can't PUSH a number.", why: "PUSH with a number arrived with the 80186.", fix: "Use a register:\n    mov ax, {v}\n    push ax" },
    hi: { what: "8086 pe number seedha PUSH nahi hota.", why: "Number PUSH karna 80186 mein aaya tha.", fix: "Register use karo:\n    mov ax, {v}\n    push ax" }
  },
  PUSH_8: {
    en: { what: "{mn} works on 16-bit values only.", why: "The stack holds words, not bytes.", fix: "Use the 16-bit register:\n    {mn_l} {y_l}" },
    hi: { what: "{mn} sirf 16-bit values ke saath chalta hai.", why: "Stack mein words rehte hain, bytes nahi.", fix: "16-bit register use karo:\n    {mn_l} {y_l}" }
  },
  POP_CS: {
    en: { what: "POP CS is not allowed.", why: "Changing CS this way breaks the next instruction fetch.", fix: "Use RETF or a far JMP." },
    hi: { what: "POP CS allowed nahi hai.", why: "Is tarah CS badalne se agla instruction fetch toot jaata hai.", fix: "RETF ya far JMP use karo." }
  },
  BAD_ADDR: {
    en: { what: "This is not a valid 8086 address.", why: "Inside [ ] the 8086 allows only BX or BP, plus SI or DI, plus a number.", fix: "For example: [bx]  [bp+si]  [bx+di+4]  [si+2]" },
    hi: { what: "Ye 8086 ka valid address nahi hai.", why: "[ ] ke andar sirf BX ya BP, plus SI ya DI, plus ek number aa sakta hai.", fix: "Jaise: [bx]  [bp+si]  [bx+di+4]  [si+2]" }
  },
  UNKNOWN_MN: {
    en: { what: "'{x}' is not an 8086 instruction.", why: "Check the spelling.{sugg}", fix: "" },
    hi: { what: "'{x}' 8086 ka instruction nahi hai.", why: "Spelling check karo.{sugg}", fix: "" }
  },
  UNKNOWN_SYM: {
    en: { what: "'{x}' is not defined.", why: "There is no label, variable or EQU called {x}.", fix: "Define it, for example:\n{x_l}:          (a label)\n{x_l} db 0      (a variable)" },
    hi: { what: "'{x}' kahin define nahi hai.", why: "{x} naam ka koi label, variable ya EQU nahi mila.", fix: "Isko define karo, jaise:\n{x_l}:          (label)\n{x_l} db 0      (variable)" }
  },
  JUMP_RANGE: {
    en: { what: "{mn} can't reach {label}: it is {d} bytes away.", why: "Conditional jumps on the 8086 reach only 128 bytes back or 127 forward.", fix: "Jump over a JMP instead:\n    {inv_l} skip\n    jmp {label_l}\nskip:" },
    hi: { what: "{mn} {label} tak nahi pahunch sakta: wo {d} bytes door hai.", why: "8086 pe conditional jump sirf 128 bytes peeche ya 127 aage ja sakta hai.", fix: "Ulta jump lagao aur JMP use karo:\n    {inv_l} skip\n    jmp {label_l}\nskip:" }
  },
  IMM_RANGE: {
    en: { what: "{v} doesn't fit in {bits} bits.", why: "A {bits}-bit operand holds {range}.", fix: "Use a 16-bit register, or a smaller number." },
    hi: { what: "{v} {bits} bits mein fit nahi hota.", why: "{bits}-bit operand mein {range} tak hi aata hai.", fix: "16-bit register lo, ya chhota number." }
  },
  DUP_LABEL: {
    en: { what: "'{x}' is defined twice.", why: "Every label and variable needs its own name.", fix: "Rename one of them." },
    hi: { what: "'{x}' do baar define hua hai.", why: "Har label aur variable ka naam alag hona chahiye.", fix: "Kisi ek ka naam badlo." }
  },
  RESERVED_NAME: {
    en: { what: "'{x}' is a reserved word, so it can't be a name.", why: "Register and instruction names are taken.", fix: "Pick another name, for example {x_l}_1." },
    hi: { what: "'{x}' reserved word hai, naam nahi ban sakta.", why: "Register aur instruction ke naam pehle se use mein hain.", fix: "Doosra naam lo, jaise {x_l}_1." }
  },
  DEST_IMM: {
    en: { what: "{mn} can't write its result into a number.", why: "The first operand is where the result goes, so it must be a register or memory.", fix: "Swap the operands, or use a register." },
    hi: { what: "{mn} number mein result nahi likh sakta.", why: "Pehla operand result ki jagah hai, isliye wo register ya memory hona chahiye.", fix: "Operands ki jagah badlo, ya register lo." }
  },
  SEG_ALU: {
    en: { what: "{mn} can't work on segment registers.", why: "Segment registers only move; they don't do arithmetic.", fix: "Copy into AX, work there, copy back:\n    mov ax, ds\n    {mn_l} ax, 1\n    mov ds, ax" },
    hi: { what: "{mn} segment registers pe kaam nahi karta.", why: "Segment registers sirf move hote hain, unpe arithmetic nahi hota.", fix: "AX mein copy karo, wahan kaam karo, wapas copy karo:\n    mov ax, ds\n    {mn_l} ax, 1\n    mov ds, ax" }
  },
  OPERANDS: {
    en: { what: "{mn} doesn't accept these operands.", why: "This combination of operands doesn't exist on the 8086.", fix: "" },
    hi: { what: "{mn} ye operands accept nahi karta.", why: "8086 pe operands ka ye combination hota hi nahi.", fix: "" }
  },
  OPERAND_COUNT: {
    en: { what: "{mn} needs {n} operand(s), found {got}.", why: "", fix: "" },
    hi: { what: "{mn} ko {n} operand chahiye, {got} mile.", why: "", fix: "" }
  },
  JUMP_TARGET: {
    en: { what: "{mn} needs a label to jump to.", why: "", fix: "For example: {mn_l} done" },
    hi: { what: "{mn} ko jump karne ke liye label chahiye.", why: "", fix: "Jaise: {mn_l} done" }
  },
  IO_ACC: {
    en: { what: "{mn} works with AL or AX, and a port number or DX.", why: "", fix: "in al, 60h\n    out dx, al" },
    hi: { what: "{mn} sirf AL/AX aur port number ya DX ke saath chalta hai.", why: "", fix: "in al, 60h\n    out dx, al" }
  },
  SYNTAX: {
    en: { what: "This line can't be read.", why: "Near: {x}", fix: "" },
    hi: { what: "Ye line samajh nahi aayi.", why: "Yahan: {x}", fix: "" }
  },
  NO_CODE: {
    en: { what: "There is no code to run yet.", why: "", fix: "Pick an example from the list to start." },
    hi: { what: "Abhi chalane ke liye koi code nahi hai.", why: "", fix: "Shuru karne ke liye list se ek example chuno." }
  },
  RUNAWAY: {
    en: { what: "The CPU ran past your code (now at {ip}).", why: "A program must end on purpose, or the CPU runs into whatever bytes come next.", fix: "End the program with:\n    mov ah, 4Ch\n    int 21h" },
    hi: { what: "CPU aapke code ke aage nikal gaya (ab {ip} pe).", why: "Program ko khud khatam karna padta hai, warna CPU aage ke bytes chalane lagta hai.", fix: "Program ke end mein likho:\n    mov ah, 4Ch\n    int 21h" }
  },
  DIV0: {
    en: { what: "Divide overflow.", why: "DIV or IDIV divided by zero, or the answer was too big for the register.", fix: "Check the divisor, and clear DX (word divide) or AH (byte divide) before dividing." },
    hi: { what: "Divide overflow.", why: "DIV/IDIV ne 0 se divide kiya, ya answer register mein fit nahi hua.", fix: "Divisor check karo, aur divide se pehle DX (word) ya AH (byte) ko 0 karo." }
  },
  UNSUPPORTED_INT: {
    en: { what: "INT {n}h function {ah}h isn't supported here yet.", why: "The program kept running; that call did nothing.", fix: "" },
    hi: { what: "INT {n}h ka function {ah}h abhi supported nahi hai.", why: "Program chalta raha; us call ne kuch nahi kiya.", fix: "" }
  }
};
const SUGGEST = { en: s => ` Did you mean ${s}?`, hi: s => ` Kya aapka matlab ${s} tha?` };
const UI_TEXT = {
  en: { more: "Also:", line: "Line" },
  hi: { more: "Aur bhi:", line: "Line" }
};

const m = new Machine();
const ui = {
  lang: localStorage.getItem(STORE.lang) || "en",
  view: localStorage.getItem(STORE.view) || "panels",
  speed: localStorage.getItem(STORE.speed) || "fast",
  tab: "stack",
  example: localStorage.getItem(STORE.ex) || "factorial",
  breakpoints: new Set(),
  running: false, timer: null, skipBreak: false, pendingStep: false,
  prog: null, lastSrc: null, asmTimer: null,
  errLines: new Set(), curLine: -1, lastRender: 0,
  anim: null, lastPlan: null, boardSpeed: 1, showFetch: true,
  mem: null, screenCache: "", miniCache: "", modal: false
};

const srcEl = $("src"), hlEl = $("hl"), gutterEl = $("gutter"), codeEl = $("code"), editorEl = $("editor");
let hlLines = [], gutterLines = [];

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function message(code, args = {}) {
  const t = MSG[code] || MSG.SYNTAX, L = t[ui.lang] || t.en;
  const a = { ...args };
  if (a.bits) a.range = a.bits === 8 ? "-128 to 255" : "-32768 to 65535";
  if (code === "UNKNOWN_MN" && a.x) {
    const up = a.x.toUpperCase();
    let best = null, bestD = 3;
    for (const mn of MNEMONICS) { const d = levenshtein(up, mn); if (d < bestD) { bestD = d; best = mn; } }
    a.sugg = best ? SUGGEST[ui.lang](best) : "";
  }
  const fill = s => (s || "").replace(/\{(\w+?)(_l)?\}/g, (_, k, low) => {
    let v = a[k];
    if (k === "sa" || k === "sb") v = v === 1 ? "8-bit" : v === 2 ? "16-bit" : "32-bit";
    if (v === undefined) return "";
    v = String(v);
    return low ? v.toLowerCase() : v;
  });
  return { what: fill(L.what), why: fill(L.why), fix: fill(L.fix) };
}

function hlLine(t) {
  const re = /(;.*$)|('[^']*'?|"[^"]*"?)|(\b[0-9][0-9A-Fa-f]*[hH]\b|\b0[xX][0-9A-Fa-f]+\b|\b[01]+[bB]\b|\b[0-9]+\b)|([A-Za-z_@?.$#][\w@?.$#]*)/g;
  let out = "", last = 0, first = true, m2;
  while ((m2 = re.exec(t))) {
    out += esc(t.slice(last, m2.index));
    last = re.lastIndex;
    const s = m2[0];
    let cls = "";
    if (m2[1]) cls = "t-com";
    else if (m2[2]) cls = "t-str";
    else if (m2[3]) cls = "t-num";
    else {
      const up = s.toUpperCase(), after = t.slice(last).trimStart();
      if (REGISTER_WORDS.has(up)) cls = "t-reg";
      else if (first && after.startsWith(":")) cls = "t-lab";
      else if (MNEMONICS.has(up)) cls = "t-op";
      else if (DIRECTIVE_WORDS.has(up) || up.startsWith(".") || up.startsWith("#") || /^(DEFINE_|PRINTN?$|PUTC$|GOTOXY$)/.test(up)) cls = "t-dir";
      else if (first && /^(DB|DW|DD|EQU|PROC|ENDP|SEGMENT|ENDS|MACRO|LABEL)\b/i.test(after)) cls = "t-lab";
      first = false;
    }
    out += cls ? `<span class="${cls}">${esc(s)}</span>` : esc(s);
  }
  return out + esc(t.slice(last));
}

function paintSource() {
  const lines = srcEl.value.split("\n");
  hlEl.innerHTML = lines.map(l => `<span class="ln">${hlLine(l) || " "}</span>`).join("");
  hlLines = [...hlEl.children];
  gutterEl.innerHTML = lines.map((_, i) =>
    `<div class="gl" data-line="${i}"><button class="bp" data-line="${i}" aria-pressed="${ui.breakpoints.has(i)}" aria-label="Breakpoint on line ${i + 1}" tabindex="-1"></button><span class="no">${i + 1}</span></div>`).join("");
  gutterLines = [...gutterEl.children];
  const widest = lines.reduce((a, l) => Math.max(a, l.replace(/\t/g, "        ").length), 0);
  codeEl.style.width = `calc(${widest + 4}ch + 32px)`;
  codeEl.style.height = `${lines.length * LH + 16}px`;
  ui.markedCur = -1;
  ui.markedErr = new Set();
  markLines();
}

function markLines() {
  const setCls = (i, cls, on) => {
    if (hlLines[i]) hlLines[i].classList.toggle(cls, on);
    if (gutterLines[i]) gutterLines[i].classList.toggle(cls, on);
  };
  for (const i of ui.markedErr) setCls(i, "err", false);
  for (const i of ui.errLines) setCls(i, "err", true);
  ui.markedErr = new Set(ui.errLines);
  if (ui.markedCur !== ui.curLine) {
    if (ui.markedCur >= 0 && gutterLines[ui.markedCur]) { setCls(ui.markedCur, "cur", false); gutterLines[ui.markedCur].querySelector(".no").textContent = ui.markedCur + 1; }
    if (ui.curLine >= 0 && gutterLines[ui.curLine]) { setCls(ui.curLine, "cur", true); gutterLines[ui.curLine].querySelector(".no").textContent = "▸"; }
    ui.markedCur = ui.curLine;
  }
}

function scrollToLine(line) {
  if (line < 0) return;
  const top = line * LH + 8, h = editorEl.clientHeight;
  if (top < editorEl.scrollTop + LH || top > editorEl.scrollTop + h - 2 * LH) editorEl.scrollTop = Math.max(0, top - h / 3);
}

function saveSource() { localStorage.setItem(STORE.src + ui.example, srcEl.value); }

function onSourceInput() {
  paintSource();
  saveSource();
  clearTimeout(ui.asmTimer);
  ui.asmTimer = setTimeout(() => assembleNow(false), ASSEMBLE_DEBOUNCE_MS);
}

function setSource(text) { srcEl.value = text; paintSource(); saveSource(); assembleNow(true); editorEl.scrollTop = 0; }

function assembleNow(force) {
  const src = srcEl.value;
  if (!force && src === ui.lastSrc && ui.prog) return ui.prog;
  stopRun();
  const prog = assemble(src);
  ui.prog = prog;
  ui.lastSrc = src;
  ui.errLines = new Set(prog.errors.map(e => e.line));
  ui.mem = null;
  ui.lastPlan = null;
  if (!prog.errors.length) m.load(prog);
  $("modeHint").textContent = prog.mode === "com" ? ".COM program, ORG 100h" : ".EXE program, segments";
  render(true);
  return prog;
}

function ready() {
  const prog = assembleNow(false);
  if (!prog || prog.errors.length) { render(); return false; }
  if (m.done) { m.load(prog); ui.lastPlan = null; }
  return true;
}

function linIP() { return m.cpu.lin(m.cpu.s[1], m.cpu.ip); }

function breakpointAddrs() {
  const set = new Set();
  if (!ui.prog) return set;
  for (const line of ui.breakpoints) for (const a of ui.prog.addrsOfLine.get(line) || []) set.add(a);
  return set;
}

function stopRun() {
  ui.running = false;
  clearTimeout(ui.timer);
  ui.timer = null;
  cancelAnim();
}

function runToggle() {
  if (ui.running) { stopRun(); render(); return; }
  if (!ready()) return;
  ui.running = true;
  ui.skipBreak = true;
  ui.pendingStep = false;
  if (animatedRun()) boardPlay();
  else ui.timer = setTimeout(runTick, 0);
  render();
}

function animatedRun() { return ui.view === "board" && !REDUCED.matches && (ui.speed === "slow" || ui.speed === "normal"); }

function runTick() {
  ui.timer = null;
  if (!ui.running) return;
  const sp = SPEEDS[ui.speed], t0 = performance.now(), bps = breakpointAddrs();
  let n = 0;
  while (n < sp.per) {
    if (m.done) { ui.running = false; break; }
    if (!ui.skipBreak && bps.has(linIP())) { ui.running = false; break; }
    ui.skipBreak = false;
    m.step(false);
    n++;
    if (m.waiting) { waitForKey(); break; }
    if (m.breakHit) { ui.running = false; break; }
    if (performance.now() - t0 > TICK_BUDGET_MS) break;
  }
  if (m.done) ui.running = false;
  if (ui.running && !m.waiting) ui.timer = setTimeout(runTick, sp.delay);
  const now = performance.now();
  if (!ui.running || m.waiting || ui.speed !== "max" || now - ui.lastRender > RENDER_EVERY_MS) render(true);
}

function doStep() {
  if (ui.running) return;
  if (!ready()) return;
  cancelAnim();
  ui.pendingStep = false;
  if (ui.view === "board") { boardStep(false); return; }
  m.step(true);
  if (m.waiting) { ui.pendingStep = true; waitForKey(); }
  render(true);
}

function doBack() {
  if (ui.running) return;
  cancelAnim();
  if (m.back()) ui.lastPlan = null;
  render(true);
}

function doReset() {
  stopRun();
  ui.pendingStep = false;
  if (ui.prog && !ui.prog.errors.length) m.load(ui.prog);
  ui.lastPlan = null;
  render(true);
}

function waitForKey() {
  const target = ui.modal ? $("bigCrt") : ui.view === "panels" ? $("crt") : null;
  if (target && document.activeElement !== srcEl) target.focus({ preventScroll: true });
}

function keyFrom(e) {
  const special = { Enter: [13, 0x1C], Backspace: [8, 0x0E], Escape: [27, 0x01], Tab: [9, 0x0F], ArrowUp: [0, 0x48], ArrowDown: [0, 0x50], ArrowLeft: [0, 0x4B], ArrowRight: [0, 0x4D], Delete: [0, 0x53], Home: [0, 0x47], End: [0, 0x4F] };
  if (special[e.key]) return special[e.key];
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { const c = e.key.charCodeAt(0); return c < 256 ? [c, 0] : null; }
  return null;
}

function onScreenKey(e) {
  if (e.key === "F5" || e.key === "F10") return;
  const k = keyFrom(e);
  if (!k) return;
  e.preventDefault();
  m.pressKey(k[0], k[1]);
  if (!m.waiting && !ui.pendingStep) { render(); return; }
  if (ui.running) {
    m.waiting = false;
    if (animatedRun()) boardPlay();
    else runTick();
  } else if (ui.pendingStep) doStep();
}

function screenRowsHtml(r0, r1, c1) {
  const mem = m.cpu.mem, rows = [];
  for (let r = r0; r < r1; r++) {
    let html = "", run = "", attr = -1;
    const flush = () => {
      if (!run) return;
      const fg = CGA[attr & 15], bg = (attr >> 4) & 7;
      html += `<span style="color:${fg}${bg ? `;background:${CGA[bg]}` : ""}">${run}</span>`;
      run = "";
    };
    for (let c = 0; c < c1; c++) {
      const o = VIDEO_LIN + (r * COLS + c) * 2, a = mem[o + 1];
      if (a !== attr) { flush(); attr = a; }
      run += esc(CP437[mem[o]]);
    }
    flush();
    rows.push(html);
  }
  return rows.join("\n");
}

function cursorPos() { return { row: m.cpu.mem[(BIOS_SEG << 4) + CURSOR_ROW], col: m.cpu.mem[(BIOS_SEG << 4) + CURSOR_COL] }; }
function focusRow() {
  const last = m.cpu.lastVideo;
  return last === null || last === undefined ? cursorPos().row : Math.floor((last - VIDEO_LIN) / (COLS * 2));
}

function refreshScreenCache() {
  if (!m.cpu.videoDirty && ui.screenCache) return;
  ui.screenCache = screenRowsHtml(0, ROWS, COLS);
  const row = focusRow(), start = Math.max(0, Math.min(ROWS - MINI_ROWS, row - MINI_ROWS + 3));
  ui.miniCache = screenRowsHtml(start, start + MINI_ROWS, MINI_COLS);
  m.cpu.videoDirty = false;
}

function paintCrt(el, follow) {
  const { row, col } = cursorPos(), fs = parseFloat(el.style.fontSize) || 12;
  el.innerHTML = (m.waiting ? `<span class="askkey">${ui.lang === "hi" ? "Key dabao" : "Press a key"}</span>` : "") + ui.screenCache +
    `<span class="cursor" style="left:calc(${col}ch + 12px);top:calc(${row * 1.25 + 1.05}em + 8px);width:1ch"></span>`;
  el.classList.toggle("waiting", m.waiting);
  if (follow) {
    const y = focusRow() * fs * 1.25;
    if (y < el.scrollTop || y > el.scrollTop + el.clientHeight - fs * 2.5) el.scrollTop = Math.max(0, y - el.clientHeight / 2);
  }
}

function fitCrt(el, maxW, maxH) {
  const byW = (maxW - 24) / (COLS * CRT_CHAR_RATIO), byH = maxH ? (maxH - 16) / (ROWS * 1.25) : Infinity;
  el.style.fontSize = `${Math.max(CRT_FONT_MIN, Math.min(CRT_FONT_MAX, byW, byH))}px`;
}

function renderScreen() {
  refreshScreenCache();
  if (ui.view === "panels") paintCrt($("crt"), true);
  if (ui.modal) paintCrt($("bigCrt"), false);
  $("screenHint").textContent = m.waiting ? (ui.lang === "hi" ? "Key ka intezaar: yahan click karke type karo" : "Waiting for a key: click here and type") : "80 x 25 text mode";
}

function regValues(snap) {
  const v = {};
  REG16.forEach((r, i) => { v[r] = snap.r[i]; });
  SREG.forEach((r, i) => { v[r] = snap.s[i]; });
  v.IP = snap.ip;
  return v;
}
function liveSnap() { return { r: m.cpu.r, s: m.cpu.s, ip: m.cpu.ip, flags: m.cpu.flags }; }

function renderRegs(prevSnap) {
  const cur = regValues(liveSnap()), prev = prevSnap ? regValues(prevSnap) : null;
  const cell = name => {
    const v = cur[name], changed = prev && prev[name] !== v, split = SPLIT.includes(name);
    return `<div class="reg"><div class="top"><span class="n">${name}</span><span class="v${changed ? " mark" : ""}">${hex(v)}</span>${split ? `<span class="dec">${v}</span>` : ""}</div>` +
      (split ? `<div class="d">${name[0]}H ${hex(v >> 8, 2)} &nbsp;${name[0]}L ${hex(v & 0xFF, 2)}</div>` : "") + "</div>";
  };
  $("regs").innerHTML = REG_GROUPS.map(([title, names]) => `<div class="reg-row" style="--cols:${names.length}"><span class="reg-group">${title}</span>${names.map(cell).join("")}</div>`).join("");
  const fl = m.cpu.flags;
  $("flags").innerHTML = '<span class="reg-group">Flags</span>' + FLAG_NAMES.map(f => {
    const on = fl & F[f] ? 1 : 0, was = prevSnap ? (prevSnap.flags & F[f] ? 1 : 0) : on;
    return `<div class="flag" title="${FLAG_FULL[f]} flag"><span class="n">${f}</span><span class="v${on ? " on" : ""}${was !== on ? " mark" : ""}">${on}</span></div>`;
  }).join("");
  const diffs = prev ? [
    ...Object.keys(cur).filter(n => prev[n] !== cur[n]).map(n => `<code>${n} ${hex(prev[n])} &rarr; ${hex(cur[n])}</code>`),
    ...FLAG_NAMES.filter(f => (prevSnap.flags ^ fl) & F[f]).map(f => `<code>${f} ${prevSnap.flags & F[f] ? 1 : 0} &rarr; ${fl & F[f] ? 1 : 0}</code>`)
  ] : [];
  $("delta").innerHTML = diffs.length ? `Last step changed ${diffs.join(" &middot; ")}`
    : prev ? "The last step changed no registers or flags."
    : "Nothing has run yet. Press Step to run one instruction.";
}

function changedAddrs(rec) {
  const s = new Set();
  if (rec) for (let i = 0; i < rec.log.length; i += 2) s.add(rec.log[i]);
  return s;
}

function defaultMem() {
  const p = ui.prog;
  if (!p || p.mode === "com") return { seg: m.cpu.s[3], off: 0x100 };
  const data = p.segments.find(s => /DATA/.test(s.name));
  return { seg: data ? data.base : m.cpu.s[3], off: 0 };
}

function renderView(rec) {
  document.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === ui.tab));
  $("addrBox").hidden = ui.tab !== "memory";
  const c = m.cpu, changed = changedAddrs(rec), view = $("view");
  if (ui.tab === "stack") {
    const sp = c.r[4], ss = c.s[2];
    const top = ui.prog && ui.prog.mode === "exe" ? (ui.prog.sp - 2) & 0xFFFF : 0xFFFE;
    const rows = [];
    const first = Math.max(sp - 2 * STACK_FREE_ROWS, 0);
    for (let a = first, k = 0; a <= Math.max(top, sp) && k < STACK_SHOW_ROWS + STACK_FREE_ROWS; a += 2, k++) {
      const lin = c.lin(ss, a), used = a >= sp, mark = changed.has(lin) || changed.has(lin + 1);
      rows.push(`<div class="row${used ? "" : " free"}"><span class="a">SS:${hex(a)}</span><span${mark ? ' class="mark"' : ""}>${hex(c.rw(ss, a))}</span><span class="${a === sp ? "sp" : "a"}">${a === sp ? "&#9666; SP" : used ? "" : "free"}</span></div>`);
    }
    view.innerHTML = rows.join("");
  } else if (ui.tab === "memory") {
    if (!ui.mem) ui.mem = defaultMem();
    const { seg, off } = ui.mem;
    if (document.activeElement !== $("memAddr")) $("memAddr").value = `${hex(seg)}:${hex(off)}`;
    const rows = [];
    for (let r = 0; r < MEM_ROWS; r++) {
      const o = (off + r * 16) & 0xFFFF, lin = c.lin(seg, o);
      let hx = "", asc = "";
      for (let i = 0; i < 16; i++) {
        const a = (lin + i) & 0xFFFFF, b = c.mem[a];
        const t = hex(b, 2);
        hx += (changed.has(a) ? `<span class="hexb mark">${t}</span>` : t) + (i < 15 ? " " : "");
        asc += esc(b >= 32 && b < 127 ? String.fromCharCode(b) : ".");
      }
      rows.push(`<div class="row"><span class="a">${hex(seg)}:${hex(o)}</span><span>${hx}</span><span class="a">${asc}</span></div>`);
    }
    view.innerHTML = rows.join("");
  } else {
    const p = ui.prog, src = srcEl.value.split("\n"), ip = linIP();
    if (!p || p.errors.length) { view.innerHTML = '<div class="row"><span class="a">Fix the problems to see the machine code.</span></div>'; return; }
    view.innerHTML = p.listing.map(l => {
      const bytes = l.bytes.slice(0, LISTING_BYTES).map(b => hex(b, 2)).join(" ") + (l.bytes.length > LISTING_BYTES ? " .." : "");
      return `<div class="row${l.kind === "code" && l.linear === ip ? " cur" : ""}"><span class="a">${hex(l.base)}:${hex(l.off)}</span><span>${bytes.padEnd(LISTING_BYTES * 3 + 2)}</span><span class="src">${esc((src[l.line] || "").trim())}</span></div>`;
    }).join("");
    const cur = view.querySelector(".row.cur");
    if (cur && (cur.offsetTop < view.scrollTop || cur.offsetTop > view.scrollTop + view.clientHeight - 30)) view.scrollTop = cur.offsetTop - view.clientHeight / 3;
  }
}

function nextIns() {
  const c = m.cpu, ip = c.ip;
  const ins = c.decode();
  c.ip = ip;
  return ins;
}

function renderNext() {
  const p = ui.prog;
  let html;
  if (!p || p.errors.length) html = ui.lang === "hi" ? "Upar wali problem theek karo, phir program chalega." : "Fix the problem above to run the program.";
  else if (m.exited) html = `${ui.lang === "hi" ? "Program khatam hua" : "Program finished"} (exit code ${m.exitCode}). ${ui.lang === "hi" ? "Dobara chalane ke liye" : "Press"} <b>Reset</b>${ui.lang === "hi" ? " dabao." : " to run it again."}`;
  else if (m.cpu.halted) html = "HLT: the CPU stopped. Press <b>Reset</b> to run again.";
  else if (m.notice && m.notice.fatal) html = "Stopped. Press <b>Reset</b> to run again.";
  else {
    const ins = nextIns(), line = p.lineAt.get(linIP());
    const comment = line !== undefined ? (srcEl.value.split("\n")[line] || "").split(";").slice(1).join(";").trim() : "";
    html = `Next <code>${esc(disasm(ins))}</code>${comment ? " &middot; " + esc(comment) : ""}`;
  }
  $("next").innerHTML = html;
}

function renderProblem() {
  const box = $("problem"), p = ui.prog;
  const errs = p ? p.errors : [];
  let kind = null, msgObj = null, line = -1;
  if (errs.length) { kind = "error"; msgObj = message(errs[0].code, errs[0].args); line = errs[0].line; }
  else if (m.notice) { kind = m.notice.fatal ? "error" : "warn"; msgObj = message(m.notice.code, m.notice.args); }
  box.classList.toggle("show", !!kind);
  box.classList.toggle("warn", kind === "warn");
  if (!kind) return;
  $("problemWhat").textContent = (line >= 0 ? `${UI_TEXT[ui.lang].line} ${line + 1}: ` : "") + msgObj.what + (errs[0] && errs[0].macro ? ` (inside ${errs[0].macro})` : "");
  $("problemWhy").textContent = msgObj.why;
  $("problemFix").innerHTML = msgObj.fix ? msgObj.fix.split("\n").map(hlLine).join("\n") : "";
  $("problemMore").innerHTML = errs.length > 1
    ? `<span>${UI_TEXT[ui.lang].more}</span>` + errs.slice(1, 8).map(e => `<button data-goto="${e.line}">${UI_TEXT[ui.lang].line} ${e.line + 1}</button>`).join("") + (errs.length > 8 ? `<span>+${errs.length - 8}</span>` : "")
    : "";
}

function renderStatus() {
  const p = ui.prog, c = m.cpu;
  let state;
  if (p && p.errors.length) state = `<b>${p.errors.length} problem${p.errors.length > 1 ? "s" : ""}</b>`;
  else if (m.waiting) state = `<span class="state-wait"><b>${ui.lang === "hi" ? "Key ka intezaar" : "Waiting for a key"}</b></span>`;
  else if (ui.running) state = "<b>Running</b>";
  else if (m.exited) state = `<b>Finished</b>, exit code ${m.exitCode}`;
  else if (m.done) state = "<b>Stopped</b>";
  else state = m.steps ? "<b>Paused</b>" : "<b>Ready</b>";
  const size = p ? p.segments.reduce((a, s) => a + s.size, 0) - (p.mode === "com" ? 0x100 : 0) : 0;
  $("status").innerHTML = [
    state,
    ui.curLine >= 0 ? `Line <b>${ui.curLine + 1}</b>` : "",
    `CS:IP <b>${hex(c.s[1])}:${hex(c.ip)}</b>`,
    `Steps <b>${m.steps.toLocaleString()}</b>`,
    p && !p.errors.length ? `<b>${p.mode.toUpperCase()}</b>, ${Math.max(0, size)} bytes` : "",
    ui.breakpoints.size ? `Breakpoints <b>${ui.breakpoints.size}</b>` : ""
  ].filter(Boolean).map(s => `<span>${s}</span>`).join("");
}

function render(follow, skipBoard) {
  const p = ui.prog, ok = p && !p.errors.length;
  const line = ok && !m.done ? p.lineAt.get(linIP()) : undefined;
  ui.curLine = line === undefined ? -1 : line;
  markLines();
  if (follow && ui.curLine >= 0 && document.activeElement !== srcEl) scrollToLine(ui.curLine);
  renderProblem();
  renderNext();
  const rec = m.lastRecord;
  if (ui.view === "panels") { renderRegs(rec ? rec.snap : null); renderView(rec); }
  else if (!ui.anim && !skipBoard) renderBoardStatic();
  renderScreen();
  renderStatus();
  $("runLabel").textContent = ui.running ? "Pause" : "Run";
  $("runIcon").setAttribute("href", ui.running ? "#i-pause" : "#i-play");
  $("run").disabled = !ok;
  $("step").disabled = !ok || ui.running;
  $("back").disabled = !ok || ui.running || !m.history.length;
  $("right").dataset.view = ui.view;
  document.querySelectorAll(".viewbar [data-view]").forEach(b => b.setAttribute("aria-selected", b.dataset.view === ui.view));
  document.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === ui.lang));
  ui.lastRender = performance.now();
}

const BD = { W: 640, H: 520, IBUS: 168, ABUS: 330, DBUS: 352, DPORT: 320, DEV_Y: 380, SIGMA_X: 84 };
const REG_BOX = { w: 64, h: 44 };
const REG_POS = {
  CS: [24, 44], DS: [96, 44], SS: [168, 44], ES: [240, 44], IP: [24, 100],
  AX: [336, 44], BX: [408, 44], CX: [480, 44], DX: [552, 44],
  SP: [336, 100], BP: [408, 100], SI: [480, 100], DI: [552, 100]
};
const UNITS = {
  SIGMA: { x: 24, y: 248, w: 120, h: 44, cls: "unit" },
  QUEUE: { x: 148, y: 188, w: 156, h: 44, cls: "unit" },
  CU: { x: 336, y: 188, w: 112, h: 44, cls: "unit" },
  ALU: { x: 464, y: 188, w: 152, h: 44, cls: "unit" },
  FLAGS: { x: 336, y: 248, w: 280, h: 44, cls: "" },
  MEM: { x: 16, y: 380, w: 196, h: 132, cls: "dev" },
  SCREEN: { x: 224, y: 380, w: 200, h: 132, cls: "dev monitor" },
  KBD: { x: 436, y: 380, w: 76, h: 132, cls: "dev" },
  IO: { x: 524, y: 380, w: 100, h: 40, cls: "dev" },
  T8253: { x: 524, y: 426, w: 100, h: 40, cls: "dev later", title: "8253 timer" },
  P8259: { x: 524, y: 472, w: 100, h: 40, cls: "dev later", title: "8259 PIC" }
};
const DEV = { MEM: { addr: 84, data: 150 }, SCREEN: { addr: 300, data: 392 }, KBD: { data: 474 }, IO: { data: 574 } };
const FLAGS_ANCHOR = [456, 248];
const LOCAL_X = { "ALU>FLAGS": 540, "FLAGS>ALU": 540, "FLAGS>CU": 392, "CU>FLAGS": 392 };

const box = id => (REG_POS[id] ? { x: REG_POS[id][0], y: REG_POS[id][1], ...REG_BOX } : UNITS[id]);
function anchor(id) {
  if (id === "FLAGS") return FLAGS_ANCHOR;
  const b = box(id);
  return b.y + b.h <= BD.IBUS ? [b.x + b.w / 2, b.y + b.h] : [b.x + b.w / 2, b.y];
}
function route(a, b) {
  const D = DEV;
  if (a === "SIGMA" && D[b]) { const x = D[b].addr ?? D[b].data; return [[BD.SIGMA_X, 292], [BD.SIGMA_X, BD.ABUS], [x, BD.ABUS], [x, BD.DEV_Y]]; }
  if (D[a] && D[b]) return [[D[a].data, BD.DEV_Y], [D[a].data, BD.DBUS], [D[b].data, BD.DBUS], [D[b].data, BD.DEV_Y]];
  if (D[a]) { const p = anchor(b); return [[D[a].data, BD.DEV_Y], [D[a].data, BD.DBUS], [BD.DPORT, BD.DBUS], [BD.DPORT, BD.IBUS], [p[0], BD.IBUS], p]; }
  if (D[b]) { const p = anchor(a); return [p, [p[0], BD.IBUS], [BD.DPORT, BD.IBUS], [BD.DPORT, BD.DBUS], [D[b].data, BD.DBUS], [D[b].data, BD.DEV_Y]]; }
  const lx = LOCAL_X[`${a}>${b}`];
  if (lx) { const A = box(a), B = box(b), down = A.y < B.y; return [[lx, down ? A.y + A.h : A.y], [lx, down ? B.y : B.y + B.h]]; }
  const pa = anchor(a), pb = anchor(b);
  return [pa, [pa[0], BD.IBUS], [pb[0], BD.IBUS], pb];
}
const pathD = pts => "M" + pts.filter((p, i) => !i || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]).map(p => p.join(" ")).join(" L");

function initBoard() {
  const W = [];
  const bus = d => W.push(`<path class="bus-under" d="${d}"/><path class="bus" d="${d}"/>`);
  W.push(`<path class="ibus" d="M24 ${BD.IBUS} H616"/>`);
  [...Object.keys(REG_POS), "SIGMA", "QUEUE", "CU", "ALU", "FLAGS"].forEach(id => { const p = anchor(id); W.push(`<path class="wire in" d="M${p[0]} ${p[1]} V${BD.IBUS}"/>`); });
  W.push(`<path class="wire in" d="M540 232 V248"/>`, `<path class="wire in" d="M392 248 V232"/>`, `<path class="wire in" d="M${BD.DPORT} ${BD.IBUS} V300"/>`);
  bus(`M16 ${BD.ABUS} H624`);
  bus(`M16 ${BD.DBUS} H624`);
  W.push(`<path class="wire" d="M${BD.DPORT} 300 V${BD.DBUS}"/>`, `<path class="wire" d="M${BD.SIGMA_X} 292 V${BD.DEV_Y}"/>`);
  for (const [, d] of Object.entries(DEV)) {
    if (d.addr && d.addr !== BD.SIGMA_X) W.push(`<path class="wire" d="M${d.addr} ${BD.ABUS} V${BD.DEV_Y}"/>`);
    W.push(`<path class="wire" d="M${d.data} ${BD.DBUS} V${BD.DEV_Y}"/>`);
  }
  W.push(`<path class="later-wire" d="M574 420 V426"/>`, `<path class="later-wire" d="M574 466 V472"/>`);
  const silk = [
    [430, BD.ABUS - 16, "<b>address bus</b> 20-bit"], [430, BD.DBUS + 4, "<b>data bus</b> 16-bit"]
  ];
  const chipLabels = [
    [24, 26, "<b>BIU</b> bus interface unit"], [336, 26, "<b>EU</b> execution unit"], [552, 150, "internal bus"]
  ];
  $("board").innerHTML =
    '<div class="package"><span class="notch"></span></div>' +
    `<div class="package-die" style="position:absolute;left:16px;top:22px;width:296px;height:278px" ><div class="die" style="position:absolute;inset:0"></div></div>` +
    `<div style="position:absolute;left:328px;top:22px;width:296px;height:278px"><div class="die" style="position:absolute;inset:0"></div></div>` +
    `<svg viewBox="0 0 ${BD.W} ${BD.H}" width="${BD.W}" height="${BD.H}" aria-hidden="true">${W.join("")}<g id="trails"></g><g id="live"></g></svg>` +
    chipLabels.map(([x, y, t]) => `<span class="cl" style="left:${x}px;top:${y}px">${t}</span>`).join("") +
    `<span class="cl big" style="left:574px;top:24px">8086</span>` +
    silk.map(([x, y, t]) => `<span class="silk" style="left:${x}px;top:${y}px">${t}</span>`).join("") +
    Object.keys(REG_POS).concat(Object.keys(UNITS)).map(id => {
      const b = box(id);
      return `<div class="node ${b.cls || ""}" id="bn-${id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"></div>`;
    }).join("");
}

function fitBoard() {
  const st = $("stage"), s = Math.min(st.clientWidth / BD.W, st.clientHeight / BD.H);
  $("board").style.transform = `translate(${(st.clientWidth - BD.W * s) / 2}px, ${(st.clientHeight - BD.H * s) / 2}px) scale(${s})`;
}

function capture() {
  const c = m.cpu, regs = regValues(liveSnap()), stack = [];
  const top = ui.prog && ui.prog.mode === "exe" ? ui.prog.sp : 0x10000;
  for (let a = c.r[4], k = 0; k < 3 && a + 1 < top; a += 2, k++) stack.push({ off: a, lin: c.lin(c.s[2], a), v: c.rw(c.s[2], a) });
  refreshScreenCache();
  const next = m.done ? null : nextIns();
  const lin = linIP();
  const lastKey = m.keyPos > 0 ? m.keys[m.keyPos - 1] : null;
  return {
    regs, flags: c.flags, stack, monitor: ui.miniCache,
    code: next ? { lin, bytes: Array.from(c.mem.slice(lin, lin + Math.min(next.len, 6)), b => hex(b, 2)).join(" "), tag: "next" } : null,
    kbd: lastKey ? lastKey.a : null, io: m.lastPort ? { ...m.lastPort } : null
  };
}

function viewState(cap) {
  return { regs: { ...cap.regs }, flags: cap.flags, stack: cap.stack, monitor: cap.monitor, code: cap.code, kbd: cap.kbd, io: cap.io, sigma: "", queue: [], cu: "", alu: "", marks: new Set(), memLast: null };
}

function keyLabel(a) { return a === 13 ? "Enter" : a === 8 ? "Bksp" : a === 27 ? "Esc" : a === 32 ? "Space" : a >= 33 && a < 127 ? String.fromCharCode(a) : hex(a, 2); }

function renderBoardValues(vs) {
  const mk = k => (vs.marks.has(k) ? " mark" : "");
  const set = (id, html) => { const el = $("bn-" + id); if (el.innerHTML !== html) el.innerHTML = html; };
  Object.keys(REG_POS).forEach(r => set(r, `<span class="n">${r}</span><span class="v${mk(r)}">${hex(vs.regs[r])}</span>`));
  set("SIGMA", `<span class="n">Address adder &Sigma;</span><span class="v">${vs.sigma || "-"}</span>`);
  set("QUEUE", `<span class="n">Instruction queue</span><span class="qcells">${Array.from({ length: 6 }, (_, i) => `<span>${vs.queue[i] ?? ""}</span>`).join("")}</span>`);
  set("CU", `<span class="n">Decoder</span><span class="v" style="max-width:100%;overflow:hidden;text-overflow:ellipsis">${esc(vs.cu || "-")}</span>`);
  set("ALU", `<span class="n">ALU</span><span class="v">${esc(vs.alu || "-")}</span>`);
  set("FLAGS", `<span class="fcells">${FLAG_NAMES.map(f => `<span>${f}<b class="${vs.flags & F[f] ? "on" : ""}${mk("F" + f)}">${vs.flags & F[f] ? 1 : 0}</b></span>`).join("")}</span>`);
  const rows = [];
  if (vs.code) rows.push(`<div><span class="a">${hex(vs.code.lin, 5)}</span><span>${vs.code.bytes}</span><span class="a">${vs.code.tag}</span></div>`);
  if (vs.memLast) rows.push(`<div><span class="a">${hex(vs.memLast.lin, 5)}</span><span class="mark">${vs.memLast.text}</span><span class="a">written</span></div>`);
  vs.stack.forEach((s, i) => rows.push(`<div><span class="a">${hex(s.lin, 5)}</span><span>${hex(s.v)}</span><span class="a">${i === 0 ? "&#9666; SP" : ""}</span></div>`));
  if (!vs.stack.length) rows.push('<div><span class="a">stack is empty</span></div>');
  set("MEM", `<span class="n">Memory, 1 MB</span><div class="mrows">${rows.join("")}</div>`);
  set("SCREEN", `<span class="n">Video RAM at B800h</span><div class="tube${mk("SCREEN") ? " lit" : ""}">${vs.monitor}</div>`);
  set("KBD", `<span class="n">Keyboard</span><span class="keycap${mk("KBD")}">${vs.kbd === null ? "-" : esc(keyLabel(vs.kbd))}</span>`);
  set("IO", `<span class="n">I/O ports</span><span class="v${mk("IO")}" style="font-size:12px">${vs.io ? `${hex(vs.io.port, 2)}h: ${hex(vs.io.v, 2)}` : "-"}</span>`);
  ["T8253", "P8259"].forEach(id => set(id, `<span class="n">${UNITS[id].title}</span><span class="v">coming soon</span>`));
}

function buildPlan(ins, B, A) {
  const H = [], mn = ins.mn, o = ins.ops, pre = ins.pre || [], post = ins.post || [];
  const lin = ((ins.cs << 4) + ins.addr) & 0xFFFFF;
  const byteArr = Array.from(m.cpu.mem.slice(lin, lin + ins.len), b => hex(b, 2));
  const bstr = byteArr.join(" "), dis = disasm(ins);
  const add = (from, to, label, text, apply) => H.push({ from, to, label, text, apply });
  const note = text => H.push({ from: null, text });
  const setReg = node => vs => { vs.regs[node] = A.regs[node]; if (B.regs[node] !== A.regs[node]) vs.marks.add(node); };
  const alu = t => vs => { vs.alu = t; };
  const flagsChanged = FLAG_NAMES.filter(f => (B.flags ^ A.flags) & F[f]);
  const toFlags = text => add("ALU", "FLAGS", flagsChanged.length ? flagsChanged.map(f => `${f} ${A.flags & F[f] ? 1 : 0}`).slice(0, 2).join(" ") : "flags", text || (flagsChanged.length ? `Flags update: ${flagsChanged.map(f => `${f} = ${A.flags & F[f] ? 1 : 0}`).join(", ")}` : "The flags are set from the result (no change this time)"), vs => {
    vs.flags = A.flags; flagsChanged.forEach(f => vs.marks.add("F" + f));
  });
  const node = op => (op.t === "r" ? (op.w ? REG16[op.n] : REG16[op.n & 3]) : op.t === "s" ? SREG[op.n] : "CU");
  const name = op => formatOp(op, ins);
  const val = (op, v) => (v === undefined ? "?" : hex(v & (op.w ? 0xFFFF : 0xFF), op.w ? 4 : 2));
  const where = op => {
    const seg = SREG[op.seg], segv = B.regs[seg], l = ((segv << 4) + op.off) & 0xFFFFF;
    const dev = l >= VIDEO_LIN && l < VIDEO_LIN + COLS * ROWS * 2 ? "SCREEN" : "MEM";
    add(seg, "SIGMA", `${seg}:${hex(op.off)}`, `${op.base ? `Address ${op.base}${op.disp ? (op.disp < 0 ? "-" : "+") + hex(Math.abs(op.disp), 2) + "h" : ""} = ${hex(op.off)}h. ` : ""}${seg}:${hex(op.off)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", dev, hex(l, 5), `${hex(segv)}0h + ${hex(op.off)}h = ${hex(l, 5)}h goes out on the address bus${dev === "SCREEN" ? ": that address is video memory" : ""}`);
    return { node: dev, lin: l };
  };
  const writeTo = (w, op, v) => vs => {
    vs.memLast = { lin: w.lin, text: val(op, v) };
    vs.marks.add(w.node);
    if (w.node === "SCREEN") { vs.monitor = A.monitor; vs.marks.add("SCREEN"); }
  };
  const source = (op, v) => (op.t === "m" ? where(op).node : node(op));
  const stackWrite = (srcNode, value, what, sp = B.regs.SP) => {
    const off = (sp - 2) & 0xFFFF, l = ((B.regs.SS << 4) + off) & 0xFFFFF;
    add("SP", "ALU", hex(sp), `${what}: SP = ${hex(sp)}h goes to the ALU`, alu(`${hex(sp)} - 2`));
    add("ALU", "SP", hex(off), `SP - 2 = ${hex(off)}h: the stack grows down`, vs => { vs.regs.SP = off; vs.marks.add("SP"); });
    add("SS", "SIGMA", `SS:${hex(off)}`, `Stack address SS:SP = ${hex(B.regs.SS)}:${hex(off)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", "MEM", hex(l, 5), `${hex(B.regs.SS)}0h + ${hex(off)}h = ${hex(l, 5)}h goes out on the address bus`);
    add(srcNode, "MEM", hex(value), `${hex(value)}h travels over the data bus into the stack at ${hex(l, 5)}h`, vs => { vs.memLast = { lin: l, text: hex(value) }; vs.marks.add("MEM"); });
    return off;
  };
  const stackRead = (destNode, value, what, sp = B.regs.SP) => {
    const l = ((B.regs.SS << 4) + sp) & 0xFFFFF;
    add("SS", "SIGMA", `SS:${hex(sp)}`, `${what}: stack address SS:SP = ${hex(B.regs.SS)}:${hex(sp)} goes to the address adder`, vs => { vs.sigma = hex(l, 5); });
    add("SIGMA", "MEM", hex(l, 5), `${hex(B.regs.SS)}0h + ${hex(sp)}h = ${hex(l, 5)}h goes out on the address bus`);
    add("MEM", destNode, hex(value), `Memory sends ${hex(value)}h back over the data bus into ${destNode}`, destNode === "FLAGS" ? vs => { vs.flags = A.flags; flagsChanged.forEach(f => vs.marks.add("F" + f)); } : setReg(destNode));
  };
  const spUp = n => {
    add("SP", "ALU", hex(B.regs.SP), "SP goes to the ALU", alu(`${hex(B.regs.SP)} + ${n}`));
    add("ALU", "SP", hex(A.regs.SP), `SP + ${n} = ${hex(A.regs.SP)}h`, setReg("SP"));
  };
  const jumped = A.regs.IP !== ((ins.addr + ins.len) & 0xFFFF) || A.regs.CS !== B.regs.CS;

  if (ui.showFetch) {
    add("IP", "SIGMA", `${hex(ins.cs)}:${hex(ins.addr)}`, `Fetch: CS:IP = ${hex(ins.cs)}:${hex(ins.addr)} goes to the address adder`, vs => { vs.sigma = hex(lin, 5); });
    add("SIGMA", "MEM", hex(lin, 5), `${hex(ins.cs)}0h + ${hex(ins.addr)}h = ${hex(lin, 5)}h goes out on the address bus`, vs => { vs.code = { lin, bytes: bstr, tag: "fetch" }; });
    add("MEM", "QUEUE", bstr, `Memory sends the bytes ${bstr} over the data bus into the queue`, vs => { vs.queue = byteArr; });
    add("QUEUE", "CU", dis, `The decoder reads ${bstr} as ${dis}`, vs => { vs.cu = dis; });
  } else H.push({ instant: vs => { vs.queue = byteArr; vs.cu = dis; vs.sigma = hex(lin, 5); } });

  const ALU2 = ["ADD", "ADC", "SUB", "SBB", "CMP", "AND", "OR", "XOR", "TEST"];
  const ALU1 = ["INC", "DEC", "NEG", "NOT", "ROL", "ROR", "RCL", "RCR", "SHL", "SHR", "SAR", "SETMO"];
  if (mn === "MOV") {
    const [d, s] = o, from = source(s);
    if (d.t === "m") { const w = where(d); add(from, w.node, val(d, post[0]), `${name(s)} = ${val(d, post[0])}h is written to ${hex(w.lin, 5)}h`, writeTo(w, d, post[0])); }
    else add(from, node(d), val(d, post[0]), `${name(d)} gets ${val(d, post[0])}h${s.t === "i" ? " straight from the instruction" : ` from ${name(s)}`}`, setReg(node(d)));
  } else if (ALU2.includes(mn)) {
    const [d, s] = o, wd = d.t === "m" ? where(d) : null, dn = wd ? wd.node : node(d);
    add(dn, "ALU", val(d, pre[0]), `${name(d)} = ${val(d, pre[0])}h goes to the ALU`, alu(val(d, pre[0])));
    const sn = s.t === "m" ? where(s).node : node(s);
    add(sn, "ALU", val(s, pre[1]), `${s.t === "i" ? "The number" : name(s)} ${val(s, pre[1])}h goes to the ALU`, alu(`${val(d, pre[0])} ${OPSYM[mn]} ${val(s, pre[1])}`));
    if (mn !== "CMP" && mn !== "TEST") add("ALU", dn, val(d, post[0]), `The result ${val(d, post[0])}h goes back into ${name(d)}`, wd ? writeTo(wd, d, post[0]) : setReg(dn));
    toFlags(mn === "CMP" || mn === "TEST" ? `${mn} only sets the flags; nothing is written back.${flagsChanged.length ? " " + flagsChanged.map(f => `${f} = ${A.flags & F[f] ? 1 : 0}`).join(", ") : ""}` : undefined);
  } else if (ALU1.includes(mn)) {
    const [d] = o, wd = d.t === "m" ? where(d) : null, dn = wd ? wd.node : node(d);
    add(dn, "ALU", val(d, pre[0]), `${name(d)} = ${val(d, pre[0])}h goes to the ALU`, alu(`${mn} ${val(d, pre[0])}`));
    if (o[1] && o[1].t === "r") add("CX", "ALU", hex(pre[1], 2), `The shift count CL = ${pre[1]} goes to the ALU`);
    add("ALU", dn, val(d, post[0]), `${mn} gives ${val(d, post[0])}h, back into ${name(d)}`, wd ? writeTo(wd, d, post[0]) : setReg(dn));
    if (mn !== "NOT") toFlags();
  } else if (mn === "MUL" || mn === "IMUL" || mn === "DIV" || mn === "IDIV") {
    const [s] = o, w = s.w, mul = mn.endsWith("MUL");
    if (!mul && w) add("DX", "ALU", hex(B.regs.DX), `DX:AX = ${hex(B.regs.DX)}:${hex(B.regs.AX)} is the number to divide`);
    add("AX", "ALU", w ? hex(B.regs.AX) : hex(B.regs.AX, 4), w ? `AX = ${hex(B.regs.AX)}h goes to the ALU` : mul ? `AL = ${hex(B.regs.AX & 0xFF, 2)}h goes to the ALU` : `AX = ${B.regs.AX} goes to the ALU`, alu(`${mul ? hex(w ? B.regs.AX : B.regs.AX & 0xFF, w ? 4 : 2) : hex(B.regs.AX)} ${mul ? "x" : "/"} ?`));
    const sn = s.t === "m" ? where(s).node : node(s);
    add(sn, "ALU", val(s, pre[0]), `${name(s)} = ${val(s, pre[0])}h goes to the ALU`, alu(`${mul ? "x" : "/"} ${val(s, pre[0])}`));
    if (m.notice && m.notice.code === "DIV0") note("Divide overflow: the answer doesn't fit, so the CPU raises INT 0 and DOS stops the program");
    else {
      add("ALU", "AX", hex(A.regs.AX), mul ? `Result low part ${hex(A.regs.AX)}h (${A.regs.AX}) goes into AX` : w ? `Quotient ${A.regs.AX} goes into AX` : `Quotient ${A.regs.AX & 0xFF} into AL, remainder ${A.regs.AX >> 8} into AH`, setReg("AX"));
      if (w) add("ALU", "DX", hex(A.regs.DX), mul ? `High part ${hex(A.regs.DX)}h goes into DX` : `Remainder ${A.regs.DX} goes into DX`, setReg("DX"));
      if (mul) toFlags(`CF = OF = ${A.flags & F.CF ? 1 : 0}: ${A.flags & F.CF ? "the answer needed the high part too" : "the answer fits in the low part"}`);
    }
  } else if (mn === "PUSH" || mn === "PUSHF") {
    const v = mn === "PUSHF" ? B.flags : o[0].t === "r" && o[0].n === 4 ? (B.regs.SP - 2) & 0xFFFF : pre[0];
    let src = mn === "PUSHF" ? "FLAGS" : node(o[0]);
    if (mn === "PUSH" && o[0].t === "m") { const w = where(o[0]); add(w.node, "ALU", hex(v), `The word ${hex(v)}h is read from memory`); src = "ALU"; }
    stackWrite(src, v, mn);
  } else if (mn === "POP" || mn === "POPF") {
    if (mn === "POPF") stackRead("FLAGS", A.flags, "POPF");
    else if (o[0].t === "m") { stackRead("ALU", post[0], "POP"); const w = where(o[0]); add("ALU", w.node, hex(post[0]), `The value goes into memory at ${hex(w.lin, 5)}h`, writeTo(w, o[0], post[0])); }
    else stackRead(node(o[0]), A.regs[node(o[0])], "POP");
    spUp(2);
  } else if (mn === "CALL" || mn === "CALLF") {
    const spAfterCs = mn === "CALLF" ? stackWrite("CS", B.regs.CS, "CALL FAR saves CS") : B.regs.SP;
    stackWrite("IP", (ins.addr + ins.len) & 0xFFFF, "CALL saves the return address", spAfterCs);
    if (mn === "CALLF") add("CU", "CS", hex(A.regs.CS), `CS becomes ${hex(A.regs.CS)}h`, setReg("CS"));
    add(o[0].t === "r" ? node(o[0]) : "CU", "IP", hex(A.regs.IP), `IP jumps to the procedure at ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "RET" || mn === "RETF" || mn === "IRET") {
    stackRead("IP", A.regs.IP, mn);
    if (mn !== "RET") stackRead("CS", A.regs.CS, `${mn} also restores CS`, (B.regs.SP + 2) & 0xFFFF);
    if (mn === "IRET") stackRead("FLAGS", A.flags, "IRET restores the flags", (B.regs.SP + 4) & 0xFFFF);
    spUp(((A.regs.SP - B.regs.SP) & 0xFFFF));
  } else if (mn === "JMP" || mn === "JMPF") {
    if (mn === "JMPF") add("CU", "CS", hex(A.regs.CS), `CS becomes ${hex(A.regs.CS)}h`, setReg("CS"));
    add(o[0].t === "r" ? node(o[0]) : "CU", "IP", hex(A.regs.IP), `IP becomes ${hex(A.regs.IP)}h: the next instruction comes from there`, setReg("IP"));
  } else if (ins.cc !== undefined) {
    add("FLAGS", "CU", mn, `${mn} checks the flags: ${jumped ? "the condition is true, so jump" : "the condition is false, so carry on"}`);
    if (jumped) add("CU", "IP", hex(A.regs.IP), `IP jumps to ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "LOOP" || mn === "LOOPE" || mn === "LOOPNE" || mn === "JCXZ") {
    if (mn === "JCXZ") add("CX", "CU", hex(B.regs.CX), `JCXZ checks CX = ${B.regs.CX}: ${jumped ? "it is 0, so jump" : "not 0, so carry on"}`);
    else {
      add("CX", "ALU", hex(B.regs.CX), `${mn}: CX = ${B.regs.CX} goes to the ALU to count down`, alu(`${hex(B.regs.CX)} - 1`));
      const zf = mn === "LOOP" ? "" : `; ZF = ${B.flags & F.ZF ? 1 : 0}`;
      add("ALU", "CX", hex(A.regs.CX), `CX - 1 = ${A.regs.CX}${zf}, so ${jumped ? "loop again" : "the loop ends"}`, setReg("CX"));
    }
    if (jumped) add("CU", "IP", hex(A.regs.IP), `IP jumps back to ${hex(A.regs.IP)}h`, setReg("IP"));
  } else if (mn === "INT") {
    const n = o[0].v, ah = B.regs.AX >> 8, al = B.regs.AX & 0xFF, dl = B.regs.DX & 0xFF;
    const ch = c => (c >= 32 && c < 127 ? `'${String.fromCharCode(c)}'` : `${hex(c, 2)}h`);
    const lit = vs => { vs.monitor = A.monitor; vs.marks.add("SCREEN"); };
    if (n === 0x21 && ah === 0x02) {
      add("DX", "SCREEN", ch(dl), `INT 21h, AH = 02h: DOS prints DL = ${ch(dl)} on the screen`, lit);
      if (A.regs.AX !== B.regs.AX) add("DX", "AX", hex(A.regs.AX & 0xFF, 2), "DOS also hands the character back in AL", setReg("AX"));
    } else if (n === 0x21 && ah === 0x09) {
      let s = "", off = B.regs.DX;
      for (let i = 0; i < 24; i++) { const c = m.cpu.rb(B.regs.DS, off + i); if (c === 0x24) break; s += c >= 32 && c < 127 ? String.fromCharCode(c) : " "; }
      add("MEM", "SCREEN", `"${s.trim().slice(0, 14)}"`, `INT 21h, AH = 09h: DOS copies the text at DS:DX to the screen until '$'`, lit);
      if (A.regs.AX !== B.regs.AX) add("CU", "AX", hex(A.regs.AX & 0xFF, 2), "DOS leaves AL = 24h, the '$' that ended the text", setReg("AX"));
    } else if (n === 0x21 && (ah === 0x01 || ah === 0x07 || ah === 0x08)) {
      add("KBD", "AX", ch(A.regs.AX & 0xFF), `INT 21h, AH = ${hex(ah, 2)}h: DOS reads a key into AL`, vs => { setReg("AX")(vs); vs.kbd = A.kbd; vs.marks.add("KBD"); });
      if (ah === 0x01) add("AX", "SCREEN", ch(A.regs.AX & 0xFF), "and echoes it on the screen", lit);
    } else if (n === 0x21 && ah === 0x0A) add("KBD", "MEM", "line", "INT 21h, AH = 0Ah: DOS stores the typed line at DS:DX", vs => { vs.marks.add("MEM"); vs.monitor = A.monitor; });
    else if (n === 0x21 && (ah === 0x4C || ah === 0x00) || n === 0x20) note(`DOS ends the program${n === 0x21 && ah === 0x4C ? ` with exit code ${al}` : ""}. Control goes back to DOS.`);
    else if (n === 0x10 && (ah === 0x0E || ah === 0x09 || ah === 0x0A)) add("AX", "SCREEN", ch(al), `INT 10h, AH = ${hex(ah, 2)}h: the BIOS writes ${ch(al)} to the screen`, lit);
    else if (n === 0x10 && ah === 0x02) add("DX", "SCREEN", `${hex(B.regs.DX >> 8, 2)},${hex(dl, 2)}`, `INT 10h, AH = 02h: the cursor moves to row ${B.regs.DX >> 8}, column ${dl}`, lit);
    else if (n === 0x10) add("CU", "SCREEN", `${hex(ah, 2)}h`, `INT 10h, AH = ${hex(ah, 2)}h: the BIOS updates the screen`, lit);
    else if (n === 0x16 && (ah === 0x00 || ah === 0x10)) add("KBD", "AX", ch(A.regs.AX & 0xFF), "INT 16h: the BIOS reads a key into AL (scan code in AH)", vs => { setReg("AX")(vs); vs.kbd = A.kbd; vs.marks.add("KBD"); });
    else note(`INT ${hex(n, 2)}h, AH = ${hex(ah, 2)}h`);
  } else if (["MOVS", "LODS", "STOS", "CMPS", "SCAS"].includes(mn)) {
    const w = ins.w, segSrc = ins.seg >= 0 ? ins.seg : 3;
    const srcOp = { t: "m", seg: segSrc, off: B.regs.SI, w, base: "SI", disp: 0 };
    const dstOp = { t: "m", seg: 0, off: B.regs.DI, w, base: "DI", disp: 0 };
    const count = ins.rep ? ` (${ins.rep === 0xF3 && (mn === "CMPS" || mn === "SCAS") ? "REPE" : ins.rep === 0xF3 ? "REP" : "REPNE"} repeats this; CX was ${B.regs.CX})` : "";
    const rd = op => m.cpu.rb(B.regs[SREG[op.seg]], op.off) | (w ? m.cpu.rb(B.regs[SREG[op.seg]], op.off + 1) << 8 : 0);
    if (mn === "LODS") { const s = where(srcOp); add(s.node, "AX", hex(rd(srcOp), w ? 4 : 2), `LODS loads the value at DS:SI into ${w ? "AX" : "AL"}${count}`, setReg("AX")); }
    if (mn === "STOS") { const d = where(dstOp); add("AX", d.node, hex(w ? B.regs.AX : B.regs.AX & 0xFF, w ? 4 : 2), `STOS stores ${w ? "AX" : "AL"} at ES:DI${count}`, writeTo(d, dstOp, w ? B.regs.AX : B.regs.AX)); }
    if (mn === "MOVS") { const s = where(srcOp); add(s.node, "ALU", hex(rd(srcOp), w ? 4 : 2), `MOVS reads from DS:SI${count}`); const d = where(dstOp); add("ALU", d.node, hex(rd(srcOp), w ? 4 : 2), "and writes it to ES:DI", writeTo(d, dstOp, rd(srcOp))); }
    if (mn === "CMPS" || mn === "SCAS") {
      if (mn === "CMPS") { const s = where(srcOp); add(s.node, "ALU", hex(rd(srcOp), w ? 4 : 2), `CMPS reads DS:SI${count}`); }
      else add("AX", "ALU", hex(w ? B.regs.AX : B.regs.AX & 0xFF, w ? 4 : 2), `SCAS compares ${w ? "AX" : "AL"}${count}`);
      const d = where(dstOp); add(d.node, "ALU", hex(rd(dstOp), w ? 4 : 2), "with the value at ES:DI");
      toFlags();
    }
    if (mn !== "STOS" && mn !== "SCAS") add("ALU", "SI", hex(A.regs.SI), `SI moves ${A.flags & F.DF ? "down" : "up"} to ${hex(A.regs.SI)}h`, setReg("SI"));
    if (mn !== "LODS") add("ALU", "DI", hex(A.regs.DI), `DI moves ${A.flags & F.DF ? "down" : "up"} to ${hex(A.regs.DI)}h`, setReg("DI"));
    if (ins.rep) add("ALU", "CX", hex(A.regs.CX), `CX counts down to ${A.regs.CX}`, setReg("CX"));
  } else if (mn === "LEA") {
    add("CU", node(o[0]), hex(post[0]), `LEA loads the address itself (${hex(post[0])}h), not the value stored there`, setReg(node(o[0])));
  } else if (mn === "LDS" || mn === "LES") {
    const w = where(o[1]), seg = mn === "LDS" ? "DS" : "ES";
    add(w.node, node(o[0]), hex(post[0]), `${mn} loads the offset ${hex(post[0])}h into ${name(o[0])}`, setReg(node(o[0])));
    add(w.node, seg, hex(A.regs[seg]), `and the segment ${hex(A.regs[seg])}h into ${seg}`, setReg(seg));
  } else if (mn === "XCHG") {
    const [a, b] = o, wa = a.t === "m" ? where(a) : null, na = wa ? wa.node : node(a), nb = node(b);
    add(na, nb, val(a, pre[0]), `${name(a)} = ${val(a, pre[0])}h goes to ${name(b)}`, setReg(nb));
    add(nb, na, val(b, pre[1]), `and ${name(b)} = ${val(b, pre[1])}h goes to ${name(a)}`, wa ? writeTo(wa, a, pre[1]) : setReg(na));
  } else if (mn === "IN") add("IO", "AX", hex(A.regs.AX & (ins.w ? 0xFFFF : 0xFF), ins.w ? 4 : 2), `IN reads I/O port ${hex(pre[1], 2)}h into ${name(o[0])}`, setReg("AX"));
  else if (mn === "OUT") add(node(o[1]), "IO", val(o[1], pre[1]), `OUT sends ${val(o[1], pre[1])}h to I/O port ${hex(pre[0], 2)}h`, vs => { vs.io = A.io; vs.marks.add("IO"); });
  else if (["CBW", "CWD", "AAA", "AAS", "DAA", "DAS", "AAM", "AAD", "SALC", "XLAT"].includes(mn)) {
    add("AX", "ALU", hex(B.regs.AX), `${mn} works on AX = ${hex(B.regs.AX)}h`, alu(mn));
    add("ALU", "AX", hex(A.regs.AX), `AX becomes ${hex(A.regs.AX)}h`, setReg("AX"));
    if (mn === "CWD") add("ALU", "DX", hex(A.regs.DX), `DX becomes ${hex(A.regs.DX)}h (the sign of AX)`, setReg("DX"));
    if (flagsChanged.length) toFlags();
  } else if (["CLC", "STC", "CMC", "CLD", "STD", "CLI", "STI"].includes(mn)) add("CU", "FLAGS", mn, `${mn} changes one flag: ${flagsChanged.map(f => `${f} = ${A.flags & F[f] ? 1 : 0}`).join(", ") || "already set that way"}`, vs => { vs.flags = A.flags; flagsChanged.forEach(f => vs.marks.add("F" + f)); });
  else if (mn === "SAHF") add("AX", "FLAGS", hex(B.regs.AX >> 8, 2), "SAHF copies AH into the low flags", vs => { vs.flags = A.flags; flagsChanged.forEach(f => vs.marks.add("F" + f)); });
  else if (mn === "LAHF") add("FLAGS", "AX", hex(A.regs.AX >> 8, 2), "LAHF copies the low flags into AH", setReg("AX"));
  else if (mn === "HLT") note("HLT: the CPU stops here.");
  else if (mn === "NOP") note("NOP: nothing happens, the CPU just moves on.");
  else note(`${dis}`);
  return H;
}

function finalView(plan, B, A) {
  const vs = viewState(B);
  plan.forEach(h => { if (h.instant) h.instant(vs); else if (h.apply) h.apply(vs); });
  vs.regs = { ...A.regs }; vs.flags = A.flags; vs.stack = A.stack; vs.monitor = A.monitor; vs.kbd = A.kbd; vs.io = A.io;
  Object.keys(A.regs).forEach(r => { if (A.regs[r] !== B.regs[r]) vs.marks.add(r); });
  FLAG_NAMES.forEach(f => { if ((A.flags ^ B.flags) & F[f]) vs.marks.add("F" + f); });
  vs.code = A.code ? { ...A.code } : vs.code;
  return vs;
}

function drawTrails(plan) {
  $("trails").innerHTML = plan.filter(h => h.from).map(h => `<path class="trail" d="${pathD(route(h.from, h.to))}"/>`).join("");
}

function setCaption(count, text) { $("caption").innerHTML = `<span class="count">${count}</span><span class="text">${esc(text)}</span>`; }

function renderBoardStatic() {
  fitBoard();
  const lp = ui.lastPlan;
  if (lp && lp.steps === m.steps) {
    renderBoardValues(finalView(lp.plan, lp.B, lp.A));
    drawTrails(lp.plan);
    const moves = lp.plan.filter(h => h.from).length, last = [...lp.plan].reverse().find(h => h.text);
    setCaption(`${moves} moves`, `${disasm(lp.ins)}: ${last ? last.text : ""}`);
    return;
  }
  const cap = capture(), vs = viewState(cap);
  renderBoardValues(vs);
  $("trails").innerHTML = "";
  const p = ui.prog;
  setCaption("", p && p.errors.length ? (ui.lang === "hi" ? "Problem theek karo, phir data ko board pe chalte dekho." : "Fix the problem to watch data move across the board.")
    : m.waiting ? (ui.lang === "hi" ? "Key ka intezaar: screen pe click karke type karo." : "Waiting for a key: open the screen and type.")
    : m.done ? (ui.lang === "hi" ? "Program khatam. Reset dabao." : "The program has finished. Press Reset to run it again.")
    : (ui.lang === "hi" ? "Step dabao aur dekho agla instruction board pe kaise chalta hai." : "Press Step to watch the next instruction travel across the board."));
}

function cancelAnim() {
  if (!ui.anim) return;
  ui.anim.timers.forEach(clearTimeout);
  $("board").querySelectorAll(".packet").forEach(p => p.remove());
  $("live").innerHTML = "";
  ui.anim = null;
}

function animate(plan, B, A, done) {
  cancelAnim();
  const vs = viewState(B);
  plan.forEach(h => { if (h.instant) h.instant(vs); });
  const hops = plan.filter(h => !h.instant);
  const hopMs = HOP_MS / ui.boardSpeed, gap = HOP_GAP_MS / ui.boardSpeed;
  ui.anim = { timers: [] };
  $("trails").innerHTML = "";
  renderBoardValues(vs);
  let t = 0;
  const later = (fn, at) => ui.anim.timers.push(setTimeout(fn, at));
  hops.forEach((h, i) => {
    const label = `${i + 1}/${hops.length}`;
    if (!h.from) { later(() => setCaption(label, h.text), t); t += CAPTION_ONLY_MS / ui.boardSpeed; return; }
    const d = pathD(route(h.from, h.to));
    later(() => {
      setCaption(label, h.text);
      const live = document.createElementNS("http://www.w3.org/2000/svg", "path");
      live.setAttribute("d", d); live.setAttribute("class", "live"); live.setAttribute("pathLength", "1");
      live.style.strokeDasharray = "1"; live.style.strokeDashoffset = "1";
      $("live").appendChild(live);
      const p = document.createElement("div");
      p.className = "packet";
      p.textContent = h.label;
      p.style.offsetPath = `path('${d}')`;
      $("board").appendChild(p);
      void p.offsetWidth;
      const ease = "cubic-bezier(0.45, 0, 0.2, 1)";
      p.style.transition = `offset-distance ${hopMs}ms ${ease}`;
      live.style.transition = `stroke-dashoffset ${hopMs}ms ${ease}`;
      p.style.offsetDistance = "100%";
      live.style.strokeDashoffset = "0";
    }, t);
    later(() => {
      $("board").querySelectorAll(".packet").forEach(p => p.remove());
      $("live").innerHTML = "";
      $("trails").insertAdjacentHTML("beforeend", `<path class="trail" d="${d}"/>`);
      if (h.apply) h.apply(vs);
      renderBoardValues(vs);
      const el = $("bn-" + h.to);
      if (el) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
    }, t + hopMs);
    t += hopMs + gap;
  });
  later(() => { ui.anim = null; renderBoardStatic(); if (done) done(); }, t);
}

function boardStep(play) {
  const B = capture();
  const ins = m.step(true);
  if (!ins || m.waiting) {
    if (m.waiting) { ui.pendingStep = !play; waitForKey(); }
    render(true);
    return;
  }
  const A = capture(), plan = buildPlan(ins, B, A);
  ui.lastPlan = { plan, B, A, ins, steps: m.steps };
  render(true, true);
  if (REDUCED.matches) {
    renderBoardStatic();
    if (play && ui.running) ui.timer = setTimeout(boardPlay, BOARD_PAUSE_MS * 2);
    return;
  }
  animate(plan, B, A, () => {
    if (play && ui.running) ui.timer = setTimeout(boardPlay, BOARD_PAUSE_MS / ui.boardSpeed);
    else render();
  });
}

function boardPlay() {
  ui.timer = null;
  if (!ui.running) return;
  if (m.done) { ui.running = false; render(); return; }
  if (!ui.skipBreak && breakpointAddrs().has(linIP())) { ui.running = false; render(); return; }
  ui.skipBreak = false;
  boardStep(true);
}

function setView(v) {
  stopRun();
  ui.view = v;
  localStorage.setItem(STORE.view, v);
  render(true);
  if (v === "panels") fitCrt($("crt"), $("crt").clientWidth);
  render();
}

function openModal(show) {
  ui.modal = show;
  $("modal").classList.toggle("show", show);
  if (show) {
    const el = $("bigCrt");
    fitCrt(el, window.innerWidth * 0.9, window.innerHeight * 0.82);
    const fs = parseFloat(el.style.fontSize);
    el.style.width = `${COLS * CRT_CHAR_RATIO * fs + 26}px`;
    el.style.height = `${ROWS * 1.25 * fs + 18}px`;
    renderScreen();
    el.focus();
  }
}

function toast(text) {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => t.classList.remove("show"), TOAST_MS);
}

function encodeSource(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeSource(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

function chooseExample(id) {
  saveSource();
  stopRun();
  ui.example = id;
  localStorage.setItem(STORE.ex, id);
  const ex = EXAMPLES.find(e => e.id === id);
  $("fileName").textContent = ex ? ex.file : "program.asm";
  $("examples").value = id;
  ui.breakpoints.clear();
  setSource(ex ? ex.src : "");
}

function initExamples() {
  const sel = $("examples");
  sel.innerHTML = EXAMPLES.map(e => `<option value="${e.id}">${esc(e.title)}</option>`).join("") + '<option value="custom">My program</option>';
}

function bind() {
  srcEl.addEventListener("input", onSourceInput);
  srcEl.addEventListener("keydown", e => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const s = srcEl.selectionStart, en = srcEl.selectionEnd;
      srcEl.setRangeText("    ", s, en, "end");
      onSourceInput();
    }
  });
  gutterEl.addEventListener("click", e => {
    const b = e.target.closest(".bp");
    if (!b) return;
    const line = Number(b.dataset.line);
    if (ui.breakpoints.has(line)) ui.breakpoints.delete(line); else ui.breakpoints.add(line);
    b.setAttribute("aria-pressed", ui.breakpoints.has(line));
    renderStatus();
  });
  $("run").onclick = runToggle;
  $("step").onclick = doStep;
  $("back").onclick = doBack;
  $("reset").onclick = doReset;
  $("examples").onchange = e => { if (e.target.value !== "custom") chooseExample(e.target.value); else { saveSource(); ui.example = "custom"; localStorage.setItem(STORE.ex, "custom"); setSource(localStorage.getItem(STORE.src + "custom") || srcEl.value); } };
  $("speed").value = ui.speed;
  $("speed").onchange = e => { ui.speed = e.target.value; localStorage.setItem(STORE.speed, ui.speed); };
  document.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => { ui.lang = b.dataset.lang; localStorage.setItem(STORE.lang, ui.lang); render(); });
  document.querySelectorAll(".viewbar [data-view]").forEach(b => b.onclick = () => setView(b.dataset.view));
  document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; render(); });
  $("memAddr").addEventListener("change", e => {
    const v = e.target.value.trim(), mm = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})h?$/i.exec(v), one = /^([0-9a-f]{1,4})h?$/i.exec(v);
    if (mm) ui.mem = { seg: parseInt(mm[1], 16), off: parseInt(mm[2], 16) };
    else if (one) ui.mem = { seg: m.cpu.s[3], off: parseInt(one[1], 16) };
    render();
  });
  $("view").addEventListener("wheel", e => {
    if (ui.tab !== "memory" || !ui.mem) return;
    e.preventDefault();
    ui.mem = { seg: ui.mem.seg, off: (ui.mem.off + Math.sign(e.deltaY) * 64) & 0xFFFF };
    render();
  }, { passive: false });
  $("problemMore").addEventListener("click", e => {
    const b = e.target.closest("[data-goto]");
    if (!b) return;
    const line = Number(b.dataset.goto), lines = srcEl.value.split("\n");
    const pos = lines.slice(0, line).reduce((a, l) => a + l.length + 1, 0);
    srcEl.focus();
    srcEl.setSelectionRange(pos, pos + (lines[line] || "").length);
    scrollToLine(line);
  });
  $("crt").addEventListener("keydown", onScreenKey);
  $("bigCrt").addEventListener("keydown", e => { if (e.key === "Escape" && !m.waiting) { openModal(false); return; } onScreenKey(e); });
  $("expandBtn").onclick = () => openModal(true);
  $("closeModal").onclick = () => openModal(false);
  $("modal").addEventListener("click", e => { if (e.target === $("modal")) openModal(false); });
  $("boardSpeed").oninput = e => { ui.boardSpeed = Number(e.target.value); };
  $("showFetch").onchange = e => { ui.showFetch = e.target.checked; };
  $("shareBtn").onclick = async () => {
    const url = `${location.href.split("#")[0]}#src=${encodeSource(srcEl.value)}`;
    try { await navigator.clipboard.writeText(url); toast(ui.lang === "hi" ? "Link copy ho gaya" : "Link copied"); }
    catch { history.replaceState(null, "", url); toast(ui.lang === "hi" ? "Link address bar mein hai" : "Link is in the address bar"); }
  };
  $("saveBtn").onclick = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([srcEl.value], { type: "text/plain" }));
    a.download = $("fileName").textContent || "program.asm";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $("openBtn").onclick = () => $("fileInput").click();
  $("fileInput").onchange = e => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(text => {
      saveSource();
      ui.example = "custom";
      $("examples").value = "custom";
      $("fileName").textContent = f.name;
      localStorage.setItem(STORE.ex, "custom");
      setSource(text);
    });
    e.target.value = "";
  };
  document.addEventListener("keydown", e => {
    const typing = e.target === srcEl || e.target === $("memAddr") || e.target.closest(".crt");
    if (!typing && (m.waiting || ui.pendingStep) && keyFrom(e)) { onScreenKey(e); return; }
    if (e.key === "F5") { e.preventDefault(); if (!$("run").disabled) runToggle(); }
    else if (e.key === "F10" && e.shiftKey) { e.preventDefault(); if (!$("back").disabled) doBack(); }
    else if (e.key === "F10") { e.preventDefault(); if (!$("step").disabled) doStep(); }
  });
  new ResizeObserver(() => { fitCrt($("crt"), $("crt").clientWidth); if (ui.view === "panels") renderScreen(); }).observe($("crt"));
  new ResizeObserver(() => { if (ui.view === "board") fitBoard(); }).observe($("stage"));
  REDUCED.addEventListener("change", () => render());
}

function boot() {
  initExamples();
  initBoard();
  bind();
  const hash = /#src=([\w-]+)/.exec(location.hash);
  let src = null;
  if (hash) {
    try { src = decodeSource(hash[1]); ui.example = "custom"; } catch { src = null; }
  }
  if (!EXAMPLES.some(e => e.id === ui.example) && ui.example !== "custom") ui.example = "factorial";
  $("examples").value = ui.example;
  const ex = EXAMPLES.find(e => e.id === ui.example);
  $("fileName").textContent = ex ? ex.file : "program.asm";
  if (src === null) src = localStorage.getItem(STORE.src + ui.example) ?? (ex ? ex.src : EXAMPLES[1].src);
  srcEl.value = src;
  paintSource();
  fitCrt($("crt"), $("crt").clientWidth);
  assembleNow(true);
  setView(ui.view);
}

boot();
