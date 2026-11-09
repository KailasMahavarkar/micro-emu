; Exercises every instruction class the board knows, then exits
org 100h

start:
    mov ax, 1234h
    mov bx, 5
    shl ax, 1
    mov cl, 3
    shr ax, cl
    rol bx, 1
    sar ax, 1
    rcl bx, 1
    rcr bx, 1
    ror bx, cl
    neg bx
    not bx
    mov ax, -7
    mov bl, 3
    imul bl
    mov ax, 100
    cwd
    mov bx, -7
    idiv bx
    mov al, 0F0h
    cbw
    lea si, [bx+si+4]
    mov si, offset src
    mov di, offset dst
    push ds
    pop es
    cld
    mov cx, 4
    rep movsb
    mov si, offset src
    mov di, offset dst
    mov cx, 4
    repe cmpsb
    mov di, offset src
    mov al, 'C'
    mov cx, 4
    repne scasb
    mov bx, offset table
    mov al, 2
    xlat
    mov si, offset src
    lodsw
    mov di, offset dst
    stosw
    xchg ax, dx
    xchg bl, [si]
    pushf
    popf
    clc
    stc
    cmc
    std
    cld
    cli
    sti
    lahf
    sahf
    mov al, 9
    add al, 5
    aaa
    mov al, 38h
    add al, 45h
    daa
    sub al, 19h
    das
    mov al, 9
    sub al, 12
    aas
    mov al, 27
    aam
    aad
    in al, 60h
    out 61h, al
    mov dx, 61h
    out dx, al
    in al, dx
    les di, farptr
    push cs
    pop es
    call near_proc
    call far_proc
    call far ptr far_proc
    mov ax, offset back_here
    push cs
    push ax
    retf
back_here:
    mov cx, 3
    xor ax, ax
again:
    inc ax
    cmp ax, 10
    loopne again
    jcxz no_jump
no_jump:
    mov word ptr [counter], 2
    inc word ptr [counter]
    dec byte ptr [counter]
    add [counter], ax
    sub word ptr [counter], 1
    and byte ptr [counter], 0Fh
    or word ptr [counter], 100h
    xor word ptr [counter], 1
    test byte ptr [counter], 1
    neg word ptr [counter]
    shl word ptr [counter], 1
    push word ptr [counter]
    pop word ptr [counter2]
    mov ah, 2
    mov dl, '!'
    int 21h
    mov ah, 0Eh
    mov al, '+'
    int 10h
    mov ah, 2
    mov dh, 3
    mov dl, 4
    int 10h
    mov ax, 0B800h
    mov es, ax
    mov word ptr es:[0], 2F41h
    mov ah, 4Ch
    mov al, 0
    int 21h

near_proc proc near
    ret
near_proc endp

far_proc proc far
    mov bp, 0FA2h
    ret
far_proc endp

src     db 'ABCD'
dst     db 4 dup(0)
table   db 10, 20, 30, 40
farptr  dw 1234h, 5678h
counter dw 0
counter2 dw 0
