import { createHmac, randomInt } from "node:crypto";

export function gerarCodigoEmail(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCodigoEmail(codigo: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET não configurado.");
  return createHmac("sha256", secret).update(codigo).digest("hex");
}