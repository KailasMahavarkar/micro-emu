; Paint straight into text video memory at B800:0000
org 100h

    mov ax, 0B800h
    mov es, ax          ; ES = the text screen
    cld

    mov di, (10 * 80 + 30) * 2   ; row 10, column 30
    mov si, offset banner
    mov ah, 1Fh         ; white on blue
paint:
    lodsb               ; AL = next character
    cmp al, 0
    je rainbow_start
    stosw               ; character + colour
    jmp paint

rainbow_start:
    mov di, (12 * 80 + 24) * 2
    mov cx, 32
    mov ax, 01DBh       ; solid block, colour 1
rainbow:
    stosw
    inc ah
    and ah, 0Fh
    jnz next_block
    inc ah              ; skip colour 0 (black)
next_block:
    loop rainbow

    mov di, (13 * 80 + 24) * 2
    mov cx, 32
    mov ax, 0EDFh       ; upper half block, yellow
    rep stosw           ; 32 cells in one instruction

    mov ah, 4Ch
    int 21h

banner db ' 8086 LAB IS ALIVE ', 0
