import { Request, Response, NextFunction } from "express";
import * as SolicitacaoModel from "../models/solicitacaoModel";

// POST /solicitacoes-auxilio
export async function criarSolicitacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno_treino_exercicio, id_instrutor } = req.body;
    if (!id_aluno_treino_exercicio) {
      res.status(400).json({ erro: "id_aluno_treino_exercicio obrigatório.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }

    const { rows: uRows } = await SolicitacaoModel.buscarIdPorAuthId(req.user!.id);
    const id_aluno = uRows[0]?.id;

    const { rows } = await SolicitacaoModel.inserir({
      idAluno: id_aluno,
      idAluno_treinoExercicio: id_aluno_treino_exercicio,
      idInstrutor: id_instrutor ?? null,
    });
    res.status(201).json({ id_solicitacao: rows[0].id, status: "aberto" });
  } catch (err) {
    next(err);
  }
}

// GET /solicitacoes-auxilio/minhas (aluno)
export async function minhasSolicitacoes(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows: uRows } = await SolicitacaoModel.buscarIdPorAuthId(req.user!.id);
    const id_aluno = uRows[0]?.id;

    const { rows } = await SolicitacaoModel.listarDoAluno(id_aluno);
    res.json({ dados: rows });
  } catch (err) {
    next(err);
  }
}

// PATCH /solicitacoes-auxilio/:id_solicitacao/cancelar (aluno)
export async function cancelarSolicitacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_solicitacao } = req.params;
    const { rows: uRows } = await SolicitacaoModel.buscarIdPorAuthId(req.user!.id);
    const id_aluno = uRows[0]?.id;

    const { rows } = await SolicitacaoModel.cancelar(id_solicitacao, id_aluno);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Solicitação aberta não encontrada.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ id_solicitacao: Number(id_solicitacao), status: "cancelado" });
  } catch (err) {
    next(err);
  }
}

// GET /solicitacoes-auxilio/dashboard (admin/instrutor)
export async function solicitacoesDashboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows } = await SolicitacaoModel.listarAbertas();
    res.json({
      dados: rows.map((r) => ({
        id_solicitacao: r.id_solicitacao,
        aluno: { nome: r.aluno_nome, foto_url: r.aluno_foto_url },
        nome_exercicio: r.nome_exercicio,
        status: r.status,
        solicitado_em: r.solicitado_em,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /solicitacoes-auxilio/:id_solicitacao/atender
export async function atenderSolicitacao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_solicitacao } = req.params;
    const { rows: uRows } = await SolicitacaoModel.buscarIdPorAuthId(req.user!.id);
    const id_instrutor = uRows[0]?.id;

    // RN27: instrutor assume; evita atendimentos duplicados
    const { rows } = await SolicitacaoModel.atender(id_solicitacao, id_instrutor);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Solicitação aberta não encontrada.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ id_solicitacao: Number(id_solicitacao), status: "atendido" });
  } catch (err) {
    next(err);
  }
}
