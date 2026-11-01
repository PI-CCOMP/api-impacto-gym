import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import pool from "../config/database";
import * as CadastroModel from "../models/cadastroModel";
import { enviarEmail } from "../services/email";
import { laudoRejeitadoEmail } from "../services/emailTemplates";
import { enviarCodigoVerificacaoCadastro } from "../services/emailVerification";
import {
  validarSenha,
  validarEmail,
  validarCpf,
  nomeArquivoSeguro,
} from "../utils/validate";
import {
  SEXOS_VALIDOS,
  OBJETIVOS_VALIDOS,
  NIVEIS_VALIDOS,
  DEFICIENCIAS_VALIDAS,
  RESTRICOES_VALIDAS,
} from "../types";
import { listaTemValor, normalizarListaEnum } from "../utils/enumList";

// POST /cadastros
export async function cadastrarAluno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const {
      nome,
      cpf,
      email,
      senha,
      sexo,
      deficiencia,
      restricao_medica,
      objetivo,
      nivel,
    } = req.body;

    if (!nome || !cpf || !email || !senha || !sexo || !objetivo || !nivel) {
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
      res.status(422).json({
        erro: "Senha fraca. Use no mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.",
        codigo: "SENHA_FRACA",
      });
      return;
    }
    if (!SEXOS_VALIDOS.includes(sexo)) {
      res
        .status(422)
        .json({ erro: "Valor de sexo inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }
    if (!OBJETIVOS_VALIDOS.includes(objetivo)) {
      res
        .status(422)
        .json({ erro: "Valor de objetivo inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }
    if (!NIVEIS_VALIDOS.includes(nivel)) {
      res
        .status(422)
        .json({ erro: "Valor de nível inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const deficienciaVal = normalizarListaEnum(
      deficiencia,
      DEFICIENCIAS_VALIDAS,
      "nenhuma",
    );
    const restricaoVal = normalizarListaEnum(
      restricao_medica,
      RESTRICOES_VALIDAS,
      "nenhuma",
    );

    if (!deficienciaVal) {
      res.status(422).json({
        erro: "Valor de deficiência inválido.",
        codigo: "ENUM_INVALIDO",
      });
      return;
    }
    if (!restricaoVal) {
      res.status(422).json({
        erro: "Valor de restrição médica inválido.",
        codigo: "ENUM_INVALIDO",
      });
      return;
    }

    const duplicado = await CadastroModel.verificarDuplicado(
      emailNormalizado,
      cpf.replace(/\D/g, ""),
    );
    if (duplicado.rows.length > 0) {
      res
        .status(409)
        .json({ erro: "CPF ou e-mail já cadastrado.", codigo: "DUPLICADO" });
      return;
    }

    const temRestricao =
      listaTemValor(deficienciaVal, "nenhuma") ||
      listaTemValor(restricaoVal, "nenhuma");
    const status = "pendente";

    await client.query("BEGIN");

    const { rows } = await CadastroModel.inserirUsuario(client, {
      nome: nomeTrimmed,
      cpf: cpf.replace(/\D/g, ""),
      email: emailNormalizado,
      senhaHash: await bcrypt.hash(senha, 12),
      sexo,
    });
    const id_usuario = rows[0].id;

    const { rows: alunoRows } = await CadastroModel.inserirAluno(client, {
      idUsuario: id_usuario,
      deficiencia: deficienciaVal,
      restricaoMedica: restricaoVal,
      objetivo,
      nivel,
      status,
    });

    await client.query("COMMIT");
    try {
      const enviado = await enviarCodigoVerificacaoCadastro(id_usuario, emailNormalizado);
      if (!enviado) {
        res.status(429).json({
          erro: "Aguarde antes de solicitar outro código para este endereço.",
          codigo: "EMAIL_COOLDOWN",
          id_aluno: id_usuario,
          email_verification_required: true,
        });
        return;
      }
    } catch {
      res.status(503).json({
        erro: "Cadastro criado, mas não foi possível enviar o código. Solicite novo envio.",
        codigo: "EMAIL_ENVIO_FALHOU",
        id_aluno: id_usuario,
        email_verification_required: true,
      });
      return;
    }
    res.status(201).json({
      id_aluno: id_usuario,
      status,
      requer_documento: temRestricao,
      prazo_envio_laudo: alunoRows[0].prazo_envio_laudo,
      email_verification_required: true,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// POST /cadastros/:id_aluno/documento
export async function uploadDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno } = req.params;
    if (!req.file) {
      res
        .status(400)
        .json({ erro: "Arquivo PDF obrigatório.", codigo: "ARQUIVO_AUSENTE" });
      return;
    }
    if (req.file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      res.status(422).json({
        erro: "O conteúdo enviado não é um arquivo PDF válido.",
        codigo: "ARQUIVO_INVALIDO",
      });
      return;
    }

    const { rows } = await CadastroModel.buscarAlunoParaUpload(id_aluno);
    if (rows.length === 0) {
      res.status(404).json({
        erro: "Aluno ou revisão médica não encontrados.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }

    // Só aceita laudo se o aluno de fato declarou restrição/deficiência
    if (!rows[0].tem_restricao) {
      res.status(422).json({
        erro: "Aluno não declarou restrição médica ou deficiência.",
        codigo: "SEM_RESTRICAO",
      });
      return;
    }
    if (
      rows[0].tem_documento_pendente ||
      (rows[0].status === "pendente" && rows[0].tem_documento_aprovado)
    ) {
      res.status(409).json({
        erro: "Já existe um laudo aguardando análise ou este cadastro já tem laudo aprovado.",
        codigo: "DOCUMENTO_JA_ENVIADO",
      });
      return;
    }

    const nomeArquivo = nomeArquivoSeguro(req.file.originalname);
    const pastaLaudos = path.resolve(process.env.UPLOAD_DIR ?? "uploads", "laudos", id_aluno);
    const caminho = path.join("laudos", id_aluno, nomeArquivo);
    const arquivoDestino = path.join(pastaLaudos, nomeArquivo);
    await mkdir(pastaLaudos, { recursive: true });
    await writeFile(arquivoDestino, req.file.buffer, { flag: "wx" });

    let idDocumento: number | string;
    try {
      const resultado = await CadastroModel.inserirDocumento(
        id_aluno,
        caminho,
        nomeArquivo,
      );
      if (resultado.rows.length === 0) {
        await rm(arquivoDestino, { force: true });
        if (resultado.erro === "SEM_RESTRICAO") {
          res.status(422).json({
            erro: "Aluno não declarou restrição médica ou deficiência.",
            codigo: "SEM_RESTRICAO",
          });
        } else if (resultado.erro === "DOCUMENTO_JA_ENVIADO") {
          res.status(409).json({
            erro: "Já existe um laudo aguardando análise ou este cadastro já tem laudo aprovado.",
            codigo: "DOCUMENTO_JA_ENVIADO",
          });
        } else {
          res.status(403).json({
            erro: "Não há laudo pendente para esta conta.",
            codigo: "UPLOAD_NAO_DISPONIVEL",
          });
        }
        return;
      }
      idDocumento = resultado.rows[0].id;
    } catch (error) {
      await rm(arquivoDestino, { force: true });
      throw error;
    }
    res.status(201).json({ id_documento: idDocumento, status: "pendente" });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(409).json({
        erro: "Já existe um laudo aguardando análise.",
        codigo: "DOCUMENTO_JA_ENVIADO",
      });
      return;
    }
    next(err);
  }
}

// GET /cadastros
export async function listarCadastros(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const status = (req.query.status as string) || "pendente";
    if (!["pendente", "revisao_medica", "ativo", "rejeitado", "inativo"].includes(status)) {
      res.status(422).json({ erro: "Status de cadastro inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }
    const busca = (req.query.busca as string) || "";
    const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
    const porPagina = Math.min(
      50,
      parseInt(req.query.por_pagina as string) || 10,
    );
    const offset = (pagina - 1) * porPagina;

    const { rows } = await CadastroModel.listar({
      status,
      busca,
      isInstrutor: req.user!.perfil === "instrutor",
      instrutorId: req.user!.id_usuario,
      porPagina,
      offset,
    });
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    const isAdmin = req.user!.perfil === "admin";

    res.json({
      dados: rows.map((r) => ({
        id_aluno: r.id_aluno,
        nome: r.nome,
        documento: r.id_documento
          ? {
              id_documento: r.id_documento,
              nome_arquivo: r.nome_arquivo,
              status: r.status_documento,
              motivo_rejeicao: r.motivo_rejeicao,
            }
          : null,
        cadastrado_em: r.cadastrado_em,
        email_verificado: r.email_verificado,
        deficiencia: r.deficiencia,
        restricao_medica: r.restricao_medica,
        prazo_envio_laudo: r.prazo_envio_laudo,
        revisao_medica_pendente: r.revisao_medica_pendente,
        prazo_revisao_medica: r.prazo_revisao_medica,
        prazo_laudo_expirado:
          (r.revisao_medica_pendente &&
            r.prazo_revisao_medica &&
            new Date(r.prazo_revisao_medica).getTime() <= Date.now()) ||
          (r.status === "pendente" &&
            (r.deficiencia.some((valor: string) => valor !== "nenhuma") ||
              r.restricao_medica.some((valor: string) => valor !== "nenhuma")) &&
            (!r.id_documento ||
              r.status_documento === "rejeitado" ||
              r.status_documento === "cancelado") &&
            new Date(r.prazo_envio_laudo).getTime() <= Date.now()),
        ...(isAdmin ? { cpf: r.cpf, email: r.email } : {}),
      })),
      total,
      pagina,
      por_pagina: porPagina,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /cadastros/:id_aluno/aprovar
export async function aprovarCadastro(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno } = req.params;

    // Busca aluno pendente com info de restrição e documento
    const { rows: alunoRows } =
      await CadastroModel.buscarAlunoPendenteParaAprovar(id_aluno);

    if (alunoRows.length === 0) {
      res.status(404).json({
        erro: "Cadastro pendente não encontrado.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }

    const aluno = alunoRows[0];

    if (!aluno.email_verificado) {
      res.status(422).json({
        erro: "O aluno precisa confirmar o e-mail antes da aprovação.",
        codigo: "EMAIL_NAO_VERIFICADO",
      });
      return;
    }

    // Se tem restrição, exige documento PDF aprovado (ou pendente)
    if (aluno.tem_restricao && !aluno.tem_documento_aprovado) {
      res.status(422).json({
        erro: "A documentação comprobatória precisa ser aprovada antes do cadastro.",
        codigo: "DOCUMENTO_NAO_APROVADO",
      });
      return;
    }

    const { rows } = await CadastroModel.aprovar(id_aluno);
    if (rows.length === 0) {
      res.status(404).json({
        erro: "Cadastro pendente não encontrado.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }

    res.json({ id_aluno: Number(id_aluno), status: "ativo" });
  } catch (err) {
    next(err);
  }
}

export async function verDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno, id_documento } = req.params;
    const { rows } = await CadastroModel.buscarDocumento(id_aluno, id_documento);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Documento não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const pastaUploads = path.resolve(process.env.UPLOAD_DIR ?? "uploads");
    const arquivo = path.resolve(pastaUploads, rows[0].caminho_arquivo);
    if (!arquivo.startsWith(`${pastaUploads}${path.sep}`)) {
      res.status(400).json({ erro: "Caminho de arquivo inválido.", codigo: "ARQUIVO_INVALIDO" });
      return;
    }
    res.sendFile(arquivo, { headers: { "Content-Type": "application/pdf" } }, (err) => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
}

export async function aprovarDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno, id_documento } = req.params;
    const { rows } = await CadastroModel.aprovarDocumento(id_aluno, id_documento);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Documento pendente não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ id_documento: Number(id_documento), status: "aprovado" });
  } catch (err) {
    next(err);
  }
}

export async function rejeitarDocumento(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno, id_documento } = req.params;
    const { motivo_rejeicao } = req.body;
    if (typeof motivo_rejeicao !== "string" || !motivo_rejeicao.trim()) {
      res.status(400).json({ erro: "motivo_rejeicao obrigatório.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }
    const { rows: documento } = await CadastroModel.buscarDocumento(id_aluno, id_documento);
    if (documento.length === 0 || documento[0].status !== "pendente") {
      res.status(404).json({ erro: "Documento pendente não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    const { rows } = await CadastroModel.rejeitarDocumento(
      id_aluno,
      id_documento,
      motivo_rejeicao.trim(),
    );
    if (rows.length === 0) {
      res.status(404).json({ erro: "Documento pendente não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    let notificacaoEnviada = true;
    try {
      await enviarEmail(
        documento[0].email,
        laudoRejeitadoEmail(motivo_rejeicao.trim(), {
          pendente: documento[0].revisao_medica_pendente,
          prazo: documento[0].prazo_revisao_medica,
        }),
      );
    } catch {
      notificacaoEnviada = false;
    }
    res.json({
      id_documento: Number(id_documento),
      status: "rejeitado",
      notificacao_enviada: notificacaoEnviada,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /cadastros/:id_aluno/rejeitar
export async function rejeitarCadastro(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno } = req.params;
    const { motivo_rejeicao } = req.body;

    if (!motivo_rejeicao) {
      res.status(400).json({
        erro: "motivo_rejeicao obrigatório.",
        codigo: "CAMPOS_OBRIGATORIOS",
      });
      return;
    }

    const { rows } = await CadastroModel.rejeitar(id_aluno);
    if (rows.length === 0) {
      res.status(404).json({
        erro: "Cadastro pendente não encontrado.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }
    await CadastroModel.rejeitarDocumentos(id_aluno, motivo_rejeicao);
    res.json({ id_aluno: Number(id_aluno), status: "rejeitado" });
  } catch (err) {
    next(err);
  }
}
