import { createDecipheriv } from 'crypto';

const sealed = "446b01e81b1c834c0fb528de:48dc0c09e5c176f1d5dc2073088f93c525e242986266ac47c5a4f961d2a2da577d0a7ae4b5ab443a0f07bd92df430b1bdf9a293b08bfd6b60b72827e57a7e24d:6018027723c64d91a6bec2e2d4374905";
const sealingKey = Buffer.from("0000000000000000000000000000000000000000000000000000000000000001", "hex");

const parts = sealed.split(":");
const iv = Buffer.from(parts[0], "hex");
const encrypted = Buffer.from(parts[1], "hex");
const tag = Buffer.from(parts[2], "hex");

const decipher = createDecipheriv("aes-256-gcm", sealingKey, iv);
decipher.setAuthTag(tag);
const privateKey = decipher.update(encrypted, undefined, "utf8") + decipher.final("utf8");

console.log("Private key:", privateKey);
