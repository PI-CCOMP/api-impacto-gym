import { Request, Response, NextFunction } from "express";
import { PoolClient } from "pg";
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

    const id_usuario = req.user!.id_usuario;
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
    const id_usuario = req.user!.id_usuario;
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
      !Number.isSafeInteger(idSessao) ||
      idSessao <= 0 ||
      !Number.isSafeInteger(id_aluno_treino_exercicio) ||
      id_aluno_treino_exercicio <= 0 ||
      !Number.isSafeInteger(numero_serie) ||
      numero_serie <= 0 ||
      typeof carga_real !== "number" ||
      !Number.isFinite(carga_real) ||
      carga_real < 0 ||
      carga_real > 9999.99
    ) {
      res.status(422).json({
        erro: "Sessão, exercício, série ou carga inválida.",
        codigo: "DADOS_INVALIDOS",
      });
      return;
    }

    const id_usuario = req.user!.id_usuario;
    const serie = await SessaoModel.registrarSerie({
      idSessao,
      idUsuario: id_usuario,
      idAluno_treinoExercicio: id_aluno_treino_exercicio,
      numeroSerie: numero_serie,
      cargaReal: carga_real,
    });
    if (!serie) {
      res.status(404).json({
        erro: "Sessão, exercício ou série não pertencem ao aluno.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }

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
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const { id_sessao } = req.params;
    const { duracao_segundos, volume_total } = req.body;

    const id_usuario = req.user!.id_usuario;

    const { rows } = await SessaoModel.finalizar(
      client,
      id_sessao,
      id_usuario,
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      res
        .status(404)
        .json({
          erro: "Sessão ativa não encontrada.",
          codigo: "NAO_ENCONTRADO",
        });
      return;
    }

    // RN23: registra histórico
    const { rows: histRows } = await SessaoModel.inserirHistorico(client, {
      idUsuario: id_usuario,
      idAluno_treino: rows[0].id_aluno_treino,
      duracaoSegundos: duracao_segundos ?? 0,
      volumeTotal: volume_total ?? 0,
    });

    await client.query("COMMIT");
    res.json({ id_historico: histRows[0].id, status: "finalizado" });
  } catch (err) {
    if (client) await client.query("ROLLBACK").catch(() => undefined);
    next(err);
  } finally {
    client?.release();
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
    const id_usuario = req.user!.id_usuario;

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
