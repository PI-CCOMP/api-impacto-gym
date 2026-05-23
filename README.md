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
- **Supabase**
- **JWT Authentication**
- **Multer**
- **Middlewares personalizados**

---

## 📁 Estrutura do Projeto

```bash
src/
│── config/              # Configurações do banco e Supabase
│   ├── database.ts
│   └── supabase.ts
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
| POST | `/auth/register` |

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
