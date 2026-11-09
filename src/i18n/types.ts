export const LANGS = ["en", "hi"] as const;
export type Lang = (typeof LANGS)[number];
