import { timingSafeEqual } from "node:crypto";
import pool from "../config/database";

export async function buscarUsuarioPorEmail(email: string) {
  const { rows } = await pool.query<{
    id: number;
    nome: string;
    email: string;
    perfil: string;
    senha_hash: string;
    email_verificado: boolean;
        tem_restricao: boolean | null;
    tem_documento: boolean;
    status: string | null;
  }>(
    `SELECT u.id, u.nome, u.email, u.perfil, u.senha_hash,
          u.email_verificado, a.status,
            (a.deficiencia <> 'nenhuma' OR a.restricao_medica <> 'nenhuma') AS tem_restricao,
            EXISTS (
              SELECT 1 FROM documentos_comprobatorios d
              WHERE d.id_aluno = u.id AND d.status IN ('pendente', 'aprovado')
            ) AS tem_documento
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function buscarUsuarioPorId(id: number) {
  const { rows } = await pool.query<{
    id: number;
    email: string;
    perfil: string;
    senha_hash: string;
    email_verificado: boolean;
  }>(
    "SELECT id, email, perfil, senha_hash, email_verificado FROM usuarios WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function buscarUsuarioParaVerificacao(email: string) {
  const { rows } = await pool.query<{
    id: number;
    email: string;
    email_verificado: boolean;
    perfil: string;
    status: string | null;
    tem_restricao: boolean | null;
    tem_documento: boolean;
  }>(
    `SELECT u.id, u.email, u.email_verificado, u.perfil, a.status,
            (a.deficiencia <> 'nenhuma' OR a.restricao_medica <> 'nenhuma') AS tem_restricao,
            EXISTS (
              SELECT 1 FROM documentos_comprobatorios d
              WHERE d.id_aluno = u.id AND d.status IN ('pendente', 'aprovado')
            ) AS tem_documento
     FROM usuarios u LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE LOWER(u.email) = LOWER($1)`,
    [email],
  );
  return rows[0] ?? null;
}

export async function verificarEmailComCodigo(
  idUsuario: number,
  codigoHash: string,
) {
  const { rows } = await pool.query<{ id_usuario: number }>(
    `WITH codigo_consumido AS (
       DELETE FROM auth_codigos_email
       WHERE id_usuario = $1 AND finalidade = 'verificacao_cadastro'
         AND codigo_hash = $2 AND expira_em > NOW()
       RETURNING id_usuario
     )
     UPDATE usuarios u SET email_verificado = true
     FROM codigo_consumido c
     WHERE u.id = c.id_usuario AND u.email_verificado = false
     RETURNING u.id AS id_usuario`,
    [idUsuario, codigoHash],
  );
  return rows[0] ?? null;
}

export async function buscarEmailExistente(email: string) {
  const { rows } = await pool.query(
    "SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1)",
    [email],
  );
  return rows.length > 0;
}

export async function criarSessao(
  idUsuario: number,
  sessionId: string,
  refreshTokenHash: string,
) {
  return pool.query(
    `INSERT INTO auth_sessoes (id, id_usuario, refresh_token_hash, expira_em)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [sessionId, idUsuario, refreshTokenHash],
  );
}

export async function buscarSessao(sessionId: string, idUsuario: number) {
  const { rows } = await pool.query<{ refresh_token_hash: string }>(
    `SELECT refresh_token_hash FROM auth_sessoes
     WHERE id = $1 AND id_usuario = $2 AND expira_em > NOW()`,
    [sessionId, idUsuario],
  );
  return rows[0] ?? null;
}

export async function atualizarRefreshToken(
  sessionId: string,
  refreshTokenHash: string,
) {
  return pool.query(
     `UPDATE auth_sessoes SET refresh_token_hash = $1,
       expira_em = NOW() + INTERVAL '7 days'
     WHERE id = $2 AND expira_em > NOW()`,
    [refreshTokenHash, sessionId],
  );
}

export async function revogarSessao(sessionId: string) {
  return pool.query("DELETE FROM auth_sessoes WHERE id = $1", [sessionId]);
}

export async function revogarSessoesDoUsuario(idUsuario: number) {
  return pool.query("DELETE FROM auth_sessoes WHERE id_usuario = $1", [
    idUsuario,
  ]);
}

export async function salvarCodigoEmail(
  idUsuario: number,
  finalidade: "login_admin" | "recuperacao_senha" | "verificacao_cadastro",
  codigoHash: string,
) {
  const { rows } = await pool.query<{ id_usuario: number }>(
    `INSERT INTO auth_codigos_email
       (id_usuario, finalidade, codigo_hash, expira_em, tentativas)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', 0)
     ON CONFLICT (id_usuario, finalidade)
     DO UPDATE SET codigo_hash = EXCLUDED.codigo_hash,
       expira_em = EXCLUDED.expira_em, criado_em = NOW(), tentativas = 0
     WHERE auth_codigos_email.criado_em <= NOW() - INTERVAL '60 seconds'
     RETURNING id_usuario`,
    [idUsuario, finalidade, codigoHash],
  );
  return rows.length > 0;
}

export async function consumirCodigoEmail(
  idUsuario: number,
  finalidade: "login_admin" | "recuperacao_senha" | "verificacao_cadastro",
  codigoHash: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      codigo_hash: string;
      tentativas: number;
    }>(
      `SELECT codigo_hash, tentativas FROM auth_codigos_email
       WHERE id_usuario = $1 AND finalidade = $2 AND expira_em > NOW()
       FOR UPDATE`,
      [idUsuario, finalidade],
    );
    const codigoSalvo = rows[0];
    if (!codigoSalvo || codigoSalvo.tentativas >= 5) {
      await client.query("COMMIT");
      return null;
    }

    const esperado = Buffer.from(codigoSalvo.codigo_hash, "hex");
    const recebido = Buffer.from(codigoHash, "hex");
    const valido =
      esperado.length === recebido.length && timingSafeEqual(esperado, recebido);

    if (valido) {
      await client.query(
        "DELETE FROM auth_codigos_email WHERE id_usuario = $1 AND finalidade = $2",
        [idUsuario, finalidade],
      );
      await client.query("COMMIT");
      return { id_usuario: idUsuario };
    }

    await client.query(
      `UPDATE auth_codigos_email SET tentativas = tentativas + 1
       WHERE id_usuario = $1 AND finalidade = $2`,
      [idUsuario, finalidade],
    );
    await client.query("COMMIT");
    return null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function atualizarSenha(idUsuario: number, senhaHash: string) {
  return pool.query("UPDATE usuarios SET senha_hash = $1 WHERE id = $2", [
    senhaHash,
    idUsuario,
  ]);
}

export async function atualizarEmail(idUsuario: number, novoEmail: string) {
  return pool.query(
    `WITH usuario_atualizado AS (
       UPDATE usuarios SET email = $1, email_verificado = false
       WHERE id = $2
       RETURNING id, email
     ), codigos_removidos AS (
       DELETE FROM auth_codigos_email c
       USING usuario_atualizado u
       WHERE c.id_usuario = u.id
       RETURNING c.id_usuario
     )
     SELECT id, email FROM usuario_atualizado`,
    [novoEmail, idUsuario],
  );
}
