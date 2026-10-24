import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import pool from "../config/database";
import * as AuthModel from "../models/authModel";
import * as UsuarioModel from "../models/usuarioModel";
import { enviarCodigoVerificacaoCadastro } from "../services/emailVerification";
import {
  validarSenha,
  validarEmail,
  validarCpf,
  nomeArquivoSeguro,
} from "../utils/validate";
import {
  PERFIS_VALIDOS,
  SEXOS_VALIDOS,
  OBJETIVOS_VALIDOS,
  NIVEIS_VALIDOS,
  DEFICIENCIAS_VALIDAS,
  RESTRICOES_VALIDAS,
} from "../types";

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
      isRecepcionista: req.user!.perfil === "recepcionista",
      instrutorId: req.user!.id_usuario,
      porPagina,
      offset,
    });

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const isAdmin = req.user!.perfil === "admin";
    res.json({
      dados: rows.map((r) => ({
        id_usuario: r.id_usuario,
        nome: r.nome,
        perfil: r.perfil,
        status: r.status ?? null,
        deficiencia: r.deficiencia ?? null,
        restricao_medica: r.restricao_medica ?? null,
        ...(isAdmin ? { cpf: r.cpf, email: r.email } : {}),
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
    const { rows } = await UsuarioModel.buscarPorUsuarioId(req.user!.id_usuario);
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

    if (req.user!.perfil !== "admin" && r.perfil !== "aluno") {
      res.status(403).json({
        erro: "Somente admin pode consultar detalhes de contas de staff.",
        codigo: "SEM_PERMISSAO",
      });
      return;
    }

    if (
      req.user!.perfil === "instrutor" &&
      r.perfil === "aluno" &&
      r.id_instrutor !== null &&
      r.id_instrutor !== req.user!.id_usuario
    ) {
      res
        .status(403)
        .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
      return;
    }

    const { rows: treinos } = await UsuarioModel.buscarTreinosDoAluno(
      r.id_usuario,
    );
    const dadosPessoais =
      req.user!.perfil === "admin"
        ? {
            cpf: r.cpf,
            email: r.email,
            sexo: r.sexo,
            criado_em: r.criado_em,
            email_verificado: r.email_verificado,
          }
        : {};

    res.json({
      id_usuario: r.id_usuario,
      nome: r.nome,
      foto_url: r.foto_url,
      perfil: r.perfil,
      ...dadosPessoais,
      // [CORRIGIDO] id_aluno removido — usar id_usuario como identificador único
      aluno: r.nivel
        ? {
            id_aluno: r.id_usuario,
            nivel: r.nivel,
            objetivo: r.objetivo,
            deficiencia: r.deficiencia,
            restricao_medica: r.restricao_medica,
            status: r.status,
            prazo_envio_laudo: r.prazo_envio_laudo,
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
    const emailNormalizado = email.trim().toLowerCase();
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
    if (
      perfil === "aluno" &&
      (!aluno ||
        !OBJETIVOS_VALIDOS.includes(aluno.objetivo) ||
        !NIVEIS_VALIDOS.includes(aluno.nivel))
    ) {
      res.status(422).json({
        erro: "Alunos precisam de objetivo e nível válidos.",
        codigo: "DADOS_ALUNO_INVALIDOS",
      });
      return;
    }
    const deficienciaAluno = (aluno?.deficiencia || "nenhuma")
      .toLowerCase()
      .replace(/\s+/g, "_");
    const restricaoAluno = (aluno?.restricao_medica || "nenhuma")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (
      perfil === "aluno" &&
      (!DEFICIENCIAS_VALIDAS.includes(
        deficienciaAluno as (typeof DEFICIENCIAS_VALIDAS)[number],
      ) ||
        !RESTRICOES_VALIDAS.includes(
          restricaoAluno as (typeof RESTRICOES_VALIDAS)[number],
        ))
    ) {
      res.status(422).json({ erro: "Restrição ou deficiência inválida.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const dup = await UsuarioModel.verificarDuplicado(
      emailNormalizado,
      cpf.replace(/\D/g, ""),
    );
    if (dup.rows.length > 0) {
      res
        .status(409)
        .json({ erro: "CPF ou e-mail já cadastrado.", codigo: "DUPLICADO" });
      return;
    }

    await client.query("BEGIN");

    const { rows } = await UsuarioModel.inserirUsuario(client, {
      nome: nomeTrimmed,
      cpf: cpf.replace(/\D/g, ""),
      email: emailNormalizado,
      senhaHash: await bcrypt.hash(senha, 12),
      sexo,
      perfil,
      fotoUrl: foto_url ?? null,
    });
    const id_usuario = rows[0].id;
    let prazoEnvioLaudo: Date | string | undefined;

    if (perfil === "aluno" && aluno) {
      const { rows: alunoRows } = await UsuarioModel.inserirAluno(client, {
        idUsuario: id_usuario,
        objetivo: aluno.objetivo,
        nivel: aluno.nivel,
        deficiencia: deficienciaAluno,
        restricaoMedica: restricaoAluno,
        status: "pendente",
      });
      prazoEnvioLaudo = alunoRows[0].prazo_envio_laudo;
    }

    await client.query("COMMIT");
    try {
      await enviarCodigoVerificacaoCadastro(id_usuario, emailNormalizado);
    } catch {
      res.status(503).json({
        erro: "Usuário criado, mas não foi possível enviar o código. Solicite novo envio.",
        codigo: "EMAIL_ENVIO_FALHOU",
        id_usuario,
        email_verification_required: true,
      });
      return;
    }
    res.status(201).json({
      id_usuario,
      perfil,
      ...(perfil === "aluno" ? { status: "pendente" } : {}),
      ...(prazoEnvioLaudo ? { prazo_envio_laudo: prazoEnvioLaudo } : {}),
      email_verification_required: true,
    });
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

    const { rows: atualizados } = await UsuarioModel.atualizar(id, {
      nome,
      email: email?.trim().toLowerCase(),
      sexo,
      perfil,
      fotoUrl: foto_url,
    });
    if (atualizados.length === 0) {
      res.status(404).json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const emailVerificationRequired =
      Boolean(email) && !atualizados[0].email_verificado;
    if (emailVerificationRequired) {
      await AuthModel.revogarSessoesDoUsuario(Number(id));
      try {
        await enviarCodigoVerificacaoCadastro(Number(id), atualizados[0].email);
      } catch {
        res.status(503).json({
          erro: "E-mail atualizado, mas não foi possível enviar o código. Solicite novo envio.",
          codigo: "EMAIL_ENVIO_FALHOU",
          email_verification_required: true,
        });
        return;
      }
    }

    if (aluno) {
      const { rows: alunoAtualizado } = await UsuarioModel.atualizarAluno(id, {
        objetivo: aluno.objetivo,
        nivel: aluno.nivel,
        deficiencia: aluno.deficiencia,
        restricaoMedica: aluno.restricao_medica,
        idInstrutor: aluno.id_instrutor ?? null,
      });
      if (alunoAtualizado[0]?.status === "pendente") {
        await AuthModel.revogarSessoesDoUsuario(Number(id));
      }
    }

    res.json({
      id_usuario: Number(id),
      atualizado: true,
      ...(emailVerificationRequired ? { email_verification_required: true } : {}),
    });
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

    const { rows } = await UsuarioModel.existePorId(id);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    await client.query("BEGIN");
    await UsuarioModel.excluirPorId(client, id);
    await client.query("COMMIT");

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

    const { rows } = await UsuarioModel.buscarIdPorUsuarioId(req.user!.id_usuario);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const id_usuario = rows[0].id;

    const nomeArquivo = nomeArquivoSeguro(req.file.originalname);
    const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
    const pastaFotos = path.join(uploadDir, "fotos", String(id_usuario));
    await mkdir(pastaFotos, { recursive: true });
    await writeFile(path.join(pastaFotos, nomeArquivo), req.file.buffer);
    const baseUrl = (process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, "");
    const foto_url = `${baseUrl}/uploads/fotos/${id_usuario}/${nomeArquivo}`;

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

    if (!isAdmin && !isInstrutor) {
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

    const { rows: instAtualRows } =
      await UsuarioModel.buscarInstrutorDoAluno(id);
    const instrutorAtual = instAtualRows[0]?.id_instrutor ?? null;
    let id_instrutor: number | null;

    if (isInstrutor) {
      if (instrutorAtual === null) {
        id_instrutor = req.user!.id_usuario;
      } else if (instrutorAtual === req.user!.id_usuario) {
        id_instrutor = req.body.id_instrutor === null ? null : instrutorAtual;
      } else {
        res.status(403).json({
          erro: "Só o admin pode reassociar aluno de outro instrutor.",
          codigo: "SEM_PERMISSAO",
        });
        return;
      }
    } else {
      if (!("id_instrutor" in req.body)) {
        res.status(400).json({
          erro: "id_instrutor é obrigatório no body.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
        return;
      }
      id_instrutor = req.body.id_instrutor ?? null;
      if (
        id_instrutor !== null &&
        (!Number.isSafeInteger(id_instrutor) || id_instrutor <= 0)
      ) {
        res.status(422).json({
          erro: "id_instrutor inválido.",
          codigo: "ID_INSTRUTOR_INVALIDO",
        });
        return;
      }
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

    const estaTrocando = instrutorAtual !== id_instrutor;

    await client.query("BEGIN");

    if (estaTrocando) {
      await UsuarioModel.inativarTreinosDoAluno(client, id);
    }

    const { rows } = await UsuarioModel.atualizarInstrutorDoAluno(
      client,
      id,
      id_instrutor,
      isInstrutor,
      req.user!.id_usuario,
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res.status(409).json({
        erro: "O vínculo mudou durante a operação; atualize os dados e tente novamente.",
        codigo: "VINCULO_ALTERADO",
      });
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
    if (req.user!.perfil === "instrutor") {
      const alunoDoInstrutor = await UsuarioModel.verificarInstrutorDoAluno(
        id,
        req.user!.id_usuario,
      );
      if (alunoDoInstrutor.rows.length === 0) {
        res.status(403).json({
          erro: "Instrutor só pode remover treinos dos próprios alunos.",
          codigo: "SEM_PERMISSAO",
        });
        return;
      }
    }
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
