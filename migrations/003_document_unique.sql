CREATE UNIQUE INDEX IF NOT EXISTS idx_documento_unico_em_revisao
  ON documentos_comprobatorios (id_aluno)
  WHERE status IN ('pendente', 'aprovado');