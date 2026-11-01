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
    tem_documento_pendente: boolean;
    revisao_medica_pendente: boolean | null;
    prazo_revisao_medica: Date | null;
    status: string | null;
  }>(
    `SELECT u.id, u.nome, u.email, u.perfil, u.senha_hash,
          u.email_verificado, a.status,
            (cardinality(array_remove(a.deficiencia, 'nenhuma')) > 0
              OR cardinality(array_remove(a.restricao_medica, 'nenhuma')) > 0) AS tem_restricao,
            EXISTS (
              SELECT 1 FROM documentos_comprobatorios d
              WHERE d.id_aluno = u.id AND d.status IN ('pendente', 'aprovado')
            ) AS tem_documento,
            EXISTS (
              SELECT 1 FROM documentos_comprobatorios d
              WHERE d.id_aluno = u.id AND d.status = 'pendente'
            ) AS tem_documento_pendente,
            a.revisao_medica_pendente, a.prazo_revisao_medica
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
    status: string | null;
    revisao_medica_pendente: boolean | null;
    prazo_revisao_medica: Date | null;
  }>(
    `SELECT u.id, u.email, u.perfil, u.senha_hash, u.email_verificado, a.status,
            a.revisao_medica_pendente, a.prazo_revisao_medica
     FROM usuarios u LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function buscarUsuarioParaVerificacao(email: string) {
  const { rows } = await pool.query<{
    id: number;
    email: string;
    email_pendente: string | null;
    email_verificado: boolean;
    perfil: string;
    status: string | null;
    tem_restricao: boolean | null;
    tem_documento: boolean;
    revisao_medica_pendente: boolean | null;
    prazo_revisao_medica: Date | null;
  }>(
    `SELECT u.id, u.email, u.email_pendente, u.email_verificado, u.perfil, a.status,
            (cardinality(array_remove(a.deficiencia, 'nenhuma')) > 0
              OR cardinality(array_remove(a.restricao_medica, 'nenhuma')) > 0) AS tem_restricao,
            EXISTS (
              SELECT 1 FROM documentos_comprobatorios d
              WHERE d.id_aluno = u.id AND d.status IN ('pendente', 'aprovado')
            ) AS tem_documento,
            a.revisao_medica_pendente, a.prazo_revisao_medica
     FROM usuarios u LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE LOWER(u.email) = LOWER($1) OR LOWER(u.email_pendente) = LOWER($1)`,
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
    `SELECT 1 FROM usuarios
     WHERE LOWER(email) = LOWER($1) OR LOWER(email_pendente) = LOWER($1)`,
    [email],
  );
  return rows.length > 0;
}

export async function emailDisponivelParaUsuario(
  email: string,
  idUsuario: number,
) {
  const { rows } = await pool.query(
    `SELECT 1 FROM usuarios
     WHERE (LOWER(email) = LOWER($1) OR LOWER(email_pendente) = LOWER($1))
       AND id <> $2`,
    [email, idUsuario],
  );
  return rows.length === 0;
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
  finalidade:
    | "login_admin"
    | "recuperacao_senha"
    | "verificacao_cadastro"
    | "alteracao_email"
    | "convite_conta",
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
  finalidade:
    | "login_admin"
    | "recuperacao_senha"
    | "verificacao_cadastro"
    | "alteracao_email"
    | "convite_conta",
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

export async function atualizarSenha(
  idUsuario: number,
  senhaHash: string,
  verificarEmail = false,
) {
  return pool.query(
    `UPDATE usuarios SET senha_hash = $1,
       email_verificado = email_verificado OR $3
     WHERE id = $2`,
    [senhaHash, idUsuario, verificarEmail],
  );
}

export async function solicitarAlteracaoEmail(
  idUsuario: number,
  novoEmail: string,
) {
  const { rows } = await pool.query<{ id: number }>(
    `WITH alteracao AS (
       UPDATE usuarios
       SET email_pendente = $1
       WHERE id = $2
         AND email_pendente IS DISTINCT FROM $1
         AND NOT EXISTS (
           SELECT 1 FROM usuarios u
           WHERE (LOWER(u.email) = LOWER($1) OR LOWER(u.email_pendente) = LOWER($1))
             AND u.id <> $2
         )
       RETURNING id
     ), codigos_antigos AS (
       DELETE FROM auth_codigos_email c
       USING alteracao a
       WHERE c.id_usuario = a.id AND c.finalidade = 'alteracao_email'
       RETURNING c.id_usuario
     )
     SELECT id FROM alteracao
     UNION
     SELECT id FROM usuarios
     WHERE id = $2 AND LOWER(email_pendente) = LOWER($1)`,
    [novoEmail, idUsuario],
  );
  return rows.length > 0;
}

export async function confirmarAlteracaoEmail(
  idUsuario: number,
  codigoHash: string,
  emailPendente: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: codigos } = await client.query<{
      codigo_hash: string;
      tentativas: number;
    }>(
      `SELECT c.codigo_hash, c.tentativas
       FROM auth_codigos_email c
       JOIN usuarios u ON u.id = c.id_usuario
       WHERE c.id_usuario = $1 AND c.finalidade = 'alteracao_email'
         AND LOWER(u.email_pendente) = LOWER($2) AND c.expira_em > NOW()
       FOR UPDATE`,
      [idUsuario, emailPendente],
    );
    const codigo = codigos[0];
    if (!codigo || codigo.tentativas >= 5) {
      await client.query("COMMIT");
      return false;
    }

    const esperado = Buffer.from(codigo.codigo_hash, "hex");
    const recebido = Buffer.from(codigoHash, "hex");
    const valido =
      esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
    if (!valido) {
      await client.query(
        `UPDATE auth_codigos_email SET tentativas = tentativas + 1
         WHERE id_usuario = $1 AND finalidade = 'alteracao_email'`,
        [idUsuario],
      );
      await client.query("COMMIT");
      return false;
    }

    const { rows: atualizados } = await client.query(
      `UPDATE usuarios SET email = email_pendente, email_pendente = NULL,
         email_verificado = true
       WHERE id = $1 AND LOWER(email_pendente) = LOWER($2)
       RETURNING id`,
      [idUsuario, emailPendente],
    );
    if (atualizados.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "DELETE FROM auth_codigos_email WHERE id_usuario = $1",
      [idUsuario],
    );
    await client.query("DELETE FROM auth_sessoes WHERE id_usuario = $1", [
      idUsuario,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
