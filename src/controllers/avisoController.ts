import { Request, Response, NextFunction } from "express";
import * as AvisoModel from "../models/avisoModel";

// GET /avisos (aluno)
export async function listarAvisosAluno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await AvisoModel.listar();
    res.json({
      dados: rows.map((r) => ({
        id_aviso: r.id_aviso,
        titulo: r.titulo,
        mensagem: r.mensagem,
        publicado_em: r.publicado_em,
        autor: { nome: r.autor_nome, foto_url: r.autor_foto_url },
      })),
    });
  } catch (err) {
    next(err);
  }
}

// GET /avisos/dashboard (admin/instrutor/recepcionista)
export async function listarAvisosDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await AvisoModel.listar();
    res.json({
      dados: rows.map((r) => ({
        id_aviso: r.id_aviso,
        titulo: r.titulo,
        mensagem: r.mensagem,
        publicado_em: r.publicado_em,
        autor: { nome: r.autor_nome, foto_url: r.autor_foto_url },
      })),
    });
  } catch (err) {
    next(err);
  }
}

// POST /avisos
export async function criarAviso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { titulo, mensagem } = req.body;
    if (!titulo || !mensagem) {
      res.status(400).json({ erro: "titulo e mensagem são obrigatórios.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }

    const { rows: uRows } = await AvisoModel.buscarIdPorAuthId(req.user!.id);
    const id_autor = uRows[0]?.id;
    if (!id_autor) {
      res.status(404).json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows } = await AvisoModel.inserir(titulo, mensagem, id_autor);
    res.status(201).json({ id_aviso: rows[0].id, publicado_em: rows[0].criado_em });
  } catch (err) {
    next(err);
  }
}

// PUT /avisos/:id_aviso
export async function editarAviso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aviso } = req.params;
    const { titulo, mensagem } = req.body;
    if (!titulo || !mensagem) {
      res.status(400).json({ erro: "titulo e mensagem são obrigatórios.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }

    const { rows } = await AvisoModel.atualizar(id_aviso, titulo, mensagem);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Aviso não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ id_aviso: Number(id_aviso), atualizado: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /avisos/:id_aviso
export async function excluirAviso(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aviso } = req.params;
    const { rows } = await AvisoModel.excluir(id_aviso);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Aviso não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ excluido: true });
  } catch (err) {
    next(err);
  }
}
