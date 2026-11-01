import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import pool from "../config/database";
import * as AuthModel from "../models/authModel";
import * as UsuarioModel from "../models/usuarioModel";
import {
  enviarCodigoAlteracaoEmail,
  enviarConviteConta,
} from "../services/emailVerification";
import {
  laudoPendenteAtualizadoEmail,
  laudoSolicitadoEmail,
} from "../services/emailTemplates";
import { enviarEmail } from "../services/email";
import {
  armazenarFotoPerfil,
  obterFotoPerfil,
  urlFotoPerfil,
} from "../services/photoStorage";

import { validarEmail, validarCpf } from "../utils/validate";
import {
  PERFIS_VALIDOS,
  SEXOS_VALIDOS,
  OBJETIVOS_VALIDOS,
  NIVEIS_VALIDOS,
  DEFICIENCIAS_VALIDAS,
  RESTRICOES_VALIDAS,
} from "../types";
import { normalizarListaEnum } from "../utils/enumList";

function fotoUrlProtegidaDoUsuario(valor: unknown, idUsuario: string): boolean {
  if (typeof valor !== "string") return false;
  try {
    return new URL(valor, "http://localhost").pathname ===
      `/usuarios/fotos/${idUsuario}`;
  } catch {
    return false;
  }
}

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
    const isRecepcionista = req.user!.perfil === "recepcionista";
    res.json({
      dados: rows.map((r) => ({
        id_usuario: r.id_usuario,
        nome: r.nome,
        perfil: r.perfil,
        status: r.status ?? null,
        ...(isAdmin ||
        isInstrutor ||
        (isRecepcionista &&
          (r.status === "pendente" || r.revisao_medica_pendente))
          ? {
              deficiencia: r.deficiencia ?? null,
              restricao_medica: r.restricao_medica ?? null,
            }
          : {}),
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
    const { rows } = await UsuarioModel.buscarPorUsuarioId(
      req.user!.id_usuario,
    );
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const u = rows[0];
    res.json({
      ...u,
      foto_url: urlFotoPerfil(u.id_usuario, u.foto_url),
      permissoes: resolverPermissoes(u.perfil),
    });
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
        "gerenciar_treinos",
        "ver_solicitacoes",
      ];
    case "recepcionista":
      return [
        "ver_aluno",
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
    const podeVerDadosMedicos =
      req.user!.perfil === "admin" ||
      (req.user!.perfil === "instrutor" &&
        r.id_instrutor === req.user!.id_usuario) ||
      (req.user!.perfil === "recepcionista" &&
        (r.status === "pendente" || r.revisao_medica_pendente));

    res.json({
      id_usuario: r.id_usuario,
      nome: r.nome,
      foto_url: urlFotoPerfil(r.id_usuario, r.foto_url),
      perfil: r.perfil,
      ...dadosPessoais,
      // [CORRIGIDO] id_aluno removido — usar id_usuario como identificador único
      aluno: r.nivel
        ? {
            id_aluno: r.id_usuario,
            nivel: r.nivel,
            objetivo: r.objetivo,
            ...(podeVerDadosMedicos
              ? {
                  deficiencia: r.deficiencia,
                  restricao_medica: r.restricao_medica,
                }
              : {}),
            status: r.status,
            prazo_envio_laudo: r.prazo_envio_laudo,
            revisao_medica_pendente: r.revisao_medica_pendente,
            prazo_revisao_medica: r.prazo_revisao_medica,
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
    // MUDOU: "senha" saiu do body
    const { nome, cpf, email, sexo, perfil, foto_url, aluno } = req.body;

    if (foto_url) {
      res.status(422).json({
        erro: "Envie fotos pelo endpoint de upload autenticado.",
        codigo: "UPLOAD_FOTO_NECESSARIO",
      });
      return;
    }

    // MUDOU: "!senha" saiu da condição
    if (!nome || !cpf || !email || !sexo || !perfil) {
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
    const deficienciaAluno = normalizarListaEnum(
      aluno?.deficiencia,
      DEFICIENCIAS_VALIDAS,
      "nenhuma",
    );
    const restricaoAluno = normalizarListaEnum(
      aluno?.restricao_medica,
      RESTRICOES_VALIDAS,
      "nenhuma",
    );
    if (
      perfil === "aluno" &&
      (!deficienciaAluno || !restricaoAluno)
    ) {
      res.status(422).json({
        erro: "Restrição ou deficiência inválida.",
        codigo: "ENUM_INVALIDO",
      });
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
      // MUDOU: senha_hash é NOT NULL, então grava o hash de um segredo
      // aleatório que ninguém conhece. A senha real só nasce quando o
      // usuário usa o código do convite (POST /auth/redefinir-senha).
      senhaHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      sexo,
      perfil,
      fotoUrl: null,
    });
    const id_usuario = rows[0].id;
    let prazoEnvioLaudo: Date | string | undefined;

    if (perfil === "aluno" && aluno) {
      const { rows: alunoRows } = await UsuarioModel.inserirAluno(client, {
        idUsuario: id_usuario,
        objetivo: aluno.objetivo,
        nivel: aluno.nivel,
        deficiencia: deficienciaAluno ?? ["nenhuma"],
        restricaoMedica: restricaoAluno ?? ["nenhuma"],
        status: "pendente",
      });
      prazoEnvioLaudo = alunoRows[0].prazo_envio_laudo;
    }

    await client.query("COMMIT");

    // MUDOU: manda o convite (código para definir a senha) em vez do
    // código de verificação de cadastro.
    try {
      await enviarConviteConta(id_usuario, emailNormalizado, nomeTrimmed);
    } catch {
      res.status(503).json({
        erro: "Usuário criado, mas não foi possível enviar o convite. Peça ao usuário para usar “Esqueci minha senha”.",
        codigo: "EMAIL_ENVIO_FALHOU",
        id_usuario,
        convite_enviado: false,
      });
      return;
    }
    res.status(201).json({
      id_usuario,
      perfil,
      ...(perfil === "aluno" ? { status: "pendente" } : {}),
      ...(prazoEnvioLaudo ? { prazo_envio_laudo: prazoEnvioLaudo } : {}),
      // MUDOU: era email_verification_required: true
      convite_enviado: true,
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

    if (foto_url && !fotoUrlProtegidaDoUsuario(foto_url, id)) {
      res.status(422).json({
        erro: "Envie fotos pelo endpoint de upload autenticado.",
        codigo: "UPLOAD_FOTO_NECESSARIO",
      });
      return;
    }

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
    const emailNormalizado = email?.trim().toLowerCase();
    if (
      emailNormalizado &&
      !(await AuthModel.emailDisponivelParaUsuario(
        emailNormalizado,
        Number(id),
      ))
    ) {
      res.status(409).json({ erro: "E-mail já em uso.", codigo: "EMAIL_DUPLICADO" });
      return;
    }
    const deficienciaEditada =
      aluno?.deficiencia === undefined
        ? undefined
        : normalizarListaEnum(
            aluno.deficiencia,
            DEFICIENCIAS_VALIDAS,
            "nenhuma",
          );
    const restricaoEditada =
      aluno?.restricao_medica === undefined
        ? undefined
        : normalizarListaEnum(
            aluno.restricao_medica,
            RESTRICOES_VALIDAS,
            "nenhuma",
          );
    if (
      (aluno?.deficiencia !== undefined && !deficienciaEditada) ||
      (aluno?.restricao_medica !== undefined && !restricaoEditada)
    ) {
      res.status(422).json({
        erro: "Lista de deficiência ou restrição inválida.",
        codigo: "ENUM_INVALIDO",
      });
      return;
    }

    const { rows: atualizados } = await UsuarioModel.atualizar(id, {
      nome,
      email: emailNormalizado,
      sexo,
      perfil,
      fotoUrl: undefined,
    });
    if (atualizados.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const emailVerificationRequired =
      Boolean(emailNormalizado && atualizados[0].email_pendente);
    if (emailVerificationRequired) {
      try {
        const enviado = await enviarCodigoAlteracaoEmail(
          Number(id),
          atualizados[0].email_pendente,
        );
        if (!enviado) {
          res.status(429).json({
            erro: "Aguarde antes de solicitar outro código.",
            codigo: "EMAIL_COOLDOWN",
            email_verification_required: true,
          });
          return;
        }
      } catch {
        res.status(503).json({
          erro: "O endereço atual foi mantido, mas não foi possível enviar o código. Solicite novo envio.",
          codigo: "EMAIL_ENVIO_FALHOU",
          email_verification_required: true,
        });
        return;
      }
    }

    let revisaoMedicaPrazo: Date | null | undefined;
    let prazoEnvioLaudo: Date | undefined;
    let laudoPendenteNecessario = false;
    if (aluno) {
      const {
        rows: alunoAtualizado,
        revisaoIniciada,
        laudoPendenteInvalidado,
        laudoPendenteNecessario: laudoNecessario,
      } =
        await UsuarioModel.atualizarAluno(id, {
          objetivo: aluno.objetivo,
          nivel: aluno.nivel,
          deficiencia: deficienciaEditada ?? undefined,
          restricaoMedica: restricaoEditada ?? undefined,
          idInstrutor: aluno.id_instrutor ?? null,
          atualizarInstrutor: Object.prototype.hasOwnProperty.call(
            aluno,
            "id_instrutor",
          ),
        });
      revisaoMedicaPrazo = alunoAtualizado[0]?.prazo_revisao_medica;
      prazoEnvioLaudo = alunoAtualizado[0]?.prazo_envio_laudo;
      laudoPendenteNecessario = laudoNecessario;
      if (laudoPendenteNecessario && prazoEnvioLaudo) {
        try {
          await enviarEmail(
            atualizados[0].email,
            laudoPendenteAtualizadoEmail(
              prazoEnvioLaudo,
              laudoPendenteInvalidado,
            ),
          );
        } catch {
          res.status(503).json({
            erro: "Dados atualizados, mas não foi possível avisar que o laudo precisa ser reenviado.",
            codigo: "EMAIL_ENVIO_FALHOU",
            laudo_reenvio_necessario: true,
            prazo_envio_laudo: prazoEnvioLaudo,
          });
          return;
        }
      }
      if (revisaoIniciada && revisaoMedicaPrazo) {
        try {
          await enviarEmail(
            atualizados[0].email,
            laudoSolicitadoEmail(revisaoMedicaPrazo),
          );
        } catch {
          res.status(503).json({
            erro: "Dados atualizados, mas não foi possível enviar o aviso de revisão médica.",
            codigo: "EMAIL_ENVIO_FALHOU",
            revisao_medica_pendente: true,
            prazo_revisao_medica: revisaoMedicaPrazo,
          });
          return;
        }
      }
    }

    res.json({
      id_usuario: Number(id),
      atualizado: true,
      ...(revisaoMedicaPrazo
        ? {
            revisao_medica_pendente: true,
            prazo_revisao_medica: revisaoMedicaPrazo,
          }
        : {}),
      ...(laudoPendenteNecessario && prazoEnvioLaudo
        ? {
            laudo_reenvio_necessario: true,
            prazo_envio_laudo: prazoEnvioLaudo,
          }
        : {}),
      ...(emailVerificationRequired
        ? { email_verification_required: true }
        : {}),
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
    let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
    try {
      metadata = await sharp(req.file.buffer, { failOn: "error" }).metadata();
    } catch {
      res.status(422).json({
        erro: "O conteúdo enviado não é uma imagem válida.",
        codigo: "ARQUIVO_INVALIDO",
      });
      return;
    }
    const mimetypeFormato: Record<string, string> = {
      "image/jpeg": "jpeg",
      "image/png": "png",
      "image/webp": "webp",
    };
    if (
      !metadata.format ||
      mimetypeFormato[req.file.mimetype] !== metadata.format
    ) {
      res.status(422).json({
        erro: "O tipo informado não corresponde ao conteúdo da imagem.",
        codigo: "ARQUIVO_INVALIDO",
      });
      return;
    }

    const { rows } = await UsuarioModel.buscarIdPorUsuarioId(
      req.user!.id_usuario,
    );
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const id_usuario = rows[0].id;

    const conteudoOtimizado = await sharp(req.file.buffer)
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const foto_url = await armazenarFotoPerfil(id_usuario, conteudoOtimizado);

    await UsuarioModel.atualizarFoto(foto_url, id_usuario);
    res.json({ foto_url: urlFotoPerfil(id_usuario, foto_url) });
  } catch (err) {
    next(err);
  }
}

export async function servirFotoPerfil(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const idUsuario = Number(req.params.id_usuario);
    if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
      res.status(400).json({ erro: "ID de usuário inválido.", codigo: "ID_INVALIDO" });
      return;
    }
    const { rows } = await UsuarioModel.buscarPorUsuarioId(idUsuario);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Foto não encontrada.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const foto = await obterFotoPerfil(idUsuario, rows[0].foto_url);
    if (!foto) {
      res.status(404).json({ erro: "Foto não encontrada.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.type("image/webp").send(foto);
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
