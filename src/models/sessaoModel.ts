import pool from "../config/database";

export async function buscarIdPorAuthId(authId: string) {
  const { rows } = await pool.query(
    "SELECT id FROM usuarios WHERE id_auth = $1",
    [authId],
  );
  return rows.length > 0 ? (rows[0].id as number) : null;
}

export async function verificarSessaoAtiva(idUsuario: number) {
  return pool.query(
    `SELECT 1 FROM sessoes_treino WHERE id_aluno = $1 AND status = 'em_andamento'`,
    [idUsuario],
  );
}

export async function verificarAluno_treinoDoAluno(
  idAluno_treino: number,
  idUsuario: number,
) {
  return pool.query(
    "SELECT 1 FROM aluno_treinos WHERE id = $1 AND id_aluno = $2",
    [idAluno_treino, idUsuario],
  );
}

export async function iniciar(idUsuario: number, idAluno_treino: number) {
  return pool.query(
    `INSERT INTO sessoes_treino (id_aluno, id_aluno_treino, status)
     VALUES ($1, $2, 'em_andamento')
     RETURNING id, iniciado_em, status`,
    [idUsuario, idAluno_treino],
  );
}

export async function buscarAtiva(idUsuario: number) {
  return pool.query(
    `SELECT s.id AS id_sessao, s.id_aluno_treino, t.nome AS nome_treino,
            s.iniciado_em, s.status
     FROM sessoes_treino s
     JOIN aluno_treinos at ON at.id = s.id_aluno_treino
     JOIN treinos t ON t.id = at.id_treino
     WHERE s.id_aluno = $1 AND s.status = 'em_andamento'`,
    [idUsuario],
  );
}

export async function buscarSeriesDaSessao(idSessao: number) {
  return pool.query(
    `SELECT id_aluno_treino_exercicio, numero_serie, carga_real
     FROM sessao_series WHERE id_sessao = $1`,
    [idSessao],
  );
}

export async function verificarSessaoDoAluno(
  idSessao: number,
  idUsuario: number,
) {
  return pool.query(
    `SELECT 1 FROM sessoes_treino WHERE id = $1 AND id_aluno = $2 AND status = 'em_andamento'`,
    [idSessao, idUsuario],
  );
}

export async function registrarSerie(dados: {
  idSessao: number;
  idAluno_treinoExercicio: number;
  numeroSerie: number;
  cargaReal: number;
}) {
  return pool.query(
    `INSERT INTO sessao_series (id_sessao, id_aluno_treino_exercicio, numero_serie, carga_real)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (id_sessao, id_aluno_treino_exercicio, numero_serie)
     DO UPDATE SET carga_real = EXCLUDED.carga_real`,
    [
      dados.idSessao,
      dados.idAluno_treinoExercicio,
      dados.numeroSerie,
      dados.cargaReal,
    ],
  );
}

export async function atualizarCargaReal(
  cargaReal: number,
  idAluno_treinoExercicio: number,
) {
  return pool.query(
    `UPDATE aluno_treino_exercicios SET carga_real = $1 WHERE id = $2`,
    [cargaReal, idAluno_treinoExercicio],
  );
}

export async function finalizar(idSessao: string, idUsuario: number) {
  return pool.query(
    `UPDATE sessoes_treino SET status = 'finalizado', finalizado_em = NOW()
     WHERE id = $1 AND id_aluno = $2 AND status = 'em_andamento'
     RETURNING id, id_aluno_treino`,
    [idSessao, idUsuario],
  );
}

export async function inserirHistorico(
  client: any,
  dados: {
    idUsuario: number;
    idAluno_treino: number;
    duracaoSegundos: number;
    volumeTotal: number;
  },
) {
  return client.query(
    `INSERT INTO historico_treinos (id_aluno, id_aluno_treino, duracao_segundos, volume_total)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [
      dados.idUsuario,
      dados.idAluno_treino,
      dados.duracaoSegundos,
      dados.volumeTotal,
    ],
  );
}

export async function abandonar(idSessao: string, idUsuario: number) {
  return pool.query(
    `UPDATE sessoes_treino SET status = 'abandonado', finalizado_em = NOW()
     WHERE id = $1 AND id_aluno = $2 AND status = 'em_andamento'
     RETURNING id`,
    [idSessao, idUsuario],
  );
}
