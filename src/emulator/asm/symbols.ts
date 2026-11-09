export type DataSize = 1 | 2 | 4;

interface SymbolBase { name: string; defLine: number }
export interface EquSymbol extends SymbolBase { kind: "equ"; v: number }
export interface SegmentSymbol extends SymbolBase { kind: "seg"; v: number | undefined; seg: string }
export interface VarSymbol extends SymbolBase { kind: "var"; seg: string; off: number; size: DataSize }
export interface LabelSymbol extends SymbolBase { kind: "label"; seg: string; off: number; far: boolean }
export type AsmSymbol = EquSymbol | SegmentSymbol | VarSymbol | LabelSymbol;
export type AddressSymbol = VarSymbol | LabelSymbol;
export type SymbolTable = Map<string, AsmSymbol>;

export const BUILTIN_DEFINITION = -1;
