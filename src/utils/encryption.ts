import crypto from "crypto";

const algorithm = "aes-256-cbc";
const ivLength = 16; // 128-bit
const secretKey = (process.env.ENCRYPTION_SECRET_KEY || "12345678901234567890123456789012").slice(0, 32); // ensure 32-byte

const keyBuffer = Buffer.from(secretKey, "utf-8");

export const encrypt = (text: string): string => {
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  let encrypted = cipher.update(text, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
};

export const decrypt = (text: string): string => {
  try {
    const parts = text.split(":");
    if (parts.length !== 2) throw new Error("Invalid encrypted format");

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err) {
    throw new Error("Failed to decrypt: " + err.message);
  }
};
