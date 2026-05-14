-- ============================================================
-- Impacto Gym — Schema PostgreSQL (Supabase)
-- Executar no SQL Editor do Supabase Project
-- ============================================================

--  Extensões 
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--  Enums 
CREATE TYPE perfil_usuario     AS ENUM ('admin', 'instrutor', 'recepcionista', 'aluno');
CREATE TYPE status_cadastro    AS ENUM ('pendente', 'ativo', 'rejeitado', 'inativo');
CREATE TYPE status_documento   AS ENUM ('pendente', 'aprovado', 'rejeitado');
CREATE TYPE status_solicitacao AS ENUM ('aberto', 'atendido', 'cancelado');
CREATE TYPE status_sessao      AS ENUM ('em_andamento', 'finalizado', 'abandonado');
CREATE TYPE sexo_usuario       AS ENUM ('M', 'F', 'O');
CREATE TYPE objetivo_aluno     AS ENUM ('hipertrofia','emagrecimento','condicionamento','forca','recomendacao_medica');
CREATE TYPE nivel_aluno        AS ENUM ('iniciante','intermediario','avancado');
CREATE TYPE grupo_muscular     AS ENUM ('Peitoral','Costas','Bracos','Pernas','Abdomen');

-- [NOVO] Enum para deficiência (antes era TEXT livre)
CREATE TYPE deficiencia_aluno AS ENUM (
  'nenhuma',
  'visual',
  'auditiva',
  'motora',
  'intelectual',
  'multipla',
  'outra'
);

-- [NOVO] Enum para restrição médica (antes era TEXT livre)
CREATE TYPE restricao_medica_aluno AS ENUM (
  'nenhuma',
  'problemas_cardiacos',
  'dores_no_peito',
  'tontura_ou_desmaios',
  'problemas_osseos',
  'medicamentos',
  'cirurgias_recentes',
  'outra'
);

--  usuarios 
CREATE TABLE usuarios (
  id         BIGSERIAL          PRIMARY KEY,
  id_auth    UUID               NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome       VARCHAR(120)       NOT NULL,
  cpf        CHAR(11)           NOT NULL UNIQUE,
  email      VARCHAR(120)       NOT NULL UNIQUE,
  sexo       sexo_usuario,
  perfil     perfil_usuario     NOT NULL,
  foto_url   TEXT,
  criado_em  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

--  alunos 
-- [ALTERADO] Removido id BIGSERIAL próprio — id_usuario é agora a PK (relação 1-para-1)
-- [ALTERADO] deficiencia e restricao_medica agora usam enums tipados
CREATE TABLE alunos (
  id_usuario        BIGINT                  PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  objetivo          objetivo_aluno          NOT NULL,
  nivel             nivel_aluno             NOT NULL,
  deficiencia       deficiencia_aluno       NOT NULL DEFAULT 'nenhuma',
  restricao_medica  restricao_medica_aluno  NOT NULL DEFAULT 'nenhuma',
  status            status_cadastro         NOT NULL DEFAULT 'pendente',
  id_instrutor      BIGINT                  REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em         TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

--  documentos_comprobatorios 
CREATE TABLE documentos_comprobatorios (
  id               BIGSERIAL        PRIMARY KEY,
  id_aluno         BIGINT           NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  caminho_arquivo  TEXT             NOT NULL,
  nome_arquivo     TEXT             NOT NULL,
  status           status_documento NOT NULL DEFAULT 'pendente',
  motivo_rejeicao  TEXT,
  enviado_em       TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

--  exercicios 
CREATE TABLE exercicios (
  id                             BIGSERIAL       PRIMARY KEY,
  nome                           VARCHAR(120)    NOT NULL,
  grupo_muscular                 grupo_muscular  NOT NULL,
  foto_url                       TEXT,
  video_url                      TEXT,
  imagem_ativacao_muscular_url   TEXT,
  ativo                          BOOLEAN         NOT NULL DEFAULT true,
  criado_em                      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

--  treinos 
CREATE TABLE treinos (
  id                BIGSERIAL          PRIMARY KEY,
  nome              VARCHAR(120)       NOT NULL,
  grupos_musculares grupo_muscular[]   NOT NULL DEFAULT '{}',
  id_instrutor      BIGINT             NOT NULL REFERENCES usuarios(id),
  criado_em         TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

--  treino_exercicios (template — modelo do instrutor) 
CREATE TABLE treino_exercicios (
  id             BIGSERIAL    PRIMARY KEY,
  id_treino      BIGINT       NOT NULL REFERENCES treinos(id) ON DELETE CASCADE,
  id_exercicio   BIGINT       NOT NULL REFERENCES exercicios(id),
  ordem          SMALLINT     NOT NULL,
  series         SMALLINT     NOT NULL,
  repeticoes     SMALLINT     NOT NULL,
  carga_sugerida NUMERIC(6,2) NOT NULL DEFAULT 0,
  tempo_descanso SMALLINT     NOT NULL DEFAULT 60
);

--  aluno_treinos (cópia exclusiva do treino para o aluno — RN18) 
CREATE TABLE aluno_treinos (
  id           BIGSERIAL   PRIMARY KEY,
  id_aluno     BIGINT      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  id_treino    BIGINT      NOT NULL REFERENCES treinos(id),
  ativo        BOOLEAN     NOT NULL DEFAULT true,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--  aluno_treino_exercicios (carga real registrada pelo aluno — RN20) 
CREATE TABLE aluno_treino_exercicios (
  id               BIGSERIAL     PRIMARY KEY,
  id_aluno_treino  BIGINT        NOT NULL REFERENCES aluno_treinos(id) ON DELETE CASCADE,
  id_exercicio     BIGINT        NOT NULL REFERENCES exercicios(id),
  numero_serie     SMALLINT      NOT NULL,
  repeticoes       SMALLINT      NOT NULL,
  carga_sugerida   NUMERIC(6,2)  NOT NULL DEFAULT 0,
  carga_real       NUMERIC(6,2),
  tempo_descanso   SMALLINT      NOT NULL DEFAULT 60
);

--  sessoes_treino 
CREATE TABLE sessoes_treino (
  id               BIGSERIAL      PRIMARY KEY,
  id_aluno         BIGINT         NOT NULL REFERENCES usuarios(id),
  id_aluno_treino  BIGINT         NOT NULL REFERENCES aluno_treinos(id),
  status           status_sessao  NOT NULL DEFAULT 'em_andamento',
  iniciado_em      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  finalizado_em    TIMESTAMPTZ
);

--  sessao_series (estado persistido da sessão — RN20) 
CREATE TABLE sessao_series (
  id_sessao                   BIGINT       NOT NULL REFERENCES sessoes_treino(id) ON DELETE CASCADE,
  id_aluno_treino_exercicio   BIGINT       NOT NULL REFERENCES aluno_treino_exercicios(id),
  numero_serie                SMALLINT     NOT NULL,
  carga_real                  NUMERIC(6,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id_sessao, id_aluno_treino_exercicio, numero_serie)
);

--  historico_treinos 
CREATE TABLE historico_treinos (
  id               BIGSERIAL     PRIMARY KEY,
  id_aluno         BIGINT        NOT NULL REFERENCES usuarios(id),
  id_aluno_treino  BIGINT        NOT NULL REFERENCES aluno_treinos(id),
  duracao_segundos INT           NOT NULL DEFAULT 0,
  volume_total     NUMERIC(10,2) NOT NULL DEFAULT 0,
  criado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

--  avisos 
CREATE TABLE avisos (
  id        BIGSERIAL    PRIMARY KEY,
  titulo    VARCHAR(200) NOT NULL,
  mensagem  TEXT         NOT NULL,
  id_autor  BIGINT       NOT NULL REFERENCES usuarios(id),
  criado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

--  solicitacoes_auxilio 
CREATE TABLE solicitacoes_auxilio (
  id                         BIGSERIAL          PRIMARY KEY,
  id_aluno                   BIGINT             NOT NULL REFERENCES usuarios(id),
  id_aluno_treino_exercicio  BIGINT             NOT NULL REFERENCES aluno_treino_exercicios(id),
  id_instrutor               BIGINT             REFERENCES usuarios(id),
  status                     status_solicitacao NOT NULL DEFAULT 'aberto',
  criado_em                  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

--  Índices 
CREATE INDEX idx_usuarios_id_auth       ON usuarios(id_auth);
CREATE INDEX idx_alunos_id_usuario      ON alunos(id_usuario);
CREATE INDEX idx_alunos_id_instrutor    ON alunos(id_instrutor);
CREATE INDEX idx_aluno_treinos_aluno    ON aluno_treinos(id_aluno);
CREATE INDEX idx_aluno_treinos_treino   ON aluno_treinos(id_treino);
CREATE INDEX idx_sessoes_aluno          ON sessoes_treino(id_aluno, status);
CREATE INDEX idx_historico_aluno        ON historico_treinos(id_aluno, criado_em DESC);
CREATE INDEX idx_solicitacoes_status    ON solicitacoes_auxilio(status);
CREATE INDEX idx_avisos_criado_em       ON avisos(criado_em DESC);

--  Row Level Security (RLS) 
ALTER TABLE usuarios                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE alunos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_comprobatorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercicios                ENABLE ROW LEVEL SECURITY;
ALTER TABLE treinos                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE treino_exercicios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE aluno_treinos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE aluno_treino_exercicios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_treino            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessao_series             ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_treinos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE avisos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes_auxilio      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON usuarios                  FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON alunos                    FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON documentos_comprobatorios FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON exercicios                FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON treinos                   FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON treino_exercicios         FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON aluno_treinos             FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON aluno_treino_exercicios   FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON sessoes_treino            FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON sessao_series             FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON historico_treinos         FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON avisos                    FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_all" ON solicitacoes_auxilio      FOR ALL TO service_role USING (true);