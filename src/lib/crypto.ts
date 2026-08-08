// End-to-end encryption helpers with owner key escrow.
// - Each user has an RSA-OAEP 2048 keypair. Private key stays in this browser (localStorage).
//   Public key is published to profiles.public_key so others can wrap conversation keys for them.
// - Each conversation has a random AES-GCM 256 key, wrapped once per participant (and once for the owner = escrow).
// - Messages: ciphertext = AES-GCM(content, convKey, iv). Stored as base64.
//
// Tradeoff: device-local private keys mean a user only sees plaintext on this device. The owner
// escrow lets the platform owner recover plaintext for moderation if ever needed.

import { supabase } from "@/integrations/supabase/client";

const PRIV_KEY_PREFIX = "socialite:e2e:priv:";

const b64encode = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64decode = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

const RSA_ALG: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_ALG = { name: "AES-GCM", length: 256 } as const;

// In-memory caches to avoid recomputing
const privKeyCache = new Map<string, CryptoKey>();
const convKeyCache = new Map<string, CryptoKey>();

async function importPubKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwkStr), RSA_ALG, true, ["wrapKey", "encrypt"]);
}

async function importPrivKey(jwkStr: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", JSON.parse(jwkStr), RSA_ALG, true, ["unwrapKey", "decrypt"]);
}

export async function ensureUserKeypair(userId: string): Promise<string> {
  // Returns the user's public key JWK string. Generates a new keypair if missing.
  const existingPub = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", userId)
    .single();
  const localPriv = localStorage.getItem(PRIV_KEY_PREFIX + userId);

  if (existingPub.data?.public_key && localPriv) {
    privKeyCache.set(userId, await importPrivKey(localPriv));
    return existingPub.data.public_key;
  }

  // Need to (re)generate. If a server pub exists but no local priv, the user is on a new device:
  // generate a new pair and overwrite. Old messages on other devices stay decryptable; new ones
  // use the new key. Owner escrow remains as a safety net.
  const kp = await crypto.subtle.generateKey(RSA_ALG, true, ["wrapKey", "unwrapKey", "encrypt", "decrypt"]);
  const pubJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const pubStr = JSON.stringify(pubJwk);
  localStorage.setItem(PRIV_KEY_PREFIX + userId, JSON.stringify(privJwk));
  privKeyCache.set(userId, kp.privateKey);

  await supabase.from("profiles").update({ public_key: pubStr }).eq("id", userId);
  return pubStr;
}

async function getPrivKey(userId: string): Promise<CryptoKey | null> {
  if (privKeyCache.has(userId)) return privKeyCache.get(userId)!;
  const raw = localStorage.getItem(PRIV_KEY_PREFIX + userId);
  if (!raw) return null;
  const k = await importPrivKey(raw);
  privKeyCache.set(userId, k);
  return k;
}

async function wrapAesKey(aes: CryptoKey, pubJwk: string): Promise<string> {
  const pub = await importPubKey(pubJwk);
  const wrapped = await crypto.subtle.wrapKey("raw", aes, pub, { name: "RSA-OAEP" });
  return b64encode(wrapped);
}

async function unwrapAesKey(wrappedB64: string, priv: CryptoKey): Promise<CryptoKey> {
  const wrapped = b64decode(wrappedB64);
  return crypto.subtle.unwrapKey(
    "raw",
    wrapped,
    priv,
    { name: "RSA-OAEP" },
    AES_ALG,
    true,
    ["encrypt", "decrypt"],
  );
}

async function getOwnerInfo(): Promise<{ id: string; publicKey: string | null } | null> {
  const { data: ownerRow } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!ownerRow?.user_id) return null;
  const { data: op } = await supabase
    .from("profiles")
    .select("public_key")
    .eq("id", ownerRow.user_id)
    .single();
  return { id: ownerRow.user_id, publicKey: op?.public_key ?? null };
}

/**
 * Wraps the AES conv key for any participant (or owner escrow) that doesn't already
 * have a wrapped_key row but now has a published public_key. Safe to call repeatedly.
 * Critical: this is how a recipient who joined the platform after the conversation
 * was created (or rotated their device key) finally receives the existing key without
 * us rotating it — so past messages stay decryptable for everyone.
 */
export async function rewrapConversationKeyForMissingParticipants(
  conversationId: string,
  aes: CryptoKey,
  participantIds: string[],
): Promise<number> {
  const ids = Array.from(new Set(participantIds));
  const { data: existing } = await supabase
    .from("conversation_keys")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const have = new Set((existing || []).map((r: any) => r.user_id));

  const owner = await getOwnerInfo();
  const targets: { id: string; publicKey: string | null; isEscrow: boolean }[] = [];

  if (ids.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, public_key")
      .in("id", ids);
    for (const p of profs || []) {
      if (!have.has(p.id) && p.public_key) targets.push({ id: p.id, publicKey: p.public_key, isEscrow: false });
    }
  }
  if (owner && owner.publicKey && !have.has(owner.id) && !ids.includes(owner.id)) {
    targets.push({ id: owner.id, publicKey: owner.publicKey, isEscrow: true });
  }

  if (!targets.length) return 0;
  const rows: { conversation_id: string; user_id: string; wrapped_key: string; is_escrow: boolean }[] = [];
  for (const t of targets) {
    try {
      rows.push({
        conversation_id: conversationId,
        user_id: t.id,
        wrapped_key: await wrapAesKey(aes, t.publicKey!),
        is_escrow: t.isEscrow,
      });
    } catch (e) {
      console.warn("Rewrap failed for", t.id, e);
    }
  }
  if (rows.length) {
    await supabase.from("conversation_keys").upsert(rows, { onConflict: "conversation_id,user_id" });
  }
  return rows.length;
}

export async function ensureConversationKey(
  conversationId: string,
  myUserId: string,
  otherUserIds: string[],
): Promise<CryptoKey | null> {
  if (convKeyCache.has(conversationId)) {
    const k = convKeyCache.get(conversationId)!;
    // Best-effort rewrap for any participants that still don't have a copy.
    rewrapConversationKeyForMissingParticipants(conversationId, k, [myUserId, ...otherUserIds]).catch(() => {});
    return k;
  }

  // Make sure our own keypair is published before we even look at this conversation.
  await ensureUserKeypair(myUserId);

  // Try to read our wrapped copy
  const { data: mine } = await supabase
    .from("conversation_keys")
    .select("wrapped_key")
    .eq("conversation_id", conversationId)
    .eq("user_id", myUserId)
    .maybeSingle();

  const priv = await getPrivKey(myUserId);

  if (mine?.wrapped_key && priv) {
    try {
      const key = await unwrapAesKey(mine.wrapped_key, priv);
      convKeyCache.set(conversationId, key);
      rewrapConversationKeyForMissingParticipants(conversationId, key, [myUserId, ...otherUserIds]).catch(() => {});
      return key;
    } catch (e) {
      console.warn("Could not unwrap conversation key", e);
    }
  }

  // We don't have a wrapped copy. Critical: only generate a fresh AES key if NO key
  // exists for this conversation yet. Otherwise generating a new one would orphan
  // everything the other participant already encrypted. In that case the other
  // participant (or owner) must rewrap for us — they'll do it next time they open
  // the chat, and our realtime subscription on conversation_keys picks it up.
  const { count } = await supabase
    .from("conversation_keys")
    .select("user_id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if ((count || 0) > 0) {
    return null;
  }

  const aes = await crypto.subtle.generateKey(AES_ALG, true, ["encrypt", "decrypt"]);
  convKeyCache.set(conversationId, aes);
  await rewrapConversationKeyForMissingParticipants(conversationId, aes, [myUserId, ...otherUserIds]);
  return aes;
}

/** Unwrap and cache a wrapped key that arrived via realtime. */
export async function adoptWrappedKey(
  conversationId: string,
  wrappedB64: string,
  myUserId: string,
): Promise<CryptoKey | null> {
  const priv = await getPrivKey(myUserId);
  if (!priv) return null;
  try {
    const key = await unwrapAesKey(wrappedB64, priv);
    convKeyCache.set(conversationId, key);
    return key;
  } catch (e) {
    console.warn("adoptWrappedKey failed", e);
    return null;
  }
}

export async function encryptText(plaintext: string, key: CryptoKey): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { ciphertext: b64encode(ct), iv: b64encode(iv.buffer) };
}

export async function decryptText(ciphertextB64: string, ivB64: string, key: CryptoKey): Promise<string> {
  const ct = b64decode(ciphertextB64);
  const iv = b64decode(ivB64);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, ct);
  return dec.decode(pt);
}
