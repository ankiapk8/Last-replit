/**
 * Encryption utility — AES-256-GCM for encrypting secrets at rest.
 * Used for: API keys, provider secrets, MCP credentials.
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== KEY_HEX_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be a ${KEY_HEX_LENGTH}-character hex string (32 bytes). ` +
      `Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  cachedKey = Buffer.from(keyHex, "hex");
  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns "iv:authTag:ciphertext" (all base64).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt an encrypted string (format: "iv:authTag:ciphertext").
 */
export function decrypt(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format — expected iv:authTag:ciphertext");
  }
  const [ivB64, authTagB64, encryptedB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

/**
 * Mask a secret for display: show only last 4 chars.
 * Example: "sk-abc123xyz" → "sk-***xyz"
 */
export function maskSecret(secret: string, prefixLen = 3): string {
  if (secret.length <= prefixLen + 4) return "***";
  return secret.slice(0, prefixLen) + "***" + secret.slice(-4);
}

/**
 * Hash an API key for storage (one-way, bcrypt-like).
 * Uses SHA-256 with a server-side pepper.
 */
export function hashApiKey(key: string): string {
  const pepper = process.env.ADMIN_API_KEY_PEPPER || "default-pepper-change-me";
  return crypto.createHmac("sha256", pepper).update(key).digest("hex");
}

/**
 * Generate a new admin API key.
 * Format: ak_live_<random> or ak_test_<random>
 */
export function generateApiKey(prefix = "ak_live_"): string {
  const random = crypto.randomBytes(24).toString("base64url");
  return `${prefix}${random}`;
}
