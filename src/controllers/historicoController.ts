import { Request, Response, NextFunction } from "express";
import * as HistoricoModel from "../models/historicoModel";

// GET /historico/meu
export async function meuHistorico(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id_usuario = req.user!.id_usuario;
    if (!id_usuario) {
      res.status(404).json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows } = await HistoricoModel.listarUltimos30Dias(id_usuario);
    res.json({ dados: rows });
  } catch (err) {
    next(err);
  }
}

// GET /historico/meu/:id_historico
export async function detalheHistorico(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_historico } = req.params;
    const id_usuario = req.user!.id_usuario;

    const { rows } = await HistoricoModel.buscarDetalhe(id_historico, id_usuario);
    if (rows.length === 0) {
      res.status(404).json({ erro: "Histórico não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows: exRows } = await HistoricoModel.buscarExerciciosDoHistorico(id_historico);
    res.json({ ...rows[0], exercicios: exRows });
  } catch (err) {
    next(err);
  }
}
