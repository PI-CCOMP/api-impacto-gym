ALTER TYPE status_documento ADD VALUE IF NOT EXISTS 'cancelado';

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS revisao_medica_pendente BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prazo_revisao_medica TIMESTAMPTZ;

DROP INDEX IF EXISTS idx_documento_unico_em_revisao;

CREATE UNIQUE INDEX idx_documento_unico_em_revisao
  ON documentos_comprobatorios (id_aluno)
  WHERE status = 'pendente';

DELETE FROM auth_sessoes s
USING usuarios u
WHERE s.id_usuario = u.id
  AND u.perfil IN ('admin', 'recepcionista', 'instrutor');
