import { Request, Response, NextFunction } from "express";
import pool from "../config/database";
import * as TreinoModel from "../models/treinoModel";
import { GRUPOS_MUSCULARES_VALIDOS } from "../types";

// GET /treinos/meus (aluno)
export async function meusTreinos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows: usuarioRows } = await TreinoModel.buscarIdPorAuthId(
      req.user!.id,
    );
    if (usuarioRows.length === 0) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows } = await TreinoModel.listarMeusTreinos(usuarioRows[0].id);
    res.json({ dados: rows });
  } catch (err) {
    next(err);
  }
}

// GET /treinos/:id_aluno_treino/exercicios (aluno)
export async function exerciciosDoTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_aluno_treino } = req.params;

    const { rows: usuarioRows } = await TreinoModel.buscarIdPorAuthId(
      req.user!.id,
    );
    const id_usuario = usuarioRows[0]?.id;
    if (!id_usuario) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows: atRows } = await TreinoModel.buscarAluno_treino(
      id_aluno_treino,
      id_usuario,
    );
    if (atRows.length === 0) {
      res
        .status(404)
        .json({ erro: "Treino não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const { rows: exRows } =
      await TreinoModel.buscarExerciciosDoAluno_treino(id_aluno_treino);

    const t = atRows[0];
    res.json({
      id_aluno_treino: Number(id_aluno_treino),
      nome_treino: t.nome_treino,
      grupos_musculares: t.grupos_musculares,
      autor: t.autor,
      exercicios: exRows,
    });
  } catch (err) {
    next(err);
  }
}

// GET /exercicios/:id_exercicio (aluno)
export async function buscarExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_exercicio } = req.params;
    const { rows } = await TreinoModel.buscarExercicioPorId(id_exercicio);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Exercício não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

// GET /treinos (admin/instrutor)
export async function listarTreinos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const busca = (req.query.busca as string) || "";
    const grupoMuscular = (req.query.grupo_muscular as string) || "";
    const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
    const porPagina = Math.min(
      50,
      parseInt(req.query.por_pagina as string) || 10,
    );
    const offset = (pagina - 1) * porPagina;
    const isInstrutor = req.user!.perfil === "instrutor";

    const { rows } = await TreinoModel.listarTreinos({
      busca,
      grupoMuscular,
      isInstrutor,
      instrutorId: req.user!.id_usuario,
      porPagina,
      offset,
    });

    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    res.json({
      dados: rows.map(({ total: _, ...r }) => r),
      total,
      pagina,
      por_pagina: porPagina,
    });
  } catch (err) {
    next(err);
  }
}

// GET /treinos/:id_treino (admin/instrutor)
export async function buscarTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_treino } = req.params;

    const { rows } = await TreinoModel.buscarTreinoPorId(id_treino);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Treino não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    if (req.user!.perfil === "instrutor") {
      const dono = await TreinoModel.verificarDonoTreino(
        id_treino,
        req.user!.id_usuario,
      );
      if (dono.rows.length === 0) {
        res
          .status(403)
          .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
        return;
      }
    }

    const { rows: exRows } =
      await TreinoModel.buscarExerciciosDeTreino(id_treino);
    const { rows: alunosRows } =
      await TreinoModel.buscarAlunosDoTreino(id_treino);

    res.json({ ...rows[0], exercicios: exRows, alunos_vinculados: alunosRows });
  } catch (err) {
    next(err);
  }
}

// POST /treinos
export async function criarTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { nome, exercicios } = req.body;
    if (!nome || !Array.isArray(exercicios) || exercicios.length < 3) {
      res.status(422).json({
        erro: "Nome e no mínimo 3 exercícios são obrigatórios.",
        codigo: "VALIDACAO",
      });
      return;
    }

    const { rows: uRows } = await TreinoModel.buscarIdPorAuthId(req.user!.id);
    const id_instrutor = uRows[0]?.id;
    if (!id_instrutor) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const ids = exercicios.map((e: any) => e.id_exercicio);
    const { rows: gmRows } = await TreinoModel.buscarGruposMusculares(ids);
    const grupos = gmRows.map((r) => r.grupo_muscular);

    await client.query("BEGIN");

    const { rows } = await TreinoModel.inserirTreino(
      client,
      nome,
      grupos,
      id_instrutor,
    );
    const id_treino = rows[0].id;

    for (let i = 0; i < exercicios.length; i++) {
      const ex = exercicios[i];
      await TreinoModel.inserirTreinoExercicio(client, {
        idTreino: id_treino,
        idExercicio: ex.id_exercicio,
        ordem: i + 1,
        series: ex.series,
        repeticoes: ex.repeticoes,
        cargaSugerida: ex.carga_sugerida ?? 0,
        tempoDescanso: ex.tempo_descanso ?? 60,
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ id_treino });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// PUT /treinos/:id_treino
export async function editarTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { id_treino } = req.params;
    const { nome, exercicios } = req.body;

    if (!nome || !Array.isArray(exercicios) || exercicios.length < 3) {
      res.status(422).json({
        erro: "Nome e no mínimo 3 exercícios são obrigatórios.",
        codigo: "VALIDACAO",
      });
      return;
    }

    if (req.user!.perfil === "instrutor") {
      const check = await TreinoModel.verificarDonoTreino(
        id_treino,
        req.user!.id_usuario,
      );
      if (check.rows.length === 0) {
        res
          .status(403)
          .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
        return;
      }
    }

    const ids = exercicios.map((e: any) => e.id_exercicio);
    const { rows: gmRows } = await TreinoModel.buscarGruposMusculares(ids);
    const grupos = gmRows.map((r) => r.grupo_muscular);

    await client.query("BEGIN");
    await TreinoModel.atualizarTreino(client, id_treino, nome, grupos);
    await TreinoModel.excluirExerciciosDeTreino(client, id_treino);

    for (let i = 0; i < exercicios.length; i++) {
      const ex = exercicios[i];
      await TreinoModel.inserirTreinoExercicio(client, {
        idTreino: Number(id_treino),
        idExercicio: ex.id_exercicio,
        ordem: i + 1,
        series: ex.series,
        repeticoes: ex.repeticoes,
        cargaSugerida: ex.carga_sugerida ?? 0,
        tempoDescanso: ex.tempo_descanso ?? 60,
      });
    }

    await client.query("COMMIT");
    res.json({ id_treino: Number(id_treino), atualizado: true });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /treinos/:id_treino
export async function excluirTreino(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_treino } = req.params;

    // RN22: não pode excluir se houver alunos vinculados
    const { rows: vinculos } =
      await TreinoModel.verificarAlunosVinculados(id_treino);
    if (vinculos.length > 0) {
      res.status(409).json({
        erro: "Treino possui alunos vinculados.",
        codigo: "TREINO_EM_USO",
      });
      return;
    }

    if (req.user!.perfil === "instrutor") {
      const check = await TreinoModel.verificarDonoTreino(
        id_treino,
        req.user!.id_usuario,
      );
      if (check.rows.length === 0) {
        res
          .status(403)
          .json({ erro: "Acesso não autorizado.", codigo: "SEM_PERMISSAO" });
        return;
      }
    }

    const { rows } = await TreinoModel.excluirTreinoPorId(id_treino);
    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Treino não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }
    res.json({ excluido: true });
  } catch (err) {
    next(err);
  }
}

// POST /treinos/:id_treino/alunos
export async function vincularAluno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const client = await pool.connect();
  try {
    const { id_treino } = req.params;
    const { id_aluno } = req.body;

    if (!id_aluno) {
      res
        .status(400)
        .json({ erro: "id_aluno obrigatório.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }

    // RN07: instrutor só pode vincular seus próprios alunos
    if (req.user!.perfil === "instrutor") {
      const check = await TreinoModel.verificarAlunoDoInstrutor(
        id_aluno,
        req.user!.id_usuario,
      );
      if (check.rows.length === 0) {
        res.status(403).json({
          erro: "Aluno não vinculado a este instrutor.",
          codigo: "SEM_PERMISSAO",
        });
        return;
      }
    }

    await client.query("BEGIN");

    // RN18: copia os exercícios do treino-modelo para o aluno
    const { rows } = await TreinoModel.vincularAlunoATreino(
      client,
      id_aluno,
      id_treino,
    );
    const id_aluno_treino = rows[0].id;

    const { rows: exRows } =
      await TreinoModel.buscarExerciciosModeloTreino(id_treino);
    for (const ex of exRows) {
      // RN18: gera uma linha por série (1..ex.series), não usa ordem como numero_serie
      for (let s = 1; s <= ex.series; s++) {
        await TreinoModel.inserirAluno_treinoExercicio(client, {
          idAluno_treino: id_aluno_treino,
          idExercicio: ex.id_exercicio,
          numeroSerie: s,
          repeticoes: ex.repeticoes,
          cargaSugerida: ex.carga_sugerida,
          tempoDescanso: ex.tempo_descanso,
        });
      }
    }

    await client.query("COMMIT");
    res.status(201).json({ id_aluno_treino });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

// DELETE /treinos/:id_treino/alunos/:id_aluno
export async function desvincularAluno(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_treino, id_aluno } = req.params;
    const { rows } = await TreinoModel.desvincularAlunoDeTreino(
      id_treino,
      id_aluno,
    );
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

// GET /exercicios (admin/instrutor)
export async function listarExercicios(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const busca = (req.query.busca as string) || "";
    const grupoMuscular = (req.query.grupo_muscular as string) || "";
    const pagina = Math.max(1, parseInt(req.query.pagina as string) || 1);
    const porPagina = Math.min(
      50,
      parseInt(req.query.por_pagina as string) || 10,
    );
    const offset = (pagina - 1) * porPagina;

    if (
      grupoMuscular &&
      !GRUPOS_MUSCULARES_VALIDOS.includes(grupoMuscular as any)
    ) {
      res
        .status(422)
        .json({ erro: "Grupo muscular inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const { rows } = await TreinoModel.listarExercicios({
      busca,
      grupoMuscular,
      porPagina,
      offset,
    });
    const total = rows.length > 0 ? Number(rows[0].total) : 0;
    res.json({
      dados: rows.map(({ total: _, ...r }) => r),
      total,
      pagina,
      por_pagina: porPagina,
    });
  } catch (err) {
    next(err);
  }
}

// POST /exercicios (admin/instrutor)
export async function criarExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const {
      nome,
      grupo_muscular,
      foto_url,
      video_url,
      imagem_ativacao_muscular_url,
    } = req.body;

    if (!nome || !nome.trim()) {
      res
        .status(400)
        .json({ erro: "Nome obrigatório.", codigo: "CAMPOS_OBRIGATORIOS" });
      return;
    }
    if (!grupo_muscular) {
      res.status(400).json({
        erro: "grupo_muscular obrigatório.",
        codigo: "CAMPOS_OBRIGATORIOS",
      });
      return;
    }
    if (!GRUPOS_MUSCULARES_VALIDOS.includes(grupo_muscular as any)) {
      res
        .status(422)
        .json({ erro: "Grupo muscular inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const { rows } = await TreinoModel.inserirExercicio({
      nome: nome.trim(),
      grupoMuscular: grupo_muscular,
      fotoUrl: foto_url ?? null,
      videoUrl: video_url ?? null,
      imagemAtivacaoUrl: imagem_ativacao_muscular_url ?? null,
    });

    res.status(201).json({ id_exercicio: rows[0].id });
  } catch (err) {
    next(err);
  }
}

// PUT /exercicios/:id_exercicio (admin/instrutor)
export async function editarExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_exercicio } = req.params;
    const {
      nome,
      grupo_muscular,
      foto_url,
      video_url,
      imagem_ativacao_muscular_url,
    } = req.body;

    if (
      grupo_muscular &&
      !GRUPOS_MUSCULARES_VALIDOS.includes(grupo_muscular as any)
    ) {
      res
        .status(422)
        .json({ erro: "Grupo muscular inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    const { rows } = await TreinoModel.atualizarExercicio(id_exercicio, {
      nome: nome?.trim(),
      grupoMuscular: grupo_muscular,
      fotoUrl: foto_url,
      videoUrl: video_url,
      imagemAtivacaoUrl: imagem_ativacao_muscular_url,
    });

    if (rows.length === 0) {
      res
        .status(404)
        .json({ erro: "Exercício não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    res.json({ id_exercicio: rows[0].id, atualizado: true });
  } catch (err) {
    next(err);
  }
}

// DELETE /exercicios/:id_exercicio (admin/instrutor) — RN21: inativa se vinculado
export async function excluirExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_exercicio } = req.params;
    const { rows } = await TreinoModel.inativarExercicio(id_exercicio);

    if (rows.length === 0) {
      res.status(409).json({
        erro: "Exercício vinculado a treinos ativos. Foi inativado em vez de excluído (RN21).",
        codigo: "EXERCICIO_VINCULADO",
      });
      return;
    }

    res.json({ excluido: true });
  } catch (err) {
    next(err);
  }
}
