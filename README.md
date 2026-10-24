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

3. Configure o `.env` com `DATABASE_URL`, `JWT_SECRET` (aleatório, com pelo menos 32 caracteres), as variáveis `ADMIN_*` para provisionar o primeiro administrador, `AZURE_COMMUNICATION_CONNECTION_STRING` e `AZURE_COMMUNICATION_SENDER_EMAIL` para envio de e-mail.

4. Crie o primeiro administrador e inicie a API:

```powershell
npm run seed:admin
npm run dev
```

A API fica em `http://localhost:3001`. O PostgreSQL local usa um volume Docker persistente; `schema.sql` é executado na primeira inicialização de um volume vazio.

O login de administrador ocorre em duas etapas. `POST /auth/login` valida e-mail e senha e envia um código via Azure Communication Services; depois, `POST /auth/login/verificar-email` recebe `{ "email": "...", "codigo": "123456" }` e só então retorna os tokens. Os demais perfis continuam recebendo os tokens após o login. Para que o fechamento da página encerre a sessão do navegador, o frontend deve manter os tokens em `sessionStorage`, não em `localStorage`; o backend revoga a sessão no logout e aceita refresh por até sete dias.

Arquivos de perfil são salvos em `UPLOAD_DIR` e servidos pela API. Laudos médicos ficam em armazenamento local privado e não são expostos como arquivos estáticos. No Azure App Service, configure um caminho persistente para `UPLOAD_DIR`.

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

No cadastro público, `/cadastros` envia um código ACS e retorna `email_verification_required`. Confirme com `POST /auth/email/verificar`, enviando `{ "email": "...", "codigo": "123456" }`. Para alunos pendentes com restrição/deficiência, a confirmação retorna `cadastro_token`, válido por 30 minutos e restrito ao envio do próprio laudo. Caso expire, `POST /auth/email/solicitar-upload-laudo` recebe e-mail/senha e emite outro token. O aluno pode enviar o documento após o cadastro; o prazo de 10 dias é informado, mas não impede envio tardio. O acesso só é liberado após o e-mail confirmado, laudo aprovado quando exigido e cadastro aprovado.

Admin e assistente administrativo aprovam/rejeitam documentos. A rejeição exige `motivo_rejeicao` e tenta notificar o aluno por e-mail. A aprovação do cadastro não aprova automaticamente o laudo.

### 👥 Usuários

| Método | Endpoint |
|--------|-----------|
| GET | `/usuarios` |
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
