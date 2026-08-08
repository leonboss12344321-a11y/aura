// AES-GCM encrypt/decrypt for pending password-change requests, using PW_REQUEST_ENC_KEY.
// Passwords are never stored in plaintext at rest; only edge functions with the key can decrypt.

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("PW_REQUEST_ENC_KEY");
  if (!raw) throw new Error("PW_REQUEST_ENC_KEY is not configured");
  // Derive a 256-bit key from the secret via SHA-256, then import for AES-GCM.
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(bytes: Uint8Array): string {
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptPassword(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext),
  ));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv, 0);
  combined.set(ct, iv.length);
  return b64encode(combined);
}

export async function decryptPassword(ciphertextB64: string): Promise<string> {
  const key = await getKey();
  const combined = b64decode(ciphertextB64);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
