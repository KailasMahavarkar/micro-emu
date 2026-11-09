; Type letters: they come back in UPPERCASE. Press Enter to stop.
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
