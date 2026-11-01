import pool from "../config/database";
import type { PoolClient } from "pg";

export async function verificarDuplicado(email: string, cpf: string) {
  return pool.query(
    `SELECT 1 FROM usuarios
     WHERE LOWER(email) = LOWER($1) OR LOWER(email_pendente) = LOWER($1)
       OR cpf = $2`,
    [email, cpf],
  );
}

// usuarios NAO tem coluna "status" — status fica em alunos
export async function inserirUsuario(
  client: PoolClient,
  dados: {
    nome: string;
    cpf: string;
    email: string;
    senhaHash: string;
    sexo: string;
  },
) {
  return client.query(
    `INSERT INTO usuarios (nome, cpf, email, senha_hash, sexo, perfil)
     VALUES ($1, $2, $3, $4, $5, 'aluno')
     RETURNING id`,
    [dados.nome, dados.cpf, dados.email, dados.senhaHash, dados.sexo],
  );
}

// status passado aqui reflete RN12 (pendente ou ativo)
export async function inserirAluno(
  client: PoolClient,
  dados: {
    idUsuario: number;
    deficiencia: string[];
    restricaoMedica: string[];
    objetivo: string;
    nivel: string;
    status: string;
  },
) {
  return client.query(
    `INSERT INTO alunos (id_usuario, deficiencia, restricao_medica, objetivo, nivel, status)
     VALUES ($1, $2, $3, $4::deficiencia_aluno[], $5::restricao_medica_aluno[], $6)
    RETURNING id_usuario, prazo_envio_laudo`,
    [
      dados.idUsuario,
      dados.deficiencia,
      dados.restricaoMedica,
      dados.objetivo,
      dados.nivel,
      dados.status,
    ],
  );
}

// status de aluno esta em alunos, nao em usuarios
export async function buscarAlunoParaUpload(idAluno: string) {
  return pool.query(
    `SELECT u.id, a.status, a.revisao_medica_pendente,
          (cardinality(array_remove(a.deficiencia, 'nenhuma')) > 0
            OR cardinality(array_remove(a.restricao_medica, 'nenhuma')) > 0) AS tem_restricao,
          EXISTS (
            SELECT 1 FROM documentos_comprobatorios d
            WHERE d.id_aluno = u.id AND d.status = 'pendente'
          ) AS tem_documento_pendente,
          EXISTS (
            SELECT 1 FROM documentos_comprobatorios d
            WHERE d.id_aluno = u.id AND d.status = 'aprovado'
          ) AS tem_documento_aprovado
     FROM usuarios u
     JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1
       AND (a.status = 'pendente'
         OR (a.status = 'ativo' AND a.revisao_medica_pendente = true))`,
    [idAluno],
  );
}

export async function inserirDocumento(
  idAluno: string,
  caminho: string,
  nomeArquivo: string,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: alunos } = await client.query<{
      status: string;
      revisao_medica_pendente: boolean;
      tem_restricao: boolean;
      tem_documento_pendente: boolean;
      tem_documento_aprovado: boolean;
    }>(
      `SELECT a.status, a.revisao_medica_pendente,
              (cardinality(array_remove(a.deficiencia, 'nenhuma')) > 0
                OR cardinality(array_remove(a.restricao_medica, 'nenhuma')) > 0) AS tem_restricao,
              EXISTS (
                SELECT 1 FROM documentos_comprobatorios d
                WHERE d.id_aluno = a.id_usuario AND d.status = 'pendente'
              ) AS tem_documento_pendente,
              EXISTS (
                SELECT 1 FROM documentos_comprobatorios d
                WHERE d.id_aluno = a.id_usuario AND d.status = 'aprovado'
              ) AS tem_documento_aprovado
       FROM alunos a
       WHERE a.id_usuario = $1
       FOR UPDATE`,
      [idAluno],
    );
    const aluno = alunos[0];
    if (!aluno) {
      await client.query("COMMIT");
      return { rows: [], erro: "UPLOAD_NAO_DISPONIVEL" };
    }
    if (!aluno.tem_restricao) {
      await client.query("COMMIT");
      return { rows: [], erro: "SEM_RESTRICAO" };
    }
    if (
      aluno.tem_documento_pendente ||
      (aluno.status === "pendente" && aluno.tem_documento_aprovado)
    ) {
      await client.query("COMMIT");
      return { rows: [], erro: "DOCUMENTO_JA_ENVIADO" };
    }
    const uploadDisponivel =
      aluno.status === "pendente" ||
      (aluno.status === "ativo" && aluno.revisao_medica_pendente);
    if (!uploadDisponivel) {
      await client.query("COMMIT");
      return { rows: [], erro: "UPLOAD_NAO_DISPONIVEL" };
    }

    const { rows } = await client.query(
      `INSERT INTO documentos_comprobatorios
         (id_aluno, caminho_arquivo, nome_arquivo, status)
       VALUES ($1, $2, $3, 'pendente')
       RETURNING id`,
      [idAluno, caminho, nomeArquivo],
    );
    await client.query("COMMIT");
    return { rows, erro: null };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// filtra por a.status (tabela alunos)
export async function listar(filtros: {
  status: string;
  busca: string;
  isInstrutor: boolean;
  instrutorId: number;
  porPagina: number;
  offset: number;
}) {
  return pool.query(
    `SELECT
      u.id AS id_aluno, u.nome, u.cpf, u.email, u.email_verificado,
      a.deficiencia::text[] AS deficiencia,
      a.restricao_medica::text[] AS restricao_medica,
      a.prazo_envio_laudo,
      a.status, a.revisao_medica_pendente, a.prazo_revisao_medica,
      d.id AS id_documento, d.caminho_arquivo, d.nome_arquivo,
      d.status AS status_documento, d.motivo_rejeicao,
       u.criado_em AS cadastrado_em,
       COUNT(*) OVER() AS total
     FROM usuarios u
     JOIN alunos a ON a.id_usuario = u.id
     LEFT JOIN LATERAL (
       SELECT id, caminho_arquivo, nome_arquivo, status, motivo_rejeicao
       FROM documentos_comprobatorios
       WHERE id_aluno = u.id
      ORDER BY enviado_em DESC, id DESC
       LIMIT 1
     ) d ON true
     WHERE u.perfil = 'aluno'
       AND (
         ($1 = 'revisao_medica' AND a.status = 'ativo' AND a.revisao_medica_pendente = true)
         OR ($1 <> 'revisao_medica' AND a.status = $1::status_cadastro)
       )
       AND ($2 = '' OR u.nome ILIKE '%' || $2 || '%' OR u.cpf ILIKE '%' || $2 || '%')
      AND ($5 = false OR a.id_instrutor = $6 OR a.id_instrutor IS NULL)
     ORDER BY u.criado_em ASC
     LIMIT $3 OFFSET $4`,
    [
      filtros.status,
      filtros.busca,
      filtros.porPagina,
      filtros.offset,
      filtros.isInstrutor,
      filtros.instrutorId,
    ],
  );
}

// UPDATE em alunos, nao em usuarios
export async function aprovar(idAluno: string) {
  return pool.query(
    `UPDATE alunos SET status = 'ativo'
     WHERE id_usuario = $1 AND status = 'pendente'
     RETURNING id_usuario AS id`,
    [idAluno],
  );
}

export async function buscarAlunoPendenteParaAprovar(idAluno: string) {
  return pool.query(
    `SELECT
      u.id, u.email_verificado, a.id_instrutor,
       (cardinality(array_remove(a.deficiencia, 'nenhuma')) > 0
         OR cardinality(array_remove(a.restricao_medica, 'nenhuma')) > 0) AS tem_restricao,
       COALESCE((
         SELECT d.status = 'aprovado'
         FROM documentos_comprobatorios d
         WHERE d.id_aluno = u.id
         ORDER BY d.enviado_em DESC, d.id DESC
         LIMIT 1
       ), false) AS tem_documento_aprovado
     FROM usuarios u
     JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1 AND a.status = 'pendente'`,
    [idAluno],
  );
}

export async function buscarDocumento(idAluno: string, idDocumento: string) {
  return pool.query(
    `SELECT d.id, d.id_aluno, d.caminho_arquivo, d.nome_arquivo, d.status,
            d.motivo_rejeicao, u.email, u.perfil, a.id_instrutor,
            a.revisao_medica_pendente, a.prazo_revisao_medica
     FROM documentos_comprobatorios d
     JOIN usuarios u ON u.id = d.id_aluno
     JOIN alunos a ON a.id_usuario = u.id
     WHERE d.id_aluno = $1 AND d.id = $2`,
    [idAluno, idDocumento],
  );
}

export async function aprovarDocumento(idAluno: string, idDocumento: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const aluno = await client.query(
      `SELECT id_usuario FROM alunos WHERE id_usuario = $1 FOR UPDATE`,
      [idAluno],
    );
    if (aluno.rows.length === 0) {
      await client.query("COMMIT");
      return { rows: [] };
    }
    const { rows } = await client.query(
      `UPDATE documentos_comprobatorios
       SET status = 'aprovado', motivo_rejeicao = NULL
       WHERE id_aluno = $1 AND id = $2 AND status = 'pendente'
       RETURNING id`,
      [idAluno, idDocumento],
    );
    if (rows.length > 0) {
      await client.query(
        `UPDATE alunos
         SET revisao_medica_pendente = false, prazo_revisao_medica = NULL
         WHERE id_usuario = $1 AND status = 'ativo'
           AND revisao_medica_pendente = true`,
        [idAluno],
      );
    }
    await client.query("COMMIT");
    return { rows };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function rejeitarDocumento(
  idAluno: string,
  idDocumento: string,
  motivo: string,
) {
  return pool.query(
    `UPDATE documentos_comprobatorios SET status = 'rejeitado', motivo_rejeicao = $3
     WHERE id_aluno = $1 AND id = $2 AND status = 'pendente'
     RETURNING id`,
    [idAluno, idDocumento, motivo],
  );
}

export async function rejeitar(idAluno: string) {
  return pool.query(
    `UPDATE alunos SET status = 'rejeitado'
     WHERE id_usuario = $1 AND status = 'pendente'
     RETURNING id_usuario AS id`,
    [idAluno],
  );
}

export async function rejeitarDocumentos(idAluno: string, motivo: string) {
  return pool.query(
    `UPDATE documentos_comprobatorios
     SET status = 'rejeitado', motivo_rejeicao = $1
     WHERE id_aluno = $2 AND status = 'pendente'`,
    [motivo, idAluno],
  );
}
