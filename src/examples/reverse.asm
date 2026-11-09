; Reverse a string using the stack
org 100h

    mov si, offset text
    xor cx, cx
save:
    mov al, [si]
    cmp al, '$'
    je show
    push ax             ; the stack keeps each character
    inc si
    inc cx
    jmp save
show:
    pop dx              ; last in, first out
    mov ah, 2
    int 21h
    loop show

    mov ah, 4Ch
    int 21h

text db '8086 LAB$'
