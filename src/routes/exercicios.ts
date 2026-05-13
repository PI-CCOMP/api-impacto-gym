import { Router } from "express";
import {
  listarExercicios,
  buscarExercicio,
  criarExercicio,
  editarExercicio,
  excluirExercicio,
} from "../controllers/treinoController";
import { authMiddleware, authorize } from "../middlewares/auth";

const router = Router();

// Admin e instrutor — catálogo e CRUD
router.get(
  "/",
  authMiddleware,
  authorize("admin", "instrutor"),
  listarExercicios,
);
router.post(
  "/",
  authMiddleware,
  authorize("admin", "instrutor"),
  criarExercicio,
);
router.put(
  "/:id_exercicio",
  authMiddleware,
  authorize("admin", "instrutor"),
  editarExercicio,
);
router.delete(
  "/:id_exercicio",
  authMiddleware,
  authorize("admin", "instrutor"),
  excluirExercicio,
);

// Aluno — detalhe de um exercício durante o treino
router.get(
  "/:id_exercicio",
  authMiddleware,
  authorize("aluno"),
  buscarExercicio,
);

export default router;
