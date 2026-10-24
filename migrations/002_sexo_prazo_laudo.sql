ALTER TYPE sexo_usuario ADD VALUE IF NOT EXISTS 'OUTRO';
ALTER TYPE sexo_usuario ADD VALUE IF NOT EXISTS 'PREFIRO_NAO_DIZER';

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS prazo_envio_laudo TIMESTAMPTZ;

UPDATE alunos a
SET prazo_envio_laudo = u.criado_em + INTERVAL '10 days'
FROM usuarios u
WHERE u.id = a.id_usuario
  AND a.prazo_envio_laudo IS NULL;

ALTER TABLE alunos
  ALTER COLUMN prazo_envio_laudo SET DEFAULT (NOW() + INTERVAL '10 days'),
  ALTER COLUMN prazo_envio_laudo SET NOT NULL;