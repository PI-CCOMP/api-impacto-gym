BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'email_verificado'
  ) THEN
    -- Existing accounts predate the challenge; only new accounts start unverified.
    ALTER TABLE usuarios
      ADD COLUMN email_verificado BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE usuarios
      ALTER COLUMN email_verificado SET DEFAULT false;
  END IF;
END $$;

ALTER TABLE auth_codigos_email
  DROP CONSTRAINT IF EXISTS auth_codigos_email_finalidade_check;

ALTER TABLE auth_codigos_email
  ADD CONSTRAINT auth_codigos_email_finalidade_check
  CHECK (finalidade IN ('login_admin', 'recuperacao_senha', 'verificacao_cadastro'));

COMMIT;
