export type SyntaxKind = "op" | "reg" | "number" | "string" | "comment" | "label" | "dir";
export interface SyntaxToken { text: string; kind: SyntaxKind | null }
export type LineState = "current" | "error" | "plain";
