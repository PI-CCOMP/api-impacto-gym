import pool from "../config/database";

export async function verificarDuplicado(email: string, cpf: string) {
  return pool.query(
    "SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1) OR cpf = $2",
    [email, cpf],
  );
}

// usuarios NAO tem coluna "status" — status fica em alunos
export async function inserirUsuario(
  client: any,
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
  client: any,
  dados: {
    idUsuario: number;
    deficiencia: string;
    restricaoMedica: string;
    objetivo: string;
    nivel: string;
    status: string;
  },
) {
  return client.query(
    `INSERT INTO alunos (id_usuario, deficiencia, restricao_medica, objetivo, nivel, status)
     VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id_usuario, prazo_envio_laudo`,
    [
      dados.idUsuario,
      dados.deficiencia || "nenhuma",
      dados.restricaoMedica || "nenhuma",
      dados.objetivo,
      dados.nivel,
      dados.status,
    ],
  );
}

// status de aluno esta em alunos, nao em usuarios
export async function buscarAlunoPendente(idAluno: string) {
  return pool.query(
        `SELECT u.id,
          (a.deficiencia <> 'nenhuma' OR a.restricao_medica <> 'nenhuma') AS tem_restricao,
          EXISTS (
            SELECT 1 FROM documentos_comprobatorios d
            WHERE d.id_aluno = u.id AND d.status IN ('pendente', 'aprovado')
          ) AS tem_documento
     FROM usuarios u
     JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1 AND a.status = 'pendente'`,
    [idAluno],
  );
}

export async function inserirDocumento(
  idAluno: string,
  caminho: string,
  nomeArquivo: string,
) {
  return pool.query(
    `INSERT INTO documentos_comprobatorios (id_aluno, caminho_arquivo, nome_arquivo, status)
     VALUES ($1, $2, $3, 'pendente')
     RETURNING id`,
    [idAluno, caminho, nomeArquivo],
  );
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
      a.deficiencia, a.restricao_medica, a.prazo_envio_laudo,
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
       AND a.status = $1
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
       (a.deficiencia <> 'nenhuma' OR a.restricao_medica <> 'nenhuma') AS tem_restricao,
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
            d.motivo_rejeicao, u.email, u.perfil, a.id_instrutor
     FROM documentos_comprobatorios d
     JOIN usuarios u ON u.id = d.id_aluno
     JOIN alunos a ON a.id_usuario = u.id
     WHERE d.id_aluno = $1 AND d.id = $2`,
    [idAluno, idDocumento],
  );
}

export async function aprovarDocumento(idAluno: string, idDocumento: string) {
  return pool.query(
    `UPDATE documentos_comprobatorios SET status = 'aprovado', motivo_rejeicao = NULL
     WHERE id_aluno = $1 AND id = $2 AND status = 'pendente'
     RETURNING id`,
    [idAluno, idDocumento],
  );
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
    `UPDATE documentos_comprobatorios SET status = 'rejeitado', motivo_rejeicao = $1 WHERE id_aluno = $2`,
    [motivo, idAluno],
  );
}
