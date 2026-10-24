ALTER TABLE auth_codigos_email
  ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE auth_codigos_email
  DROP CONSTRAINT IF EXISTS auth_codigos_email_tentativas_check;

ALTER TABLE auth_codigos_email
  ADD CONSTRAINT auth_codigos_email_tentativas_check
  CHECK (tentativas BETWEEN 0 AND 5);