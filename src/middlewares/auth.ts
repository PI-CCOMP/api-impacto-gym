import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import { UsuarioToken, Perfil } from "../types";
import pool from "../config/database";

/**
 * Verifica o JWT emitido pelo Supabase Auth.
 * Popula req.user com { id, perfil, mfa_verificado }.
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

  // Valida o token com o Supabase — não verifica localmente para evitar
  // tokens revogados circulando.
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    res
      .status(401)
      .json({ erro: "Token inválido ou expirado.", codigo: "TOKEN_INVALIDO" });
    return;
  }

  // Busca o perfil do usuário na nossa tabela (Supabase Auth não armazena perfil)
  try {
    const { rows } = await pool.query<{
      id: number;
      perfil: Perfil;
      status: string | null;
    }>(
      `SELECT u.id, u.perfil, a.status
       FROM usuarios u
       LEFT JOIN alunos a ON a.id_usuario = u.id
       WHERE u.id_auth = $1`,
      [data.user.id],
    );

    if (rows.length === 0) {
      res.status(401).json({
        erro: "Usuário não encontrado.",
        codigo: "USUARIO_NAO_ENCONTRADO",
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

    const mfa_verificado = (data.user.factors ?? []).some(
      (f: any) => f.status === "verified",
    );

    req.user = {
      id: data.user.id,
      id_usuario: rows[0].id,
      perfil: rows[0].perfil,
      mfa_verificado,
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

/**
 * Exige que o usuário tenha passado pelo MFA antes de ações sensíveis
 * (alterar senha, alterar e-mail).
 */
export function requireMfa(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.user?.mfa_verificado) {
    res
      .status(403)
      .json({ erro: "Verificação MFA necessária.", codigo: "MFA_REQUERIDO" });
    return;
  }
  next();
}
