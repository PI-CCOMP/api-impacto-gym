import { randomUUID } from "node:crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Perfil } from "../types";

const secret = process.env.JWT_SECRET;

if (!secret || secret.length < 32) {
  throw new Error("JWT_SECRET deve ter no mínimo 32 caracteres.");
}

export interface AccessClaims extends JwtPayload {
  perfil: Perfil;
  id_usuario: number;
  sid: string;
  tipo?: string;
}

export function criarAccessToken(
  idUsuario: number,
  perfil: Perfil,
  sessionId: string,
): string {
  return jwt.sign(
    {
      perfil,
      id_usuario: idUsuario,
      sid: sessionId,
    },
    secret!,
    { subject: String(idUsuario), expiresIn: "15m" },
  );
}

export function criarRefreshToken(idUsuario: number, sessionId: string): string {
  return jwt.sign({ tipo: "refresh", sid: sessionId }, secret!, {
    subject: String(idUsuario),
    expiresIn: "7d",
  });
}

export function verificarAccessToken(token: string): AccessClaims {
  const claims = jwt.verify(token, secret!) as AccessClaims;
  if (!claims.id_usuario || !claims.perfil || !claims.sid) {
    throw new Error("Access token inválido.");
  }
  return claims;
}

export function verificarRefreshToken(token: string): AccessClaims {
  const claims = jwt.verify(token, secret!) as AccessClaims;
  if (claims.tipo !== "refresh" || !claims.sid || !claims.sub) {
    throw new Error("Refresh token inválido.");
  }
  return claims;
}

export function novoIdSessao(): string {
  return randomUUID();
}

export interface PendingUploadClaims extends JwtPayload {
  id_usuario: number;
  tipo: "upload_laudo_pendente";
}

export function criarTokenUploadLaudo(idUsuario: number): string {
  return jwt.sign(
    { id_usuario: idUsuario, tipo: "upload_laudo_pendente" },
    secret!,
    { subject: String(idUsuario), expiresIn: "30m" },
  );
}

export function verificarTokenUploadLaudo(token: string): PendingUploadClaims {
  const claims = jwt.verify(token, secret!) as PendingUploadClaims;
  if (claims.tipo !== "upload_laudo_pendente" || !claims.id_usuario) {
    throw new Error("Token de upload inválido.");
  }
  return claims;
}