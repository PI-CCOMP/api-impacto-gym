import pool from "../config/database";
import { supabaseAdmin } from "../config/supabase";

export async function listar(filtros: {
  perfil: string;
  busca: string;
  isInstrutor: boolean;
  instrutorId: number;
  porPagina: number;
  offset: number;
}) {
  // perfil_usuario é um enum no postgres — cast explícito necessário ao comparar com texto
  return pool.query(
    `SELECT
       u.id AS id_usuario, u.nome, u.cpf, u.perfil, u.email,
       a.status,
       ui.nome AS instrutor_vinculado,
       COUNT(*) OVER() AS total
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     LEFT JOIN usuarios ui ON ui.id = a.id_instrutor
     WHERE ($1 = '' OR u.perfil = $1::perfil_usuario)
       AND ($2 = '' OR u.nome ILIKE '%' || $2 || '%' OR u.cpf ILIKE '%' || $2 || '%')
       AND ($3 = false OR a.id_instrutor = $4)
     ORDER BY u.nome ASC
     LIMIT $5 OFFSET $6`,
    [
      filtros.perfil,
      filtros.busca,
      filtros.isInstrutor,
      filtros.instrutorId,
      filtros.porPagina,
      filtros.offset,
    ],
  );
}

export async function buscarPorAuthId(authId: string) {
  return pool.query(
    `SELECT u.id AS id_usuario, u.nome, u.email, u.foto_url, u.perfil
     FROM usuarios u WHERE u.id_auth = $1`,
    [authId],
  );
}

export async function buscarPorId(id: string) {
  return pool.query(
    `SELECT
       u.id AS id_usuario, u.nome, u.cpf, u.email, u.sexo, u.foto_url, u.perfil, u.criado_em,
       a.id, a.nivel, a.objetivo, a.deficiencia, a.restricao_medica, a.status, a.id_instrutor
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
  return pool.query("SELECT 1 FROM usuarios WHERE email = $1 OR cpf = $2", [
    email,
    cpf,
  ]);
}

export async function criarNoAuth(email: string, senha: string) {
  return supabaseAdmin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
}

export async function inserirUsuario(
  client: any,
  dados: {
    authId: string;
    nome: string;
    cpf: string;
    email: string;
    sexo: string;
    perfil: string;
    fotoUrl: string | null;
  },
) {
  return client.query(
    `INSERT INTO usuarios (id_auth, nome, cpf, email, sexo, perfil, foto_url)
     VALUES ($1, $2, $3, $4, $5, $6::perfil_usuario, $7)
     RETURNING id`,
    [
      dados.authId,
      dados.nome,
      dados.cpf,
      dados.email,
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
    `INSERT INTO alunos (id_usuario, objetivo, nivel, deficiencia, restricao_medica, status)
     VALUES ($1, $2::objetivo_aluno, $3::nivel_aluno, $4::deficiencia_aluno, $5::restricao_medica_aluno, $6::status_cadastro)`,
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
    isRecepcionista: boolean;
    fotoUrl?: string;
  },
) {
  return pool.query(
    `UPDATE usuarios SET
       nome = COALESCE($1, nome),
       email = COALESCE($2, email),
       sexo = COALESCE($3::sexo_usuario, sexo),
       perfil = CASE WHEN $4 IS NOT NULL AND $5 = false THEN $4::perfil_usuario ELSE perfil END,
       foto_url = COALESCE($6, foto_url)
     WHERE id = $7`,
    [
      dados.nome || null,
      dados.email || null,
      dados.sexo || null,
      dados.perfil || null,
      dados.isRecepcionista,
      dados.fotoUrl || null,
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
  return pool.query(
    `UPDATE alunos SET
       objetivo = COALESCE($1::objetivo_aluno, objetivo),
       nivel = COALESCE($2::nivel_aluno, nivel),
       deficiencia = COALESCE($3::deficiencia_aluno, deficiencia),
       restricao_medica = COALESCE($4::restricao_medica_aluno, restricao_medica),
       id_instrutor = $5
     WHERE id_usuario = $6`,
    [
      dados.objetivo || null,
      dados.nivel || null,
      dados.deficiencia || null,
      dados.restricaoMedica || null,
      dados.idInstrutor ?? null,
      idUsuario,
    ],
  );
}

export async function buscarAuthIdPorId(id: string) {
  return pool.query("SELECT id_auth FROM usuarios WHERE id = $1", [id]);
}

export async function excluirPorId(client: any, id: string) {
  return client.query("DELETE FROM usuarios WHERE id = $1", [id]);
}

export async function excluirNoAuth(authId: string) {
  return supabaseAdmin.auth.admin.deleteUser(authId);
}

export async function buscarIdPorAuthId(authId: string) {
  return pool.query("SELECT id FROM usuarios WHERE id_auth = $1", [authId]);
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
) {
  return client.query(
    `UPDATE alunos SET id_instrutor = $1 WHERE id_usuario = $2 RETURNING id_usuario`,
    [idInstrutor, idUsuario],
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
