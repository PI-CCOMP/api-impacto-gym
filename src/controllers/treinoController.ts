import { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import pool from "../config/database";
import * as TreinoModel from "../models/treinoModel";
import { GRUPOS_MUSCULARES_VALIDOS } from "../types";
import sharp from "sharp";
import {
  armazenarMidiaExercicio,
  obterMidiaExercicio,
  urlMidiaExercicio,
  type TipoMidiaExercicio,
} from "../services/exerciseMediaStorage";

type ExercicioDoTreinoInput = {
  id_exercicio: number;
  series: number;
  repeticoes: number;
  carga_sugerida?: number;
  tempo_descanso?: number;
};

type DadosTreinoInput = {
  nome?: string;
  exercicios?: ExercicioDoTreinoInput[];
};

// GET /treinos/meus (aluno)
export async function meusTreinos(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { rows: usuarioRows } = await TreinoModel.buscarIdPorUsuarioId(
      req.user!.id_usuario,
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

    const { rows: usuarioRows } = await TreinoModel.buscarIdPorUsuarioId(
      req.user!.id_usuario,
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
    const { rows } = await TreinoModel.buscarExercicioPorId(
      id_exercicio,
      req.user!.id_usuario,
    );
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
      dados: rows.map((row) => {
        const dado = { ...row };
        delete dado.total;
        return dado;
      }),
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
    const { nome, exercicios } = req.body as DadosTreinoInput;
    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      !Array.isArray(exercicios) ||
      exercicios.length < 3
    ) {
      res.status(422).json({
        erro: "Nome e no mínimo 3 exercícios são obrigatórios.",
        codigo: "VALIDACAO",
      });
      return;
    }

    const { rows: uRows } = await TreinoModel.buscarIdPorUsuarioId(req.user!.id_usuario);
    const id_instrutor = uRows[0]?.id;
    if (!id_instrutor) {
      res
        .status(404)
        .json({ erro: "Usuário não encontrado.", codigo: "NAO_ENCONTRADO" });
      return;
    }

    const ids = exercicios.map((exercicio) => exercicio.id_exercicio);
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
    const { nome, exercicios } = req.body as DadosTreinoInput;

    if (
      typeof nome !== "string" ||
      !nome.trim() ||
      !Array.isArray(exercicios) ||
      exercicios.length < 3
    ) {
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

    const ids = exercicios.map((exercicio) => exercicio.id_exercicio);
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

    // [CORRIGIDO] Não permite excluir treino com alunos vinculados
    const { rows: vinculados } =
      await TreinoModel.verificarAlunosVinculados(id_treino);
    if (vinculados.length > 0) {
      res.status(409).json({
        erro: "Treino possui alunos vinculados e não pode ser excluído.",
        codigo: "TREINO_VINCULADO",
      });
      return;
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
      res.status(400).json({
        erro: "id_aluno obrigatório.",
        codigo: "CAMPOS_OBRIGATORIOS",
      });
      return;
    }

    if (req.user!.perfil === "instrutor") {
      const check = await TreinoModel.verificarAlunoDoInstrutor(
        id_aluno,
        req.user!.id_usuario,
      );
      const { rows: instRows } =
        await TreinoModel.buscarInstrutorDeTreino(id_treino);
      const alunoSemInstrutor = check.rows.length === 0;

      if (alunoSemInstrutor) {
        if (instRows[0]?.id_instrutor !== req.user!.id_usuario) {
          res.status(403).json({
            erro: "Somente o instrutor responsável pelo aluno pode vincular treinos a ele.",
            codigo: "INSTRUTOR_INCOMPATIVEL",
          });
          return;
        }
      }
    }

    const { rows: compatRows } =
      await TreinoModel.verificarCompatibilidadeInstrutorTreino(
        id_treino,
        id_aluno,
      );

    if (compatRows.length === 0) {
      res.status(403).json({
        erro: "Este treino pertence a outro instrutor. Somente o instrutor responsável pelo aluno pode vincular treinos a ele.",
        codigo: "INSTRUTOR_INCOMPATIVEL",
      });
      return;
    }

    await client.query("BEGIN");

    const { rows } = await TreinoModel.vincularAlunoATreino(
      client,
      id_aluno,
      id_treino,
    );
    const id_aluno_treino = rows[0].id;

    const { rows: exRows } =
      await TreinoModel.buscarExerciciosModeloTreino(id_treino);
    for (const ex of exRows) {
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

    if (req.user!.perfil === "instrutor") {
      await TreinoModel.atribuirInstrutorSeNulo(
        client,
        id_aluno,
        req.user!.id_usuario,
      );
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
    if (req.user!.perfil === "instrutor") {
      const donoTreino = await TreinoModel.verificarDonoTreino(
        id_treino,
        req.user!.id_usuario,
      );
      const alunoDoInstrutor = await TreinoModel.verificarAlunoDoInstrutor(
        Number(id_aluno),
        req.user!.id_usuario,
      );
      if (donoTreino.rows.length === 0 || alunoDoInstrutor.rows.length === 0) {
        res.status(403).json({
          erro: "Instrutor só pode desvincular os próprios treinos dos próprios alunos.",
          codigo: "SEM_PERMISSAO",
        });
        return;
      }
    }
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
      !GRUPOS_MUSCULARES_VALIDOS.some((grupo) => grupo === grupoMuscular)
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
      dados: rows.map((row) => {
        const dado = { ...row };
        delete dado.total;
        return dado;
      }),
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
    if (
      !GRUPOS_MUSCULARES_VALIDOS.some(
        (grupo) => grupo === grupo_muscular,
      )
    ) {
      res
        .status(422)
        .json({ erro: "Grupo muscular inválido.", codigo: "ENUM_INVALIDO" });
      return;
    }

    // [CORRIGIDO] Pelo menos foto_url ou video_url obrigatório
    if (!foto_url && !video_url) {
      res.status(400).json({
        erro: "Informe ao menos foto_url ou video_url.",
        codigo: "CAMPOS_OBRIGATORIOS",
      });
      return;
    }

    const { rows } = await TreinoModel.inserirExercicio({
      nome: nome.trim(),
      grupoMuscular: grupo_muscular,
      // [CORRIGIDO] Se só um vier, usa para os dois
      fotoUrl: foto_url ?? video_url,
      videoUrl: video_url ?? foto_url,
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
      !GRUPOS_MUSCULARES_VALIDOS.some(
        (grupo) => grupo === grupo_muscular,
      )
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

const TIPOS_MIDIA_EXERCICIO: TipoMidiaExercicio[] = [
  "foto",
  "video",
  "ativacao",
];

function ehTipoMidiaExercicio(tipo: string): tipo is TipoMidiaExercicio {
  return TIPOS_MIDIA_EXERCICIO.some((item) => item === tipo);
}

export async function enviarMidiaExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_exercicio, tipo } = req.params;
    if (!/^\d+$/.test(id_exercicio)) {
      res.status(400).json({
        erro: "Identificador de exercício inválido.",
        codigo: "ID_INVALIDO",
      });
      return;
    }
    if (!ehTipoMidiaExercicio(tipo)) {
      res.status(400).json({
        erro: "Tipo de mídia inválido.",
        codigo: "MIDIA_INVALIDA",
      });
      return;
    }
    if (!req.file) {
      res.status(400).json({
        erro: "Selecione um arquivo para enviar.",
        codigo: "ARQUIVO_OBRIGATORIO",
      });
      return;
    }

    const tipoMidia = tipo;
    const exercicio = await TreinoModel.buscarMidiaExercicio(
      id_exercicio,
      tipoMidia,
    );
    if (exercicio.rows.length === 0) {
      res.status(404).json({
        erro: "Exercício não encontrado.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }

    let conteudo = req.file.buffer;
    let contentType: string;
    if (tipoMidia === "video") {
      if (
        conteudo.length < 12 ||
        !(
          conteudo.toString("ascii", 4, 8) === "ftyp" ||
          conteudo.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
        )
      ) {
        res.status(415).json({
          erro: "O vídeo deve ser um arquivo MP4 ou WebM válido.",
          codigo: "FORMATO_INVALIDO",
        });
        return;
      }
      contentType =
        conteudo.toString("ascii", 4, 8) === "ftyp" ? "video/mp4" : "video/webm";
    } else {
      try {
        const metadata = await sharp(conteudo, {
          failOn: "error",
          limitInputPixels: 40_000_000,
        }).metadata();
        if (
          !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
          !metadata.width ||
          !metadata.height ||
          metadata.width * metadata.height > 40_000_000
        ) {
          res.status(415).json({
            erro: "A imagem deve ser JPEG, PNG ou WEBP.",
            codigo: "FORMATO_INVALIDO",
          });
          return;
        }
        conteudo = await sharp(conteudo, {
          failOn: "error",
          limitInputPixels: 40_000_000,
        })
          .rotate()
          .resize({
            width: 1280,
            height: 1280,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        res.status(415).json({
          erro: "O arquivo enviado não é uma imagem válida ou não pôde ser processado.",
          codigo: "FORMATO_INVALIDO",
        });
        return;
      }
      contentType = "image/webp";
    }

    await armazenarMidiaExercicio(
      id_exercicio,
      tipoMidia,
      conteudo,
      contentType,
    );
    const url = urlMidiaExercicio(id_exercicio, tipoMidia, randomUUID());
    await TreinoModel.atualizarMidiaExercicio(id_exercicio, tipoMidia, url);
    res.json({ url, enviado: true });
  } catch (err) {
    next(err);
  }
}

export async function servirMidiaExercicio(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id_exercicio, tipo } = req.params;
    if (
      !/^\d+$/.test(id_exercicio) ||
      !ehTipoMidiaExercicio(tipo)
    ) {
      res.status(404).json({
        erro: "Mídia não encontrada.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }
    const tipoMidia = tipo;
    const exercicio = await TreinoModel.buscarMidiaExercicio(
      id_exercicio,
      tipoMidia,
    );
    if (
      exercicio.rows.length === 0 ||
      exercicio.rows[0].url?.split("?")[0] !==
        urlMidiaExercicio(id_exercicio, tipoMidia)
    ) {
      res.status(404).json({
        erro: "Mídia não encontrada.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }
    const media = await obterMidiaExercicio(id_exercicio, tipoMidia);
    if (!media) {
      res.status(404).json({
        erro: "Mídia não encontrada no armazenamento.",
        codigo: "NAO_ENCONTRADO",
      });
      return;
    }
    res.setHeader("Content-Type", media.contentType);
    res.setHeader("Content-Length", media.conteudo.length);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(media.conteudo);
  } catch (err) {
    next(err);
  }
}
