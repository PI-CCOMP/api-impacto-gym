import pool from "../config/database";

export async function buscarIdPorAuthId(authId: string) {
  return pool.query("SELECT id FROM usuarios WHERE id_auth = $1", [authId]);
}

export async function listarMeusTreinos(idAluno: number) {
  return pool.query(
    `SELECT
       at.id AS id_aluno_treino, t.id AS id_treino, t.nome AS nome_treino,
       t.grupos_musculares, u.nome AS autor, at.ativo
     FROM aluno_treinos at
     JOIN treinos t ON t.id = at.id_treino
     JOIN usuarios u ON u.id = t.id_instrutor
     WHERE at.id_aluno = $1 AND at.ativo = true
     ORDER BY at.criado_em DESC`,
    [idAluno],
  );
}

export async function buscarAluno_treino(
  idAluno_treino: string,
  idAluno: number,
) {
  return pool.query(
    `SELECT at.id, t.nome AS nome_treino, t.grupos_musculares, u.nome AS autor
     FROM aluno_treinos at
     JOIN treinos t ON t.id = at.id_treino
     JOIN usuarios u ON u.id = t.id_instrutor
     WHERE at.id = $1 AND at.id_aluno = $2`,
    [idAluno_treino, idAluno],
  );
}

export async function buscarInstrutorDeTreino(idTreino: string) {
  return pool.query(`SELECT id_instrutor FROM treinos WHERE id = $1`, [
    idTreino,
  ]);
}

export async function verificarCompatibilidadeInstrutorTreino(
  idTreino: string,
  idAluno: number,
) {
  return pool.query(
    `SELECT t.id_instrutor AS instrutor_do_treino, a.id_instrutor AS instrutor_do_aluno
     FROM treinos t
     JOIN alunos a ON a.id_usuario = $2
     WHERE t.id = $1
       AND (
         a.id_instrutor IS NULL
         OR a.id_instrutor = t.id_instrutor
       )`,
    [idTreino, idAluno],
  );
}

export async function atribuirInstrutorSeNulo(
  client: any,
  idAluno: number,
  idInstrutor: number,
) {
  return client.query(
    `UPDATE alunos SET id_instrutor = $1
     WHERE id_usuario = $2 AND id_instrutor IS NULL
     RETURNING id_usuario`,
    [idInstrutor, idAluno],
  );
}

export async function buscarExerciciosDoAluno_treino(idAluno_treino: string) {
  return pool.query(
    `SELECT
       e.id AS id_exercicio, e.nome, e.foto_url, e.video_url, e.imagem_ativacao_muscular_url, e.grupo_muscular,
       json_agg(json_build_object(
         'numero', ate.numero_serie,
         'repeticoes', ate.repeticoes,
         'carga_sugerida', ate.carga_sugerida,
         'tempo_descanso', ate.tempo_descanso
       ) ORDER BY ate.numero_serie) AS series
     FROM aluno_treino_exercicios ate
     JOIN exercicios e ON e.id = ate.id_exercicio
     WHERE ate.id_aluno_treino = $1
     GROUP BY e.id, e.nome, e.foto_url, e.video_url, e.imagem_ativacao_muscular_url, e.grupo_muscular
     ORDER BY MIN(ate.numero_serie)`,
    [idAluno_treino],
  );
}

export async function buscarExercicioPorId(idExercicio: string) {
  return pool.query(
    `SELECT id AS id_exercicio, nome, foto_url, video_url, imagem_ativacao_muscular_url, grupo_muscular
     FROM exercicios WHERE id = $1 AND ativo = true`,
    [idExercicio],
  );
}

export async function listarTreinos(filtros: {
  busca: string;
  grupoMuscular: string;
  isInstrutor: boolean;
  instrutorId: number;
  porPagina: number;
  offset: number;
}) {
  return pool.query(
    `SELECT
       t.id AS id_treino, t.nome, t.grupos_musculares, u.nome AS autor,
       COUNT(*) OVER() AS total
     FROM treinos t
     JOIN usuarios u ON u.id = t.id_instrutor
     WHERE ($1 = '' OR t.nome ILIKE '%' || $1 || '%')
       AND ($2 = '' OR $2::grupo_muscular = ANY(t.grupos_musculares))
       AND ($3 = false OR t.id_instrutor = $4)
     ORDER BY t.criado_em DESC
     LIMIT $5 OFFSET $6`,
    [
      filtros.busca,
      filtros.grupoMuscular,
      filtros.isInstrutor,
      filtros.instrutorId,
      filtros.porPagina,
      filtros.offset,
    ],
  );
}

export async function buscarTreinoPorId(idTreino: string) {
  return pool.query(
    `SELECT t.id AS id_treino, t.nome, t.grupos_musculares, u.nome AS autor
     FROM treinos t JOIN usuarios u ON u.id = t.id_instrutor
     WHERE t.id = $1`,
    [idTreino],
  );
}

export async function verificarDonoTreino(
  idTreino: string,
  instrutorId: number,
) {
  return pool.query(
    "SELECT 1 FROM treinos WHERE id = $1 AND id_instrutor = $2",
    [idTreino, instrutorId],
  );
}

export async function buscarExerciciosDeTreino(idTreino: string) {
  return pool.query(
    `SELECT e.id AS id_exercicio, e.nome, e.foto_url, e.grupo_muscular
     FROM treino_exercicios te JOIN exercicios e ON e.id = te.id_exercicio
     WHERE te.id_treino = $1 ORDER BY te.ordem`,
    [idTreino],
  );
}

export async function buscarAlunosDoTreino(idTreino: string) {
  return pool.query(
    `SELECT u.id AS id_usuario, at.id AS id_aluno_treino, u.nome, u.cpf
     FROM aluno_treinos at JOIN usuarios u ON u.id = at.id_aluno
     WHERE at.id_treino = $1 AND at.ativo = true`,
    [idTreino],
  );
}

export async function buscarGruposMusculares(ids: number[]) {
  return pool.query(
    "SELECT DISTINCT grupo_muscular FROM exercicios WHERE id = ANY($1)",
    [ids],
  );
}

export async function inserirTreino(
  client: any,
  nome: string,
  grupos: string[],
  idInstrutor: number,
) {
  return client.query(
    "INSERT INTO treinos (nome, grupos_musculares, id_instrutor) VALUES ($1, $2, $3) RETURNING id",
    [nome, grupos, idInstrutor],
  );
}

export async function inserirTreinoExercicio(
  client: any,
  dados: {
    idTreino: number;
    idExercicio: number;
    ordem: number;
    series: number;
    repeticoes: number;
    cargaSugerida: number;
    tempoDescanso: number;
  },
) {
  return client.query(
    `INSERT INTO treino_exercicios (id_treino, id_exercicio, ordem, series, repeticoes, carga_sugerida, tempo_descanso)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      dados.idTreino,
      dados.idExercicio,
      dados.ordem,
      dados.series,
      dados.repeticoes,
      dados.cargaSugerida,
      dados.tempoDescanso,
    ],
  );
}

export async function atualizarTreino(
  client: any,
  idTreino: string,
  nome: string,
  grupos: string[],
) {
  return client.query(
    "UPDATE treinos SET nome = $1, grupos_musculares = $2 WHERE id = $3",
    [nome, grupos, idTreino],
  );
}

export async function excluirExerciciosDeTreino(client: any, idTreino: string) {
  return client.query("DELETE FROM treino_exercicios WHERE id_treino = $1", [
    idTreino,
  ]);
}

export async function verificarAlunosVinculados(idTreino: string) {
  return pool.query(
    "SELECT 1 FROM aluno_treinos WHERE id_treino = $1 AND ativo = true LIMIT 1",
    [idTreino],
  );
}

export async function excluirTreinoPorId(idTreino: string) {
  return pool.query("DELETE FROM treinos WHERE id = $1 RETURNING id", [
    idTreino,
  ]);
}

export async function verificarAlunoDoInstrutor(
  idAluno: number,
  instrutorId: number,
) {
  return pool.query(
    "SELECT 1 FROM alunos WHERE id_usuario = $1 AND id_instrutor = $2",
    [idAluno, instrutorId],
  );
}

export async function vincularAlunoATreino(
  client: any,
  idAluno: number,
  idTreino: string,
) {
  return client.query(
    "INSERT INTO aluno_treinos (id_aluno, id_treino) VALUES ($1, $2) RETURNING id",
    [idAluno, idTreino],
  );
}

export async function buscarExerciciosModeloTreino(idTreino: string) {
  return pool.query(
    "SELECT id_exercicio, series, repeticoes, carga_sugerida, tempo_descanso, ordem FROM treino_exercicios WHERE id_treino = $1",
    [idTreino],
  );
}

export async function inserirAluno_treinoExercicio(
  client: any,
  dados: {
    idAluno_treino: number;
    idExercicio: number;
    numeroSerie: number;
    repeticoes: number;
    cargaSugerida: number;
    tempoDescanso: number;
  },
) {
  return client.query(
    `INSERT INTO aluno_treino_exercicios (id_aluno_treino, id_exercicio, numero_serie, repeticoes, carga_sugerida, tempo_descanso)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      dados.idAluno_treino,
      dados.idExercicio,
      dados.numeroSerie,
      dados.repeticoes,
      dados.cargaSugerida,
      dados.tempoDescanso,
    ],
  );
}

export async function desvincularAlunoDeTreino(
  idTreino: string,
  idAluno: string,
) {
  return pool.query(
    "DELETE FROM aluno_treinos WHERE id_treino = $1 AND id_aluno = $2 RETURNING id",
    [idTreino, idAluno],
  );
}

export async function listarExercicios(filtros: {
  busca: string;
  grupoMuscular: string;
  porPagina: number;
  offset: number;
}) {
  return pool.query(
    `SELECT id AS id_exercicio, nome, foto_url, video_url, grupo_muscular, ativo,
            COUNT(*) OVER() AS total
     FROM exercicios
     WHERE ativo = true
       AND ($1 = '' OR nome ILIKE '%' || $1 || '%')
       AND ($2 = '' OR grupo_muscular = $2::grupo_muscular)
     ORDER BY nome ASC
     LIMIT $3 OFFSET $4`,
    [filtros.busca, filtros.grupoMuscular, filtros.porPagina, filtros.offset],
  );
}

export async function inserirExercicio(dados: {
  nome: string;
  grupoMuscular: string;
  fotoUrl: string | null;
  videoUrl: string | null;
  imagemAtivacaoUrl: string | null;
}) {
  return pool.query(
    `INSERT INTO exercicios (nome, grupo_muscular, foto_url, video_url, imagem_ativacao_muscular_url)
     VALUES ($1, $2::grupo_muscular, $3, $4, $5)
     RETURNING id`,
    [
      dados.nome,
      dados.grupoMuscular,
      dados.fotoUrl,
      dados.videoUrl,
      dados.imagemAtivacaoUrl,
    ],
  );
}

export async function atualizarExercicio(
  id: string,
  dados: {
    nome?: string;
    grupoMuscular?: string;
    fotoUrl?: string | null;
    videoUrl?: string | null;
    imagemAtivacaoUrl?: string | null;
  },
) {
  return pool.query(
    `UPDATE exercicios SET
       nome = COALESCE($1, nome),
       grupo_muscular = COALESCE($2::grupo_muscular, grupo_muscular),
       foto_url = COALESCE($3, foto_url),
       video_url = COALESCE($4, video_url),
       imagem_ativacao_muscular_url = COALESCE($5, imagem_ativacao_muscular_url)
     WHERE id = $6
     RETURNING id`,
    [
      dados.nome || null,
      dados.grupoMuscular || null,
      dados.fotoUrl,
      dados.videoUrl,
      dados.imagemAtivacaoUrl,
      id,
    ],
  );
}

export async function inativarExercicio(id: string) {
  return pool.query(
    `UPDATE exercicios SET ativo = false WHERE id = $1
     AND NOT EXISTS (
       SELECT 1 FROM treino_exercicios te
       JOIN aluno_treinos at ON at.id_treino = te.id_treino
       WHERE te.id_exercicio = $1 AND at.ativo = true
     )
     RETURNING id`,
    [id],
  );
}
