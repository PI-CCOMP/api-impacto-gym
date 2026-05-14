import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import { supabaseAdmin } from "../config/supabase";
import * as UsuarioModel from "../models/usuarioModel";
import {
  validarSenha,
  validarEmail,
  validarCpf,
  nomeArquivoSeguro,
} from "../utils/validate";
import { PERFIS_VALIDOS, SEXOS_VALIDOS } from "../types";

// GET /usuarios
export async function listarUsuarios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const busca = (req.query.busca as string) || "";
    const perfil = (req.query.perfil as string) || "";
    const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
    const porPagina = Math.min(
      50,
      parseInt(req.query.por_pagina as string) || 10,
    );
    const offset = (pagina - 1) * porPagina;
    const isInstrutor = req.user!.perfil === "instrutor";

    const { rows } = await UsuarioModel.listar({
      perfil,
      busca,
      isInstrutor,
      instrutorId: req.user!.id_usuario,
      porPagina,
      offset,
    });

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    res.json({
      dados: rows.map((r) => ({
        id_usuario: r.id_usuario,
        nome: r.nome,
        cpf: r.cpf,
        perfil: r.perfil,
        email: r.email,
        status: r.status ?? null,
        instrutor_vinculado:
          r.perfil === "aluno" && r.status === "ativo"
            ? (r.instrutor_vinculado ?? null)
            : undefined,
      })),
      total,
      pagina,
      por_pagina: porPagina,
    });
  } catch (err) {
    next(err);
  }
}

// GET /usuarios/eu
export async function usuarioAtual(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await UsuarioModel.buscarPorAuthId(req.user!.id);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const u = rows[0];
    res.json({ ...u, permissoes: resolverPermissoes(u.perfil) });
  } catch (err) {
    next(err);
  }
}

function resolverPermissoes(perfil: string): string[] {
  switch (perfil) {
    case "admin":
      return [
        "ver_aluno",
        "editar_aluno",
        "criar_usuario",
        "excluir_usuario",
        "gerenciar_treinos",
        "gerenciar_avisos",
        "aprovar_cadastro",
      ];
    case "instrutor":
      return [
        "ver_aluno",
        "editar_aluno",
        "gerenciar_treinos",
        "ver_solicitacoes",
      ];
    case "recepcionista":
      return [
        "ver_aluno",
        "editar_aluno_basico",
        "aprovar_cadastro",
        "gerenciar_avisos",
      ];
    case "aluno":
      return [
        "ver_proprios_dados",
        "ver_treinos",
        "ver_historico",
        "criar_solicitacao",
      ];
    default:
      return [];
  }
}

// GET /usuarios/:id
export async function buscarUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { rows } = await UsuarioModel.buscarPorId(id);

    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const r = rows[0];

    if (
      req.user!.perfil === "instrutor" &&
      r.perfil === "aluno" &&
      r.id_instrutor !== req.user!.id
    ) {
      res
        .status(403)
        .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
      return;
    }

    // aluno_treinos.id_aluno é FK para usuarios(id), não alunos(id) — usar id_usuario
    const { rows: treinos } = await UsuarioModel.buscarTreinosDoAluno(
      r.id_usuario,
    );

    res.json({
      id_usuario: r.id_usuario,
      nome: r.nome,
      cpf: r.cpf,
      email: r.email,
      sexo: r.sexo,
      foto_url: r.foto_url,
      perfil: r.perfil,
      criado_em: r.criado_em,
      aluno: r.nivel // checa se tem dados de aluno pelo campo nivel
        ? {
            id_aluno: r.id_usuario,
            nivel: r.nivel,
            objetivo: r.objetivo,
            deficiencia: r.deficiencia,
            restricao_medica: r.restricao_medica,
            status: r.status,
            id_instrutor: r.id_instrutor,
          }
        : null,
      treinos_vinculados: treinos,
    });
  } catch (err) {
    next(err);
  }
}

// POST /usuarios
export async function criarUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { nome, cpf, email, senha, sexo, perfil, foto_url, aluno } = req.body;

    if (!nome || !cpf || !email || !senha || !sexo || !perfil) {
      res.status(400).json({
        erro: "Campos obrigatórios ausentes.",
        codigo: "CAMPOS_OBRIGATORIOS",
      });
      return;
    }
    const nomeTrimmed = nome.trim();
    if (nomeTrimmed.length < 3) {
      res.status(422).json({
        erro: "Nome deve ter no mínimo 3 caracteres.",
        codigo: "NOME_INVALIDO",
      });
      return;
    }
    if (!validarEmail(email)) {
      res
        .status(422)
        .json({ erro: "E-mail inválido.", codigo: "EMAIL_INVALIDO" });
      return;
    }
    if (!validarCpf(cpf)) {
      res.status(422).json({ erro: "CPF inválido.", codigo: "CPF_INVALIDO" });
      return;
    }
    if (!validarSenha(senha)) {
      res.status(422).json({ erro: "Senha fraca.", codigo: "SENHA_FRACA" });
      return;
    }
    if (!PERFIS_VALIDOS.includes(perfil)) {
      res
        .status(422)
        .json({ erro: "Perfil inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }
    if (!SEXOS_VALIDOS.includes(sexo)) {
      res.status(422).json({ erro: "Sexo inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const dup = await UsuarioModel.verificarDuplicado(
      email,
      cpf.replace(/\D/g, ""),
    );
    if (dup.rows.length > 0) {
      res
        .status(409)
        .json({ erro: "CPF ou e-mail já cadastrado.", codigo: "DUPLICADO" });
      return;
    }

    const { data: authData, error: authError } = await UsuarioModel.criarNoAuth(
      email,
      senha,
    );
    if (authError || !authData.user) {
      res
        .status(500)
        .json({ erro: "Erro ao criar credenciais.", codigo: "ERRO_AUTH" });
      return;
    }

    await client.query("BEGIN");

    const { rows } = await UsuarioModel.inserirUsuario(client, {
      authId: authData.user.id,
      nome: nomeTrimmed,
      cpf: cpf.replace(/\D/g, ""),
      email,
      sexo,
      perfil,
      fotoUrl: foto_url ?? null,
    });
    const id_usuario = rows[0].id;

    if (perfil === "aluno" && aluno) {
      await UsuarioModel.inserirAluno(client, {
        idUsuario: id_usuario,
        objetivo: aluno.objetivo,
        nivel: aluno.nivel,
        deficiencia: aluno.deficiencia || "nenhuma",
        restricaoMedica: aluno.restricao_medica || "nenhuma",
        status: "ativo", // criado pelo admin: ativo diretamente (RN14)
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ id_usuario, perfil });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// PUT /usuarios/:id
export async function editarUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const { nome, email, sexo, perfil, foto_url, aluno } = req.body;
    const isRecepcionista = req.user!.perfil === "recepcionista";

    if (req.user!.perfil === "instrutor") {
      const check = await UsuarioModel.verificarInstrutorDoAluno(
        id,
        req.user!.id_usuario,
      );
      if (check.rows.length === 0) {
        res
          .status(403)
          .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
        return;
      }
    }

    if (email && !validarEmail(email)) {
      res
        .status(422)
        .json({ erro: "E-mail inválido.", codigo: "EMAIL_INVALIDO" });
      return;
    }
    if (sexo && !SEXOS_VALIDOS.includes(sexo)) {
      res.status(422).json({ erro: "Sexo inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    await UsuarioModel.atualizar(id, {
      nome,
      email,
      sexo,
      perfil,
      isRecepcionista,
      fotoUrl: foto_url,
    });

    if (aluno && !isRecepcionista) {
      await UsuarioModel.atualizarAluno(id, {
        objetivo: aluno.objetivo,
        nivel: aluno.nivel,
        deficiencia: aluno.deficiencia,
        restricaoMedica: aluno.restricao_medica,
        idInstrutor: aluno.id_instrutor ?? null,
      });
    }

    res.json({ id_usuario: Number(id), atualizado: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /usuarios/:id
export async function excluirUsuario(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const { rows } = await UsuarioModel.buscarAuthIdPorId(id);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    await client.query("BEGIN");
    await UsuarioModel.excluirPorId(client, id);
    await client.query("COMMIT");

    const { error } = await UsuarioModel.excluirNoAuth(rows[0].id_auth);
    if (error) {
      console.error("Erro ao deletar no Auth:", error);
    }

    res.json({ excluido: true });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// PATCH /usuarios/eu/foto
export async function uploadFotoPerfil(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        erro: "Arquivo de imagem obrigatório.",
        codigo: "ARQUIVO_AUSENTE",
      });
      return;
    }

    const { rows } = await UsuarioModel.buscarIdPorAuthId(req.user!.id);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const id_usuario = rows[0].id;

    const bucket = process.env.STORAGE_BUCKET_FOTOS ?? "fotos";
    const nomeArquivo = nomeArquivoSeguro(req.file.originalname);
    const caminho = `fotos/${id_usuario}/${nomeArquivo}`;

    const { error } = await supabaseAdmin.storage
      .from(bucket)
      .upload(caminho, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });

    if (error) {
      res
        .status(500)
        .json({ erro: "Erro ao armazenar imagem.", codigo: "STORAGE_ERRO" });
      return;
    }

    const { data: urlData } = supabaseAdmin.storage
      .from(bucket)
      .getPublicUrl(caminho);
    const foto_url = urlData.publicUrl;

    await UsuarioModel.atualizarFoto(foto_url, id_usuario);
    res.json({ foto_url });
  } catch (err) {
    next(err);
  }
}

export async function atualizarInstrutorDoAluno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const isAdmin = req.user!.perfil === "admin";
    const isInstrutor = req.user!.perfil === "instrutor";

    let id_instrutor: number | null;

    if (isInstrutor) {
      // Instrutor se auto-atribui — ignora qualquer body
      id_instrutor = req.user!.id_usuario;
    } else if (isAdmin) {
      // Admin precisa passar no body
      if (!("id_instrutor" in req.body)) {
        res.status(400).json({
          erro: "id_instrutor é obrigatório no body.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
        return;
      }
      id_instrutor = req.body.id_instrutor ?? null; // aceita null para desvincular
    } else {
      res
        .status(403)
        .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
      return;
    }

    const { rows: alunoRows } = await UsuarioModel.buscarPorId(id);
    if (alunoRows.length === 0 || alunoRows[0].perfil !== "aluno") {
      res
        .status(404)
        .json({ erro: "Aluno não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    if (id_instrutor !== null) {
      const { rows: perfilRows } =
        await UsuarioModel.validarPerfilInstrutor(id_instrutor);
      if (perfilRows.length === 0) {
        res.status(422).json({
          erro: "O usuário informado não possui perfil de instrutor ou admin.",
          codigo: "PERFIL_INVALIDO",
        });
        return;
      }
    }

    const { rows: instAtualRows } =
      await UsuarioModel.buscarInstrutorDoAluno(id);
    const instrutorAtual = instAtualRows[0]?.id_instrutor ?? null;
    const estaTrocando =
      instrutorAtual !== null && instrutorAtual !== id_instrutor;

    await client.query("BEGIN");

    if (estaTrocando) {
      await UsuarioModel.inativarTreinosDoAluno(client, id);
    }

    const { rows } = await UsuarioModel.atualizarInstrutorDoAluno(
      client,
      id,
      id_instrutor,
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res
        .status(404)
        .json({ erro: "Aluno não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    await client.query("COMMIT");

    res.json({
      id_usuario: Number(id),
      id_instrutor,
      treinos_inativados: estaTrocando,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /usuarios/:id/treinos/:id_aluno_treino
export async function desvincularTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id, id_aluno_treino } = req.params;
    const { rows } = await UsuarioModel.desvincularTreino(id, id_aluno_treino);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Vínculo não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ excluido: true });
  } catch (err) {
    next(err);
  }
}
