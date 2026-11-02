import pool from "../config/database";

export async function buscarIdPorUsuarioId(idUsuario: number) {
  return pool.query("SELECT id FROM usuarios WHERE id = $1", [idUsuario]);
}

export async function listarUltimos30Dias(idUsuario: number) {
  return pool.query(
    `SELECT
       h.id AS id_historico, t.nome AS nome_treino,
       t.grupos_musculares, u.nome AS autor,
       (SELECT e.foto_url
        FROM aluno_treino_exercicios ate
        JOIN exercicios e ON e.id = ate.id_exercicio
        WHERE ate.id_aluno_treino = at.id
        ORDER BY ate.id
        LIMIT 1) AS foto_primeiro_exercicio_url,
       h.criado_em AS finalizado_em, h.duracao_segundos, h.volume_total
     FROM historico_treinos h
     JOIN aluno_treinos at ON at.id = h.id_aluno_treino
     JOIN treinos t ON t.id = at.id_treino
     JOIN usuarios u ON u.id = t.id_instrutor
     WHERE h.id_aluno = $1
       AND h.criado_em >= NOW() - INTERVAL '30 days'
     ORDER BY h.criado_em DESC`,
    [idUsuario],
  );
}

export async function buscarDetalhe(idHistorico: string, idUsuario: number) {
  return pool.query(
    `SELECT
       h.id AS id_historico, t.nome AS nome_treino,
       t.grupos_musculares, u.nome AS autor,
       h.criado_em AS finalizado_em, h.duracao_segundos, h.volume_total
     FROM historico_treinos h
     JOIN aluno_treinos at ON at.id = h.id_aluno_treino
     JOIN treinos t ON t.id = at.id_treino
     JOIN usuarios u ON u.id = t.id_instrutor
     WHERE h.id = $1 AND h.id_aluno = $2`,
    [idHistorico, idUsuario],
  );
}

export async function buscarExerciciosDoHistorico(idHistorico: string) {
  return pool.query(
    `SELECT
       e.id AS id_exercicio, e.nome, e.foto_url,
       json_agg(json_build_object(
         'numero', ss.numero_serie,
         'carga_real', ss.carga_real,
         'repeticoes', COALESCE(ss.repeticoes_real, ate.repeticoes)
       ) ORDER BY ss.numero_serie) AS series
     FROM sessao_series ss
     JOIN aluno_treino_exercicios ate ON ate.id = ss.id_aluno_treino_exercicio
     JOIN exercicios e ON e.id = ate.id_exercicio
     JOIN historico_treinos ht ON ht.id_sessao = ss.id_sessao
     WHERE ht.id = $1
     GROUP BY e.id, e.nome, e.foto_url`,
    [idHistorico],
  );
}
