DO $$
BEGIN
  IF (
    SELECT t.typname = 'deficiencia_aluno'
    FROM pg_attribute a
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE a.attrelid = 'alunos'::regclass AND a.attname = 'deficiencia'
  ) THEN
    ALTER TABLE alunos
      ALTER COLUMN deficiencia DROP DEFAULT,
      ALTER COLUMN restricao_medica DROP DEFAULT;

    ALTER TABLE alunos
      ALTER COLUMN deficiencia TYPE deficiencia_aluno[]
        USING ARRAY[deficiencia],
      ALTER COLUMN restricao_medica TYPE restricao_medica_aluno[]
        USING ARRAY[restricao_medica];
  END IF;
END $$;

ALTER TABLE alunos
  ALTER COLUMN deficiencia SET DEFAULT ARRAY['nenhuma']::deficiencia_aluno[],
  ALTER COLUMN restricao_medica SET DEFAULT ARRAY['nenhuma']::restricao_medica_aluno[],
  ALTER COLUMN prazo_envio_laudo SET DEFAULT (NOW() + INTERVAL '7 days');

UPDATE alunos a
SET prazo_envio_laudo = u.criado_em + INTERVAL '7 days'
FROM usuarios u
WHERE u.id = a.id_usuario;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS email_pendente VARCHAR(120);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_pendente_lower
  ON usuarios (LOWER(email_pendente))
  WHERE email_pendente IS NOT NULL;

ALTER TABLE auth_codigos_email
  DROP CONSTRAINT IF EXISTS auth_codigos_email_finalidade_check;

ALTER TABLE auth_codigos_email
  ADD CONSTRAINT auth_codigos_email_finalidade_check
  CHECK (finalidade IN (
    'login_admin',
    'recuperacao_senha',
    'verificacao_cadastro',
    'alteracao_email',
    'convite_conta'
  ));
