import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import { verificarTokenUploadLaudo } from "../config/tokens";

export async function autorizarUploadLaudoPendente(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ erro: "Token não fornecido.", codigo: "TOKEN_AUSENTE" });
    return;
  }

  try {
    const claims = verificarTokenUploadLaudo(header.slice(7));
    if (String(claims.id_usuario) !== req.params.id_aluno) {
      res.status(403).json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
      return;
    }
    const { rows } = await pool.query(
      `SELECT 1 FROM usuarios u
       JOIN alunos a ON a.id_usuario = u.id
       WHERE u.id = $1 AND u.email_verificado = true AND a.status = 'pendente'`,
      [claims.id_usuario],
    );
    if (rows.length === 0) {
      res.status(403).json({ erro: "Cadastro não está pendente.", codigo: "CADASTRO_INATIVO" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ erro: "Token inválido ou expirado.", codigo: "TOKEN_INVALIDO" });
  }
}