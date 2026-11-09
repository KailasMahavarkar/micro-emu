; Hello world: print a message with DOS
org 100h

    mov dx, offset msg  ; DS:DX points to the text
    mov ah, 9           ; DOS service 9: print until '$'
    int 21h

    mov ah, 4Ch         ; DOS service 4Ch: exit
    int 21h

msg db 'Hello from the 8086!', 13, 10, '$'
