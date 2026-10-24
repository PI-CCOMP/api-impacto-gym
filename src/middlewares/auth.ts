import { Request, Response, NextFunction } from "express";
import { UsuarioToken, Perfil } from "../types";
import pool from "../config/database";
import { verificarAccessToken } from "../config/tokens";

/**
 * Verifica localmente o JWT e confirma que a sessão segue ativa no PostgreSQL.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res
      .status(401)
      .json({ erro: "Token não fornecido.", codigo: "TOKEN_AUSENTE" });
    return;
  }

  const token = header.slice(7);

  let claims;
  try {
    claims = verificarAccessToken(token);
  } catch {
    res
      .status(401)
      .json({ erro: "Token inválido ou expirado.", codigo: "TOKEN_INVALIDO" });
    return;
  }

  try {
    const { rows } = await pool.query<{
      id: number;
      perfil: Perfil;
      email_verificado: boolean;
      status: string | null;
    }>(
      `SELECT u.id, u.perfil, u.email_verificado, a.status
       FROM usuarios u
       LEFT JOIN alunos a ON a.id_usuario = u.id
      JOIN auth_sessoes s ON s.id = $2 AND s.id_usuario = u.id
      WHERE u.id = $1 AND s.expira_em > NOW()`,
      [claims.id_usuario, claims.sid],
    );

    if (rows.length === 0) {
      res.status(401).json({
        erro: "Usuário não encontrado.",
        codigo: "USUARIO_NAO_ENCONTRADO",
      });
      return;
    }

    if (!rows[0].email_verificado) {
      res.status(403).json({
        erro: "Confirme seu e-mail antes de acessar o sistema.",
        codigo: "EMAIL_NAO_VERIFICADO",
      });
      return;
    }

    // Alunos inativos/pendentes/rejeitados não acessam rotas protegidas
    if (rows[0].perfil === "aluno" && rows[0].status !== "ativo") {
      res.status(403).json({
        erro: "Cadastro pendente de aprovação.",
        codigo: "CADASTRO_INATIVO",
      });
      return;
    }

    req.user = {
      id: String(rows[0].id),
      id_usuario: rows[0].id,
      perfil: rows[0].perfil,
      session_id: claims.sid,
    } satisfies UsuarioToken;

    next();
  } catch {
    res
      .status(500)
      .json({ erro: "Erro interno no servidor.", codigo: "ERRO_INTERNO" });
  }
}

/**
 * RBAC — deve vir após authMiddleware.
 * Uso: authorize('admin', 'recepcionista')
 */
export function authorize(...perfis: Perfil[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !perfis.includes(req.user.perfil)) {
      res.status(403).json({
        erro: "Acesso não autorizado para este perfil.",
        codigo: "SEM_PERMISSAO",
      });
      return;
    }
    next();
  };
}
