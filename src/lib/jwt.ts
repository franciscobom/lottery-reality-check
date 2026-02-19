import { EncryptJWT, jwtDecrypt } from "jose";

interface SessionPayload {
  seed: string;
  jackpotIndex: number;
  lotteryType: string;
}

// Generate or use a stable key for JWE encryption.
// In production, set JWT_SECRET env var. Falls back to a default for dev.
function getEncryptionKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "lottery-reality-check-dev-secret-key-32b!";
  // jose needs a key of specific length. We'll use first 32 bytes (A256GCM).
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(secret);
  // Pad or truncate to 32 bytes
  const key = new Uint8Array(32);
  key.set(keyBytes.slice(0, 32));
  return key;
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string> {
  const key = getEncryptionKey();

  const jwt = await new EncryptJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .encrypt(key);

  return jwt;
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload> {
  const key = getEncryptionKey();

  const { payload } = await jwtDecrypt(token, key);

  return {
    seed: payload.seed as string,
    jackpotIndex: payload.jackpotIndex as number,
    lotteryType: payload.lotteryType as string,
  };
}
