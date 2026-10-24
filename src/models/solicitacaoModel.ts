import pool from "../config/database";

export async function buscarIdPorUsuarioId(idUsuario: number) {
  return pool.query("SELECT id FROM usuarios WHERE id = $1", [idUsuario]);
}

export async function inserir(dados: {
  idAluno: number;
  idAluno_treinoExercicio: number;
}) {
  return pool.query(
    `INSERT INTO solicitacoes_auxilio (id_aluno, id_aluno_treino_exercicio, id_instrutor, status)
     SELECT a.id_usuario, ate.id, a.id_instrutor, 'aberto'
     FROM alunos a
     JOIN aluno_treinos at ON at.id_aluno = a.id_usuario AND at.ativo = true
     JOIN aluno_treino_exercicios ate ON ate.id_aluno_treino = at.id
     WHERE a.id_usuario = $1 AND ate.id = $2
     RETURNING id`,
    [dados.idAluno, dados.idAluno_treinoExercicio],
  );
}

export async function listarDoAluno(idAluno: number) {
  return pool.query(
    `SELECT
       s.id AS id_solicitacao,
       t.nome AS nome_treino, e.nome AS nome_exercicio,
       e.foto_url AS foto_exercicio_url,
       s.status, s.criado_em AS solicitado_em
     FROM solicitacoes_auxilio s
     JOIN aluno_treino_exercicios ate ON ate.id = s.id_aluno_treino_exercicio
     JOIN exercicios e ON e.id = ate.id_exercicio
     JOIN aluno_treinos at ON at.id = ate.id_aluno_treino
     JOIN treinos t ON t.id = at.id_treino
     WHERE s.id_aluno = $1
     ORDER BY s.criado_em DESC`,
    [idAluno],
  );
}

export async function cancelar(idSolicitacao: string, idAluno: number) {
  return pool.query(
    `UPDATE solicitacoes_auxilio SET status = 'cancelado'
     WHERE id = $1 AND id_aluno = $2 AND status = 'aberto'
     RETURNING id`,
    [idSolicitacao, idAluno],
  );
}

export async function listarAbertas() {
  return pool.query(
    `SELECT
       s.id AS id_solicitacao,
       ua.nome AS aluno_nome, ua.foto_url AS aluno_foto_url,
       e.nome AS nome_exercicio, s.status, s.criado_em AS solicitado_em
     FROM solicitacoes_auxilio s
     JOIN usuarios ua ON ua.id = s.id_aluno
     JOIN aluno_treino_exercicios ate ON ate.id = s.id_aluno_treino_exercicio
     JOIN exercicios e ON e.id = ate.id_exercicio
     WHERE s.status = 'aberto'
     ORDER BY s.criado_em ASC`,
  );
}

export async function atender(idSolicitacao: string, idInstrutor: number) {
  return pool.query(
    `UPDATE solicitacoes_auxilio
     SET status = 'atendido', id_instrutor = COALESCE(id_instrutor, $2)
     WHERE id = $1 AND status = 'aberto'
     RETURNING id`,
    [idSolicitacao, idInstrutor],
  );
}
