; Bubble sort (ascending), classic MASM segment style
data segment
    arr  db 45, 12, 78, 3, 56, 23, 9
    n    equ 7
    msg  db 'Sorted: $'
data ends

code segment
assume cs:code, ds:data
start:
    mov ax, data
    mov ds, ax

    mov ch, n - 1       ; number of passes
outer:
    mov cl, ch
    mov si, offset arr
inner:
    mov al, [si]
    cmp al, [si+1]
    jbe no_swap         ; already in order
    xchg al, [si+1]
    mov [si], al
no_swap:
    inc si
    dec cl
    jnz inner
    dec ch
    jnz outer

    mov dx, offset msg
    mov ah, 9
    int 21h

    mov si, offset arr
    mov cx, n
print_all:
    mov al, [si]
    xor ah, ah
    call print_num
    mov dl, ' '
    mov ah, 2
    int 21h
    inc si
    loop print_all

    mov ah, 4Ch
    int 21h

; prints AX (0 to 255) in decimal
print_num proc
    push cx
    mov bx, 10
    xor cx, cx
pn_split:
    xor dx, dx
    div bx
    push dx
    inc cx
    test ax, ax
    jnz pn_split
pn_show:
    pop dx
    add dl, '0'
    mov ah, 2
    int 21h
    loop pn_show
    pop cx
    ret
print_num endp
code ends
end start
