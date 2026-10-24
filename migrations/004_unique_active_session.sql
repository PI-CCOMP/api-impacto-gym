CREATE UNIQUE INDEX IF NOT EXISTS idx_sessao_unica_em_andamento
  ON sessoes_treino (id_aluno)
  WHERE status = 'em_andamento';