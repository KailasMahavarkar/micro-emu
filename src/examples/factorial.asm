; Factorial of 5, prints 120
org 100h

    mov cx, 5           ; n = 5
    mov ax, 1           ; result = 1
fact:
    mul cx              ; DX:AX = AX * CX
    loop fact           ; CX = CX - 1, repeat while CX is not 0

    mov bx, 10          ; now print AX in decimal
    xor cx, cx          ; digit count = 0
digits:
    xor dx, dx
    div bx              ; AX = AX / 10, DX = remainder
    push dx             ; save the digit
    inc cx
    test ax, ax
    jnz digits
print:
    pop dx
    add dl, '0'         ; digit to ASCII
    mov ah, 2           ; DOS: print the character in DL
    int 21h
    loop print
    ret                 ; back to DOS
