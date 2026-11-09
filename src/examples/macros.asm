; Add two numbers with the emu8086.inc helpers
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
