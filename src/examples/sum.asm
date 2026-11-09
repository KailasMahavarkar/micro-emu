; Sum of an array, printed in decimal (EXE program)
.model small
.stack 100h

.data
nums  db 12, 7, 30, 5, 21
count equ 5
msg   db 'Sum = $'

.code
main proc
    mov ax, @data
    mov ds, ax          ; DS must point to our data

    mov si, offset nums
    mov cx, count
    xor ax, ax
add_next:
    add al, [si]        ; add one byte
    adc ah, 0           ; keep the carry in AH
    inc si
    loop add_next

    push ax
    mov dx, offset msg
    mov ah, 9
    int 21h
    pop ax
    call print_ax       ; prints 75

    mov ah, 4Ch
    int 21h
main endp

; prints AX in decimal
print_ax proc
    mov bx, 10
    xor cx, cx
split:
    xor dx, dx
    div bx              ; AX = AX / 10, DX = digit
    push dx
    inc cx
    test ax, ax
    jnz split
show:
    pop dx
    add dl, '0'
    mov ah, 2
    int 21h
    loop show
    ret
print_ax endp
end main
