ALTER TABLE historico_treinos
  ADD COLUMN IF NOT EXISTS id_sessao BIGINT
  REFERENCES sessoes_treino(id);

UPDATE historico_treinos h
SET id_sessao = s.id
FROM sessoes_treino s
WHERE h.id_sessao IS NULL
  AND s.id_aluno = h.id_aluno
  AND s.id_aluno_treino = h.id_aluno_treino
  AND s.status = 'finalizado'
  AND s.finalizado_em = h.criado_em;

CREATE UNIQUE INDEX IF NOT EXISTS idx_historico_sessao
  ON historico_treinos (id_sessao)
  WHERE id_sessao IS NOT NULL;
