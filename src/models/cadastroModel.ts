import pool from "../config/database";
import { supabaseAdmin } from "../config/supabase";

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
    email_confirm: true, //false
  });
}

// usuarios NAO tem coluna "status" — status fica em alunos
export async function inserirUsuario(
  client: any,
  dados: {
    authId: string;
    nome: string;
    cpf: string;
    email: string;
    sexo: string;
  },
) {
  return client.query(
    `INSERT INTO usuarios (id_auth, nome, cpf, email, sexo, perfil)
     VALUES ($1, $2, $3, $4, $5, 'aluno')
     RETURNING id`,
    [dados.authId, dados.nome, dados.cpf, dados.email, dados.sexo],
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
     RETURNING id`,
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
            (a.deficiencia <> 'nenhuma' OR a.restricao_medica <> 'nenhuma') AS tem_restricao
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
  porPagina: number;
  offset: number;
}) {
  return pool.query(
    `SELECT
       u.id AS id_aluno, u.nome, u.cpf,
       d.id AS id_documento, d.caminho_arquivo, d.nome_arquivo,
       u.criado_em AS enviado_em,
       COUNT(*) OVER() AS total
     FROM usuarios u
     JOIN alunos a ON a.id_usuario = u.id
     LEFT JOIN documentos_comprobatorios d ON d.id_aluno = u.id
     WHERE u.perfil = 'aluno'
       AND a.status = $1
       AND ($2 = '' OR u.nome ILIKE '%' || $2 || '%' OR u.cpf ILIKE '%' || $2 || '%')
     ORDER BY u.criado_em ASC
     LIMIT $3 OFFSET $4`,
    [filtros.status, filtros.busca, filtros.porPagina, filtros.offset],
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

export async function aprovarDocumentos(idAluno: string) {
  return pool.query(
    `UPDATE documentos_comprobatorios SET status = 'aprovado' WHERE id_aluno = $1`,
    [idAluno],
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
