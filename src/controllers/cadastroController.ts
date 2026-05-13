import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import { supabaseAdmin } from "../config/supabase";
import * as CadastroModel from "../models/cadastroModel";
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
      res
        .status(400)
        .json({
          erro: "Campos obrigatórios ausentes.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }
    const nomeTrimmed = nome.trim();
    if (nomeTrimmed.length < 3) {
      res
        .status(422)
        .json({
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

    const deficienciaVal = (deficiencia || "nenhuma")
      .toLowerCase()
      .replace(/\s+/g, "_") as any;
    const restricaoVal = (restricao_medica || "nenhuma")
      .toLowerCase()
      .replace(/\s+/g, "_") as any;

    if (!DEFICIENCIAS_VALIDAS.includes(deficienciaVal)) {
      res
        .status(422)
        .json({
          erro: "Valor de deficiência inválido.",
          codigo: "ENUM_INVALIDO",
        });
      return;
    }
    if (!RESTRICOES_VALIDAS.includes(restricaoVal)) {
      res
        .status(422)
        .json({
          erro: "Valor de restrição médica inválido.",
          codigo: "ENUM_INVALIDO",
        });
      return;
    }

    const duplicado = await CadastroModel.verificarDuplicado(
      email,
      cpf.replace(/\D/g, ""),
    );
    if (duplicado.rows.length > 0) {
      res
        .status(409)
        .json({ erro: "CPF ou e-mail já cadastrado.", codigo: "DUPLICADO" });
      return;
    }

    const { data: authData, error: authError } =
      await CadastroModel.criarNoAuth(email, senha);
    if (authError || !authData.user) {
      res
        .status(500)
        .json({ erro: "Erro ao criar credenciais.", codigo: "ERRO_AUTH" });
      return;
    }

    // RN12: status pendente se tiver restrição médica ou deficiência
    const temRestricao =
      deficienciaVal !== "nenhuma" || restricaoVal !== "nenhuma";
    const status = temRestricao ? "pendente" : "ativo";

    await client.query("BEGIN");

    const { rows } = await CadastroModel.inserirUsuario(client, {
      authId: authData.user.id,
      nome: nomeTrimmed,
      cpf: cpf.replace(/\D/g, ""),
      email,
      sexo,
    });
    const id_usuario = rows[0].id;

    await CadastroModel.inserirAluno(client, {
      idUsuario: id_usuario,
      deficiencia: deficienciaVal,
      restricaoMedica: restricaoVal,
      objetivo,
      nivel,
      status,
    });

    await client.query("COMMIT");
    res
      .status(201)
      .json({ id_aluno: id_usuario, status, requer_documento: temRestricao });
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

    const { rows } = await CadastroModel.buscarAlunoPendente(id_aluno);
    if (rows.length === 0) {
      res
        .status(404)
        .json({
          erro: "Aluno pendente não encontrado.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }

    // Só aceita laudo se o aluno de fato declarou restrição/deficiência
    if (!rows[0].tem_restricao) {
      res
        .status(422)
        .json({
          erro: "Aluno não declarou restrição médica ou deficiência.",
          codigo: "SEM_RESTRICAO",
        });
      return;
    }

    const bucket = process.env.STORAGE_BUCKET_LAUDOS ?? "laudos";
    const nomeArquivo = nomeArquivoSeguro(req.file.originalname);
    const caminho = `laudos/${id_aluno}/${nomeArquivo}`;

    const { error: storageError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(caminho, req.file.buffer, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (storageError) {
      res
        .status(500)
        .json({ erro: "Erro ao armazenar arquivo.", codigo: "STORAGE_ERRO" });
      return;
    }

    const { rows: docRows } = await CadastroModel.inserirDocumento(
      id_aluno,
      caminho,
      nomeArquivo,
    );
    res.status(201).json({ id_documento: docRows[0].id, status: "pendente" });
  } catch (err) {
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
      porPagina,
      offset,
    });
    const total = rows.length > 0 ? Number(rows[0].total) : 0;

    res.json({
      dados: rows.map((r) => ({
        id_aluno: r.id_aluno,
        nome: r.nome,
        cpf: r.cpf,
        documento: r.id_documento
          ? {
              id_documento: r.id_documento,
              caminho_arquivo: r.caminho_arquivo,
              nome_arquivo: r.nome_arquivo,
            }
          : null,
        enviado_em: r.enviado_em,
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
    const { rows } = await CadastroModel.aprovar(id_aluno);
    if (rows.length === 0) {
      res
        .status(404)
        .json({
          erro: "Cadastro pendente não encontrado.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }
    await CadastroModel.aprovarDocumentos(id_aluno);
    res.json({ id_aluno: Number(id_aluno), status: "ativo" });
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
      res
        .status(400)
        .json({
          erro: "motivo_rejeicao obrigatório.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    const { rows } = await CadastroModel.rejeitar(id_aluno);
    if (rows.length === 0) {
      res
        .status(404)
        .json({
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
