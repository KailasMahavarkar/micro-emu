export interface MacroDef {
  params: string[];
  body: string[];
}

const macro = (params: string[], text: string): MacroDef => ({ params, body: text.trim().split("\n") });

const printBody = (tail: string): string => `
    LOCAL pr_str, pr_skip, pr_next, pr_done
    PUSH AX
    PUSH SI
    JMP pr_skip
pr_str DB SDAT${tail}, 0
pr_skip:
    MOV SI, OFFSET pr_str
pr_next:
    MOV AL, CS:[SI]
    CMP AL, 0
    JE pr_done
    MOV AH, 0Eh
    INT 10h
    INC SI
    JMP pr_next
pr_done:
    POP SI
    POP AX`;

const printNumber = (prefix: string, signed: boolean): string => {
  const name = signed ? "PRINT_NUM" : "PRINT_NUM_UNS";
  const sign = signed ? `    TEST AX, AX
    JNS ${prefix}_pos
    PUSH AX
    MOV AL, '-'
    MOV AH, 0Eh
    INT 10h
    POP AX
    NEG AX
${prefix}_pos:` : "";
  return `
${name} PROC NEAR
    PUSH AX
    PUSH BX
    PUSH CX
    PUSH DX
${sign}
    MOV BX, 10
    XOR CX, CX
${prefix}_div:
    XOR DX, DX
    DIV BX
    PUSH DX
    INC CX
    TEST AX, AX
    JNZ ${prefix}_div
${prefix}_out:
    POP AX
    ADD AL, '0'
    MOV AH, 0Eh
    INT 10h
    LOOP ${prefix}_out
    POP DX
    POP CX
    POP BX
    POP AX
    RET
${name} ENDP`;
};

const SCAN_NUM = `
SCAN_NUM PROC NEAR
    PUSH AX
    PUSH BX
    PUSH DX
    PUSH SI
    XOR CX, CX
    XOR SI, SI
sn_next:
    MOV AH, 00h
    INT 16h
    CMP AL, 13
    JE sn_done
    CMP AL, 8
    JE sn_back
    CMP AL, '-'
    JNE sn_digit
    TEST CX, CX
    JNZ sn_next
    MOV SI, 1
    MOV AH, 0Eh
    INT 10h
    JMP sn_next
sn_digit:
    CMP AL, '0'
    JB sn_next
    CMP AL, '9'
    JA sn_next
    MOV AH, 0Eh
    INT 10h
    SUB AL, '0'
    XOR AH, AH
    MOV BX, AX
    MOV AX, CX
    MOV DX, 10
    MUL DX
    ADD AX, BX
    MOV CX, AX
    JMP sn_next
sn_back:
    MOV AX, CX
    XOR DX, DX
    MOV BX, 10
    DIV BX
    MOV CX, AX
    MOV AH, 0Eh
    MOV AL, 8
    INT 10h
    MOV AL, ' '
    INT 10h
    MOV AL, 8
    INT 10h
    JMP sn_next
sn_done:
    TEST SI, SI
    JZ sn_end
    NEG CX
sn_end:
    POP SI
    POP DX
    POP BX
    POP AX
    RET
SCAN_NUM ENDP`;

const PRINT_STRING = `
PRINT_STRING PROC NEAR
    PUSH AX
    PUSH SI
ps_next:
    MOV AL, [SI]
    CMP AL, 0
    JE ps_done
    MOV AH, 0Eh
    INT 10h
    INC SI
    JMP ps_next
ps_done:
    POP SI
    POP AX
    RET
PRINT_STRING ENDP`;

const CLEAR_SCREEN = `
CLEAR_SCREEN PROC NEAR
    PUSH AX
    PUSH BX
    PUSH CX
    PUSH DX
    MOV AX, 0600h
    MOV BH, 07h
    MOV CX, 0
    MOV DX, 184Fh
    INT 10h
    MOV AH, 02h
    MOV BH, 0
    MOV DX, 0
    INT 10h
    POP DX
    POP CX
    POP BX
    POP AX
    RET
CLEAR_SCREEN ENDP`;

export const EMU8086_INC: ReadonlyMap<string, MacroDef> = new Map([
  ["PUTC", macro(["CHAR"], `
    PUSH AX
    MOV AL, CHAR
    MOV AH, 0Eh
    INT 10h
    POP AX`)],
  ["PRINT", macro(["SDAT"], printBody(""))],
  ["PRINTN", macro(["SDAT"], printBody(", 13, 10"))],
  ["GOTOXY", macro(["COL", "ROW"], `
    PUSH AX
    PUSH BX
    PUSH DX
    MOV AH, 02h
    MOV DH, ROW
    MOV DL, COL
    MOV BH, 0
    INT 10h
    POP DX
    POP BX
    POP AX`)],
  ["CURSOROFF", macro([], "    NOP")],
  ["CURSORON", macro([], "    NOP")],
  ["DEFINE_PRINT_NUM", macro([], printNumber("pns", true))],
  ["DEFINE_PRINT_NUM_UNS", macro([], printNumber("pnu", false))],
  ["DEFINE_SCAN_NUM", macro([], SCAN_NUM)],
  ["DEFINE_PRINT_STRING", macro([], PRINT_STRING)],
  ["DEFINE_CLEAR_SCREEN", macro([], CLEAR_SCREEN)]
]);
