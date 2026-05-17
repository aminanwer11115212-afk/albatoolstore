// Shared helpers for HMAC-signed customer statement tokens.
// Token format: base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson, secret))
// Payload: { c: customer_id (uuid), e: exp (unix seconds), v: 1 }

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface StatementPayload {
  c: string; // customer_id
  e: number; // expiry unix seconds
  v: number; // version
}

export async function signStatementToken(
  customerId: string,
  expSeconds: number,
  secret: string,
): Promise<string> {
  const payload: StatementPayload = { c: customerId, e: expSeconds, v: 1 };
  const payloadBytes = enc.encode(JSON.stringify(payload));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, payloadBytes));
  return `${b64urlEncode(payloadBytes)}.${b64urlEncode(sig)}`;
}

export async function verifyStatementToken(
  token: string,
  secret: string,
): Promise<StatementPayload> {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("malformed token");
  const payloadBytes = b64urlDecode(parts[0]);
  const sigBytes = b64urlDecode(parts[1]);
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, payloadBytes);
  if (!ok) throw new Error("invalid signature");
  let payload: StatementPayload;
  try {
    payload = JSON.parse(dec.decode(payloadBytes));
  } catch {
    throw new Error("invalid payload");
  }
  if (!payload.c || !payload.e) throw new Error("invalid payload");
  if (Date.now() / 1000 > payload.e) throw new Error("token expired");
  return payload;
}
