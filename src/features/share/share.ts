const HASH_KEY = "src";
const HASH_PATTERN = new RegExp(`#${HASH_KEY}=([\\w-]*)`);

export const encodeSource = (source: string): string => {
  const binary = Array.from(new TextEncoder().encode(source), b => String.fromCharCode(b)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

export const decodeSource = (encoded: string): string | null => {
  try {
    const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch {
    return null;
  }
};

export const shareUrl = (base: string, source: string): string => `${base.split("#")[0] ?? base}#${HASH_KEY}=${encodeSource(source)}`;

export const sourceFromHash = (hash: string): string | null => {
  const m = HASH_PATTERN.exec(hash);
  return m ? decodeSource(m[1]) : null;
};
