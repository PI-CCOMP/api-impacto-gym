import pool from "../config/database";

export async function listar(filtros: {
  perfil: string;
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
      a.status, a.deficiencia, a.restricao_medica,
       ui.nome AS instrutor_vinculado,
       COUNT(*) OVER() AS total
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     LEFT JOIN usuarios ui ON ui.id = a.id_instrutor
     WHERE ($1 = '' OR u.perfil = $1::perfil_usuario)
       AND ($2 = '' OR u.nome ILIKE '%' || $2 || '%' OR u.cpf ILIKE '%' || $2 || '%')
      AND ($3 = false OR a.id_instrutor = $4 OR (a.id_instrutor IS NULL AND u.perfil = 'aluno'))
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
      a.nivel, a.objetivo, a.deficiencia, a.restricao_medica, a.status,
      a.prazo_envio_laudo, a.id_instrutor, u.email_verificado
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id = $1`,
    [id],
  );
}

export async function buscarTreinosDoAluno(idAluno: number) {
  return pool.query(
    `SELECT at.id AS id_aluno_treino, t.nome AS nome_treino
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
    "SELECT 1 FROM usuarios WHERE LOWER(email) = LOWER($1) OR cpf = $2",
    [email, cpf],
  );
}

export async function inserirUsuario(
  client: any,
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
  client: any,
  dados: {
    idUsuario: number;
    objetivo: string;
    nivel: string;
    deficiencia: string;
    restricaoMedica: string;
    status: string;
  },
) {
  return client.query(
    // [CORRIGIDO] casts explícitos para os novos enums deficiencia_aluno e restricao_medica_aluno
    `INSERT INTO alunos (id_usuario, objetivo, nivel, deficiencia, restricao_medica, status)
    VALUES ($1, $2::objetivo_aluno, $3::nivel_aluno, $4::deficiencia_aluno, $5::restricao_medica_aluno, $6::status_cadastro)
    RETURNING id_usuario, prazo_envio_laudo`,
    [
      dados.idUsuario,
      dados.objetivo,
      dados.nivel,
      dados.deficiencia || "nenhuma",
      dados.restricaoMedica || "nenhuma",
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
       email = COALESCE($2, email),
       email_verificado = CASE
         WHEN $2 IS NOT NULL AND LOWER($2) <> LOWER(email) THEN false
         ELSE email_verificado
       END,
       sexo = COALESCE($3::sexo_usuario, sexo),
      perfil = COALESCE($4::perfil_usuario, perfil),
      foto_url = COALESCE($5, foto_url)
    WHERE id = $6
    RETURNING id, email, email_verificado`,
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
    deficiencia?: string;
    restricaoMedica?: string;
    idInstrutor?: number | null;
  },
) {
  // [CORRIGIDO] casts explícitos para os novos enums
  return pool.query(
    `UPDATE alunos SET
       objetivo = COALESCE($1::objetivo_aluno, objetivo),
       nivel = COALESCE($2::nivel_aluno, nivel),
       deficiencia = COALESCE($3::deficiencia_aluno, deficiencia),
       restricao_medica = COALESCE($4::restricao_medica_aluno, restricao_medica),
       status = CASE
         WHEN (deficiencia = 'nenhuma' AND COALESCE($3::deficiencia_aluno, deficiencia) <> 'nenhuma')
           OR (restricao_medica = 'nenhuma' AND COALESCE($4::restricao_medica_aluno, restricao_medica) <> 'nenhuma')
         THEN 'pendente'::status_cadastro
         ELSE status
       END,
       id_instrutor = $5
     WHERE id_usuario = $6
     RETURNING status`,
    [
      dados.objetivo ?? null,
      dados.nivel ?? null,
      dados.deficiencia ?? null,
      dados.restricaoMedica ?? null,
      dados.idInstrutor ?? null,
      idUsuario,
    ],
  );
}

export async function buscarPorId(id: string) {
  return pool.query("SELECT id FROM usuarios WHERE id = $1", [id]);
}

export async function excluirPorId(client: any, id: string) {
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

export async function inativarTreinosDoAluno(client: any, idUsuario: string) {
  return client.query(
    `UPDATE aluno_treinos SET ativo = false
     WHERE id_aluno = $1 AND ativo = true`,
    [idUsuario],
  );
}

export async function atualizarInstrutorDoAluno(
  client: any,
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
