# 🚀 API - SISTEMA PARA MUSCULAÇÃO: APLICAÇÃO PARA ORGANIZAÇÃO DE FICHAS DE TREINO

Backend responsável pelo gerenciamento de treinos, alunos e administradores (**instrutores e recepcionistas**) para academia.

Esta API fornece toda a lógica de autenticação, gerenciamento de usuários, treinos, histórico e comunicação do sistema, sendo integrada à aplicação Frontend desenvolvida com **React + TypeScript**.

---

## 🏋️ Sobre o Projeto

O sistema foi desenvolvido para modernizar o gerenciamento de academias, centralizando informações de:

- 👤 Alunos
- 🧑‍🏫 Instrutores
- 🧾 Recepcionistas
- 📋 Fichas de treino
- 📈 Histórico de treinos
- 📢 Avisos
- 🆘 Solicitações de ajuda

A API atua como camada principal de processamento e persistência dos dados.

---

## ✨ Funcionalidades da API

### 🔐 Autenticação
- Login de usuários
- Controle de sessão
- Middleware de autenticação
- Validação de acesso
- Proteção de rotas privadas

### 👥 Usuários
- Cadastro de usuários
- Consulta de usuários
- Atualização de dados
- Controle de permissões

### 🏋️ Treinos
- Cadastro de treino
- Edição de treino
- Consulta de fichas
- Organização de exercícios
- Associação treino → aluno

### 📈 Histórico
- Registro de treinos realizados
- Histórico do aluno
- Controle de progresso

### 📢 Avisos
- Criação de avisos
- Consulta de comunicados
- Gestão administrativa

### 🆘 Solicitações
- Solicitações de ajuda do aluno
- Controle de atendimento

### ⏳ Sessões
- Controle de sessão
- Persistência de login

---

## 🛠️ Tecnologias Utilizadas

- **Node.js**
- **TypeScript**
- **Express.js**
- **PostgreSQL** (Docker local)
- **JWT + bcrypt** (autenticação própria)
- **Azure Communication Services** (e-mail)
- **Multer**
- **Middlewares personalizados**

## Executar localmente

1. Inicie o PostgreSQL:

```powershell
docker compose up -d
```

2. Instale as dependências:

```powershell
npm install
```

Use Node.js 22 ou superior. Configure o `.env` com `DATABASE_URL`, `JWT_SECRET` (aleatório, com pelo menos 32 caracteres), as variáveis `ADMIN_*` para provisionar o primeiro administrador, `AZURE_COMMUNICATION_CONNECTION_STRING` e `AZURE_COMMUNICATION_SENDER_EMAIL` para envio de e-mail.

Para testes locais, `DISABLE_EMAIL=true` desativa o envio e imprime o conteúdo dos e-mails, incluindo códigos, no terminal. Essa opção é ignorada em produção e não deve ser habilitada em ambientes produtivos.

4. Crie o primeiro administrador e inicie a API:

```powershell
npm run seed:admin
npm run dev
```

A API fica em `http://localhost:3001`. O PostgreSQL local usa um volume Docker persistente; `schema.sql` é executado na primeira inicialização de um volume vazio.

Para executar API e PostgreSQL em containers, configure as variáveis no `.env` e use `docker compose --profile api up -d`. Em produção, configure `FILE_STORAGE_PROVIDER=azure`, `AZURE_STORAGE_CONNECTION_STRING` e, opcionalmente, `AZURE_STORAGE_PHOTOS_CONTAINER`; o container de fotos permanece privado. O armazenamento local é destinado ao desenvolvimento. Laudos médicos continuam em armazenamento local privado.

O login de administrador, recepcionista e instrutor ocorre em duas etapas: `POST /auth/login` envia o código e `POST /auth/login/verificar-email` valida `{ "email": "...", "codigo": "123456" }`. O código pode ser reenviado por `POST /auth/login/reenviar-codigo`. Cadastros de aluno, inclusive os criados por um administrador, ficam pendentes até aprovação manual; deficiência e restrição médica são listas de enums.

Se já existe um volume PostgreSQL, aplique manualmente cada migration ainda não executada. Para bancos anteriores à 006, execute primeiro `docker compose exec -T postgres psql -U impacto_gym -d impacto_gym -f /docker-entrypoint-initdb.d/007-medical-lists-and-pending-email.sql`; depois aplique 007 com `docker compose exec -T postgres psql -U impacto_gym -d impacto_gym -f /docker-entrypoint-initdb.d/008-medical-review-private-photos.sql`. A migration 007 encerra sessões antigas da equipe para exigir o novo MFA; admin, recepcionistas e instrutores precisarão entrar novamente. Volumes novos executam o schema e as migrations automaticamente.

Fotos de perfil são validadas pelo conteúdo, convertidas para WebP, redimensionadas para até 512 × 512 e armazenadas em `UPLOAD_DIR` no desenvolvimento ou Azure Blob em produção. As URLs seguem o endpoint autenticado `GET /usuarios/fotos/:id_usuario` e exigem token Bearer.

Alunos ativos mantêm o acesso por sete dias após uma alteração real nas informações médicas que exija nova documentação. A partir do vencimento, login, renovação de sessão e rotas autenticadas ficam bloqueados até a aprovação do novo laudo; o envio tardio continua disponível com token próprio. Se deficiência e restrição voltarem a `nenhuma`, a revisão pendente é cancelada e não se exige laudo. Para cadastros ainda pendentes, uma alteração médica invalida laudos anteriores; o aluno precisa enviar um novo documento e o prazo original de sete dias não é reiniciado.

---

## 📁 Estrutura do Projeto

```bash
src/
│── config/              # Configurações do banco e JWT
│   ├── database.ts
│   └── tokens.ts
│
│── controllers/         # Regras de negócio
│   ├── authController.ts
│   ├── avisoController.ts
│   ├── cadastroController.ts
│   ├── historicoController.ts
│   ├── sessaoController.ts
│   ├── solicitacaoController.ts
│   ├── treinoController.ts
│   └── usuarioController.ts
│
│── middlewares/         # Middlewares da aplicação
│   ├── auth.ts
│   ├── errorHandler.ts
│   └── upload.ts
│
│── models/              # Comunicação com banco
│   ├── authModel.ts
│   ├── avisoModel.ts
│   ├── cadastroModel.ts
│   ├── historicoModel.ts
│   ├── sessaoModel.ts
│   ├── solicitacaoModel.ts
│   ├── treinoModel.ts
│   └── usuarioModel.ts
│
│── routes/              # Endpoints da API
│   ├── auth.ts
│   ├── avisos.ts
│   ├── cadastros.ts
│   ├── exercicios.ts
│   ├── historico.ts
│   ├── sessoes.ts
│   ├── solicitacoes.ts
│   ├── treinos.ts
│   └── usuarios.ts
│
│── types/               # Tipagens globais
│── utils/               # Funções utilitárias
│── server.ts            # Inicialização da API
```

---

## 🔗 Integração com Frontend

Esta API foi desenvolvida para integração com o repositório frontend:

# 🏋️ SISTEMA PARA MUSCULAÇÃO: APLICAÇÃO PARA ORGANIZAÇÃO DE FICHAS DE TREINO

Responsável pela interface do aluno, instrutor e recepção.

---

## 🌐 Principais Endpoints

### 🔐 Autenticação

| Método | Endpoint |
|--------|-----------|
| POST | `/auth/login` |
| POST | `/auth/login/verificar-email` |
| POST | `/auth/email/verificar` |
| POST | `/auth/email/reenviar-verificacao` |
| POST | `/auth/email/solicitar-upload-laudo` |
| POST | `/cadastros` |
| POST | `/cadastros/:id_aluno/documento` |
| GET | `/cadastros/:id_aluno/documentos/:id_documento` |
| PATCH | `/cadastros/:id_aluno/documentos/:id_documento/aprovar` |
| PATCH | `/cadastros/:id_aluno/documentos/:id_documento/rejeitar` |

No cadastro público, `/cadastros` envia um código ACS e retorna `email_verification_required`. Confirme com `POST /auth/email/verificar`, enviando `{ "email": "...", "codigo": "123456" }`. Para alunos pendentes com restrição/deficiência, a confirmação retorna `cadastro_token`, válido por 30 minutos e restrito ao envio do próprio laudo. Caso expire, `POST /auth/email/solicitar-upload-laudo` recebe e-mail/senha e emite outro token. O envio tardio continua permitido.

Admin e recepcionista aprovam/rejeitam cadastros e documentos; instrutores não acessam laudos nem aprovam cadastros. A rejeição exige `motivo_rejeicao` e tenta notificar o aluno por e-mail. A aprovação do cadastro não aprova automaticamente o laudo.

### 👥 Usuários

| Método | Endpoint |
|--------|-----------|
| GET | `/usuarios` |
| GET | `/usuarios/fotos/:id_usuario` (Bearer obrigatório) |
| POST | `/usuarios` |
| PUT | `/usuarios/:id` |
| DELETE | `/usuarios/:id` |

### 🏋️ Treinos

| Método | Endpoint |
|--------|-----------|
| GET | `/treinos` |
| POST | `/treinos` |
| PUT | `/treinos/:id` |
| DELETE | `/treinos/:id` |

### 📢 Avisos

| Método | Endpoint |
|--------|-----------|
| GET | `/avisos` |
| POST | `/avisos` |

### 📈 Histórico

| Método | Endpoint |
|--------|-----------|
| GET | `/historico` |

### 🆘 Solicitações

| Método | Endpoint |
|--------|-----------|
| GET | `/solicitacoes` |
| POST | `/solicitacoes` |

---

## 🔒 Segurança

A API possui:

- Middleware de autenticação
- Controle de acesso por rota
- Proteção de endpoints privados
- Tratamento global de erros
- Validações de dados
- Gerenciamento de sessão

---

## 🎯 Objetivo do Projeto

O objetivo da API é fornecer uma infraestrutura robusta para:

- Organização de fichas de treino
- Gestão de alunos
- Administração da academia
- Comunicação entre academia e alunos
- Histórico e evolução de treinos
