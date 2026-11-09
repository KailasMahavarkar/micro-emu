const EXAMPLES = [
  {
    id: "hello", title: "Hello, world", file: "hello.asm", src: `; Hello world: print a message with DOS
org 100h

    mov dx, offset msg  ; DS:DX points to the text
    mov ah, 9           ; DOS service 9: print until '$'
    int 21h

    mov ah, 4Ch         ; DOS service 4Ch: exit
    int 21h

msg db 'Hello from the 8086!', 13, 10, '$'
`
  },
  {
    id: "factorial", title: "Factorial of 5", file: "fact.asm", src: `; Factorial of 5, prints 120
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
`
  },
  {
    id: "sum", title: "Sum of an array (EXE)", file: "sum.asm", src: `; Sum of an array, printed in decimal (EXE program)
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
`
  },
  {
    id: "sort", title: "Bubble sort (MASM segments)", file: "sort.asm", src: `; Bubble sort (ascending), classic MASM segment style
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
`
  },
  {
    id: "reverse", title: "Reverse a string", file: "reverse.asm", src: `; Reverse a string using the stack
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
`
  },
  {
    id: "video", title: "Paint video memory", file: "video.asm", src: `; Paint straight into text video memory at B800:0000
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
`
  },
  {
    id: "upper", title: "Uppercase as you type", file: "upper.asm", src: `; Type letters: they come back in UPPERCASE. Press Enter to stop.
org 100h

    mov dx, offset prompt
    mov ah, 9
    int 21h
read:
    mov ah, 8           ; read a key, no echo
    int 21h
    cmp al, 13          ; Enter?
    je done
    cmp al, 'a'
    jb show
    cmp al, 'z'
    ja show
    sub al, 32          ; 'a'..'z' becomes 'A'..'Z'
show:
    mov dl, al
    mov ah, 2
    int 21h
    jmp read
done:
    mov ah, 4Ch
    int 21h

prompt db 'Type something: $'
`
  },
  {
    id: "macros", title: "Add two numbers (emu8086.inc)", file: "add.asm", src: `; Add two numbers with the emu8086.inc helpers
include 'emu8086.inc'
org 100h

    print 'Enter first number: '
    call scan_num       ; CX = the number typed
    mov ax, cx
    printn ''
    print 'Enter second number: '
    call scan_num
    add ax, cx
    printn ''
    print 'Sum = '
    call print_num      ; prints AX
    ret

define_scan_num
define_print_num
define_print_num_uns
`
  }
];

if (typeof module !== "undefined") module.exports = { EXAMPLES };
