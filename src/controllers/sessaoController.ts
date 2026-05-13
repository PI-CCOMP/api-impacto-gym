import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import * as SessaoModel from "../models/sessaoModel";

// POST /sessoes
export async function iniciarSessao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno_treino } = req.body;
    if (!id_aluno_treino) {
      res
        .status(400)
        .json({
          erro: "id_aluno_treino obrigatório.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    const id_usuario = await SessaoModel.buscarIdPorAuthId(req.user!.id);
    if (!id_usuario) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows: ativas } = await SessaoModel.verificarSessaoAtiva(id_usuario);
    if (ativas.length > 0) {
      res
        .status(409)
        .json({
          erro: "Já existe uma sessão de treino em andamento.",
          codigo: "SESSAO_ATIVA",
        });
      return;
    }

    const { rows: atRows } = await SessaoModel.verificarAluno_treinoDoAluno(
      id_aluno_treino,
      id_usuario,
    );
    if (atRows.length === 0) {
      res
        .status(404)
        .json({ erro: "Treino não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows } = await SessaoModel.iniciar(id_usuario, id_aluno_treino);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// GET /sessoes/ativa
export async function sessaoAtiva(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id_usuario = await SessaoModel.buscarIdPorAuthId(req.user!.id);
    if (!id_usuario) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows } = await SessaoModel.buscarAtiva(id_usuario);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Nenhuma sessão ativa.", codigo: "SEM_SESSAO_ATIVA" });
      return;
    }

    const sessao = rows[0];
    const { rows: seriesRows } = await SessaoModel.buscarSeriesDaSessao(
      sessao.id_sessao,
    );
    res.json({ ...sessao, series_marcadas: seriesRows });
  } catch (err) {
    next(err);
  }
}

// POST /sessoes/:id_sessao/series
export async function registrarSerie(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_sessao } = req.params;
    const idSessao = Number(id_sessao);
    const { id_aluno_treino_exercicio, numero_serie, carga_real } = req.body;

    if (
      !id_aluno_treino_exercicio ||
      numero_serie === undefined ||
      carga_real === undefined
    ) {
      res
        .status(400)
        .json({
          erro: "Campos obrigatórios ausentes.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    const id_usuario = await SessaoModel.buscarIdPorAuthId(req.user!.id);

    const { rows: sRows } = await SessaoModel.verificarSessaoDoAluno(
      idSessao,
      id_usuario!,
    );
    if (sRows.length === 0) {
      res
        .status(404)
        .json({
          erro: "Sessão ativa não encontrada.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }

    await SessaoModel.registrarSerie({
      idSessao,
      idAluno_treinoExercicio: id_aluno_treino_exercicio,
      numeroSerie: numero_serie,
      cargaReal: carga_real,
    });

    // RN20: salva carga_real como referência para próximos treinos
    await SessaoModel.atualizarCargaReal(carga_real, id_aluno_treino_exercicio);

    res.json({ registrado: true });
  } catch (err) {
    next(err);
  }
}

// PATCH /sessoes/:id_sessao/finalizar
export async function finalizarSessao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { id_sessao } = req.params;
    const { duracao_segundos, volume_total } = req.body;

    const id_usuario = await SessaoModel.buscarIdPorAuthId(req.user!.id);

    const { rows } = await SessaoModel.finalizar(id_sessao, id_usuario!);
    if (rows.length === 0) {
      res
        .status(404)
        .json({
          erro: "Sessão ativa não encontrada.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }

    await client.query("BEGIN");

    // RN23: registra histórico
    const { rows: histRows } = await SessaoModel.inserirHistorico(client, {
      idUsuario: id_usuario!,
      idAluno_treino: rows[0].id_aluno_treino,
      duracaoSegundos: duracao_segundos ?? 0,
      volumeTotal: volume_total ?? 0,
    });

    await client.query("COMMIT");
    res.json({ id_historico: histRows[0].id, status: "finalizado" });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// PATCH /sessoes/:id_sessao/abandonar
export async function abandonarSessao(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_sessao } = req.params;
    const id_usuario = await SessaoModel.buscarIdPorAuthId(req.user!.id);

    const { rows } = await SessaoModel.abandonar(id_sessao, id_usuario!);
    if (rows.length === 0) {
      res
        .status(404)
        .json({
          erro: "Sessão ativa não encontrada.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }
    res.json({ status: "abandonado" });
  } catch (err) {
    next(err);
  }
}
