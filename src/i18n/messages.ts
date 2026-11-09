import type { AsmErrorCode, NoticeCode } from "../emulator/index.ts";
import type { Lang } from "./types.ts";

export interface MessageText { what: string; why: string; fix: string }
export type ProblemCode = AsmErrorCode | NoticeCode;

export const MESSAGES: Readonly<Record<ProblemCode, Record<Lang, MessageText>>> = {
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
