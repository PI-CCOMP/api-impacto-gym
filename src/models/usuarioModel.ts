import pool from "../config/database";
import type { PoolClient } from "pg";

export async function listar(filtros: {
  perfil: string[];
  busca: string;
  isInstrutor: boolean;
  isRecepcionista: boolean;
  instrutorId: number;
  porPagina: number;
  offset: number;
}) {
  return pool.query(
    `SELECT
      u.id AS id_usuario, u.nome, u.cpf, u.perfil, u.email,
      a.status, a.deficiencia::text[] AS deficiencia,
      a.restricao_medica::text[] AS restricao_medica,
      a.revisao_medica_pendente, a.prazo_revisao_medica,
       ui.nome AS instrutor_vinculado,
       COUNT(*) OVER() AS total
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     LEFT JOIN usuarios ui ON ui.id = a.id_instrutor
     WHERE (cardinality($1::perfil_usuario[]) = 0 OR u.perfil = ANY($1::perfil_usuario[]))
       AND ($2 = '' OR u.nome ILIKE '%' || $2 || '%' OR u.cpf ILIKE '%' || $2 || '%')
      AND ($3 = false OR a.id_instrutor = $4)
      AND ($7 = false OR u.perfil = 'aluno')
     ORDER BY u.nome ASC
     LIMIT $5 OFFSET $6`,
    [
      filtros.perfil,
      filtros.busca,
      filtros.isInstrutor,
      filtros.instrutorId,
      filtros.porPagina,
      filtros.offset,
      filtros.isRecepcionista,
    ],
  );
}

export async function buscarPorUsuarioId(idUsuario: number) {
  return pool.query(
    `SELECT u.id AS id_usuario, u.nome, u.email, u.foto_url, u.perfil
    FROM usuarios u WHERE u.id = $1`,
      [idUsuario],
  );
}

export async function existePorId(id: string) {
  return pool.query(
    `SELECT
       u.id AS id_usuario, u.nome, u.cpf, u.email, u.sexo, u.foto_url, u.perfil, u.criado_em,
      a.nivel, a.objetivo,
      a.deficiencia::text[] AS deficiencia,
      a.restricao_medica::text[] AS restricao_medica,
      a.status,
      a.prazo_envio_laudo, a.revisao_medica_pendente, a.prazo_revisao_medica,
      a.id_instrutor, u.email_verificado
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1`,
    [id],
  );
}

export async function buscarTreinosDoAluno(idAluno: number) {
  return pool.query(
    `SELECT at.id AS id_aluno_treino, t.id AS id_treino, t.nome AS nome_treino
     FROM aluno_treinos at JOIN treinos t ON t.id = at.id_treino
     WHERE at.id_aluno = $1 AND at.ativo = true`,
    [idAluno],
  );
}

export async function verificarInstrutorDoAluno(
  idUsuario: string,
  instrutorId: number,
) {
  return pool.query(
    `SELECT 1 FROM alunos WHERE id_usuario = $1 AND id_instrutor = $2`,
    [idUsuario, instrutorId],
  );
}

export async function verificarDuplicado(email: string, cpf: string) {
  return pool.query(
    `SELECT 1 FROM usuarios
     WHERE LOWER(email) = LOWER($1) OR LOWER(email_pendente) = LOWER($1)
       OR cpf = $2`,
    [email, cpf],
  );
}

export async function inserirUsuario(
  client: PoolClient,
  dados: {
    nome: string;
    cpf: string;
    email: string;
    senhaHash: string;
    sexo: string;
    perfil: string;
    fotoUrl: string | null;
  },
) {
  return client.query(
    `INSERT INTO usuarios (nome, cpf, email, senha_hash, sexo, perfil, foto_url)
     VALUES ($1, $2, $3, $4, $5, $6::perfil_usuario, $7)
     RETURNING id`,
    [
      dados.nome,
      dados.cpf,
      dados.email,
      dados.senhaHash,
      dados.sexo,
      dados.perfil,
      dados.fotoUrl,
    ],
  );
}

export async function inserirAluno(
  client: PoolClient,
  dados: {
    idUsuario: number;
    objetivo: string;
    nivel: string;
    deficiencia: string[];
    restricaoMedica: string[];
    status: string;
  },
) {
  return client.query(
    `INSERT INTO alunos (id_usuario, objetivo, nivel, deficiencia, restricao_medica, status)
    VALUES ($1, $2::objetivo_aluno, $3::nivel_aluno, $4::deficiencia_aluno[], $5::restricao_medica_aluno[], $6::status_cadastro)
    RETURNING id_usuario, prazo_envio_laudo`,
    [
      dados.idUsuario,
      dados.objetivo,
      dados.nivel,
      dados.deficiencia,
      dados.restricaoMedica,
      dados.status,
    ],
  );
}

export async function atualizar(
  id: string,
  dados: {
    nome?: string;
    email?: string;
    sexo?: string;
    perfil?: string;
    fotoUrl?: string;
  },
) {
  return pool.query(
    `UPDATE usuarios SET
       nome = COALESCE($1, nome),
       email_pendente = CASE
         WHEN $2 IS NULL THEN email_pendente
         WHEN LOWER($2) <> LOWER(email) THEN $2
         ELSE NULL
       END,
       sexo = COALESCE($3::sexo_usuario, sexo),
      perfil = COALESCE($4::perfil_usuario, perfil),
      foto_url = COALESCE($5, foto_url)
    WHERE id = $6
    RETURNING id, email, email_pendente, email_verificado`,
    [
      dados.nome ?? null,
      dados.email ?? null,
      dados.sexo ?? null,
      dados.perfil ?? null,
      dados.fotoUrl ?? null,
      id,
    ],
  );
}

export async function atualizarAluno(
  idUsuario: string,
  dados: {
    objetivo?: string;
    nivel?: string;
    deficiencia?: string[];
    restricaoMedica?: string[];
    idInstrutor?: number | null;
    atualizarInstrutor?: boolean;
  },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: atuais } = await client.query<{
      status: string;
      deficiencia: string[];
      restricao_medica: string[];
    }>(
      `SELECT status, deficiencia::text[] AS deficiencia,
              restricao_medica::text[] AS restricao_medica
       FROM alunos WHERE id_usuario = $1 FOR UPDATE`,
      [idUsuario],
    );
    if (atuais.length === 0) {
      await client.query("COMMIT");
      return {
        rows: [],
        revisaoIniciada: false,
        laudoPendenteInvalidado: false,
        laudoPendenteNecessario: false,
      };
    }

    const atual = atuais[0];
    const deficiencia = dados.deficiencia ?? atual.deficiencia;
    const restricaoMedica = dados.restricaoMedica ?? atual.restricao_medica;
    const listaOrdenada = (valores: string[]) => [...valores].sort().join(",");
    const dadosMedicosAlterados =
      (dados.deficiencia !== undefined &&
        listaOrdenada(dados.deficiencia) !== listaOrdenada(atual.deficiencia)) ||
      (dados.restricaoMedica !== undefined &&
        listaOrdenada(dados.restricaoMedica) !==
          listaOrdenada(atual.restricao_medica));
    const temCondicao =
      deficiencia.some((valor) => valor !== "nenhuma") ||
      restricaoMedica.some((valor) => valor !== "nenhuma");

    const { rows } = await client.query(
      `UPDATE alunos SET
         objetivo = COALESCE($1::objetivo_aluno, objetivo),
         nivel = COALESCE($2::nivel_aluno, nivel),
         deficiencia = COALESCE($3::deficiencia_aluno[], deficiencia),
         restricao_medica = COALESCE($4::restricao_medica_aluno[], restricao_medica),
         id_instrutor = CASE WHEN $5::boolean THEN $6::bigint ELSE id_instrutor END,
         revisao_medica_pendente = CASE
           WHEN $7::boolean AND status = 'ativo' THEN $8::boolean
           ELSE revisao_medica_pendente
         END,
         prazo_revisao_medica = CASE
           WHEN $7::boolean AND status = 'ativo' AND $8::boolean
             THEN NOW() + INTERVAL '7 days'
           WHEN $7::boolean AND status = 'ativo' THEN NULL
           ELSE prazo_revisao_medica
         END
       WHERE id_usuario = $9
       RETURNING status, prazo_envio_laudo, revisao_medica_pendente,
                 prazo_revisao_medica`,
      [
        dados.objetivo ?? null,
        dados.nivel ?? null,
        dados.deficiencia ?? null,
        dados.restricaoMedica ?? null,
        dados.atualizarInstrutor ?? false,
        dados.idInstrutor ?? null,
        dadosMedicosAlterados,
        temCondicao,
        idUsuario,
      ],
    );

    let laudoPendenteInvalidado = false;
    if (dadosMedicosAlterados && atual.status === "pendente") {
      const { rowCount } = await client.query(
        `UPDATE documentos_comprobatorios
         SET status = 'cancelado', motivo_rejeicao = 'Dados médicos alterados.'
         WHERE id_aluno = $1 AND status IN ('pendente', 'aprovado')`,
        [idUsuario],
      );
      laudoPendenteInvalidado = Boolean(rowCount && temCondicao);
    } else if (dadosMedicosAlterados && atual.status === "ativo") {
      await client.query(
        `UPDATE documentos_comprobatorios
         SET status = 'cancelado', motivo_rejeicao = 'Dados médicos alterados.'
         WHERE id_aluno = $1 AND status = 'pendente'`,
        [idUsuario],
      );
    }
    await client.query("COMMIT");
    return {
      rows,
      revisaoIniciada:
        dadosMedicosAlterados && atual.status === "ativo" && temCondicao,
      laudoPendenteInvalidado,
      laudoPendenteNecessario:
        dadosMedicosAlterados && atual.status === "pendente" && temCondicao,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function buscarPorId(id: string) {
  return pool.query(
    `SELECT u.id AS id_usuario, u.nome, u.cpf, u.email, u.sexo, u.foto_url,
            u.perfil, u.criado_em, u.email_verificado,
            a.nivel, a.objetivo,
            a.deficiencia::text[] AS deficiencia,
            a.restricao_medica::text[] AS restricao_medica,
            a.status,
            a.prazo_envio_laudo, a.revisao_medica_pendente,
            a.prazo_revisao_medica, a.id_instrutor
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1`,
    [id],
  );
}

export async function excluirPorId(client: PoolClient, id: string) {
  return client.query("DELETE FROM usuarios WHERE id = $1", [id]);
}

export async function buscarIdPorUsuarioId(idUsuario: number) {
  return pool.query("SELECT id FROM usuarios WHERE id = $1", [idUsuario]);
}

export async function atualizarFoto(fotoUrl: string, idUsuario: number) {
  return pool.query("UPDATE usuarios SET foto_url = $1 WHERE id = $2", [
    fotoUrl,
    idUsuario,
  ]);
}

export async function buscarInstrutorDoAluno(idUsuario: string) {
  return pool.query(
    `SELECT a.id_instrutor, u.perfil AS perfil_instrutor
     FROM alunos a
     LEFT JOIN usuarios u ON u.id = a.id_instrutor
     WHERE a.id_usuario = $1`,
    [idUsuario],
  );
}

export async function validarPerfilInstrutor(idInstrutor: number) {
  return pool.query(
    `SELECT id FROM usuarios WHERE id = $1 AND perfil IN ('instrutor', 'admin')`,
    [idInstrutor],
  );
}

export async function inativarTreinosDoAluno(
  client: PoolClient,
  idUsuario: string,
) {
  return client.query(
    `UPDATE aluno_treinos SET ativo = false
     WHERE id_aluno = $1 AND ativo = true`,
    [idUsuario],
  );
}

export async function atualizarInstrutorDoAluno(
  client: PoolClient,
  idUsuario: string,
  idInstrutor: number | null,
  somenteProprioOuSemVinculo: boolean,
  instrutorAtualId: number,
) {
  return client.query(
    `UPDATE alunos SET id_instrutor = $1
     WHERE id_usuario = $2
       AND ($3::boolean = false OR id_instrutor IS NULL OR id_instrutor = $4)
     RETURNING id_usuario`,
    [idInstrutor, idUsuario, somenteProprioOuSemVinculo, instrutorAtualId],
  );
}

export async function desvincularTreino(
  idAluno: string,
  idAluno_treino: string,
) {
  return pool.query(
    `DELETE FROM aluno_treinos WHERE id = $1 AND id_aluno = $2 RETURNING id`,
    [idAluno_treino, idAluno],
  );
}
