import { Router } from 'express'
import {
  meusTreinos, exerciciosDoTreino, buscarExercicio,
  listarTreinos, buscarTreino,
  criarTreino, editarTreino, excluirTreino,
  vincularAluno, desvincularAluno,
  listarExercicios,
} from '../controllers/treinoController'
import { authMiddleware, authorize } from '../middlewares/auth'

const router = Router()

// Aluno
router.get('/meus', authMiddleware, authorize('aluno'), meusTreinos)
router.get('/:id_aluno_treino/exercicios', authMiddleware, authorize('aluno'), exerciciosDoTreino)

// Admin / Instrutor
router.get('/', authMiddleware, authorize('admin', 'instrutor'), listarTreinos)
router.get('/:id_treino', authMiddleware, authorize('admin', 'instrutor'), buscarTreino)
router.post('/', authMiddleware, authorize('admin', 'instrutor'), criarTreino)
router.put('/:id_treino', authMiddleware, authorize('admin', 'instrutor'), editarTreino)
router.delete('/:id_treino', authMiddleware, authorize('admin', 'instrutor'), excluirTreino)
router.post('/:id_treino/alunos', authMiddleware, authorize('admin', 'instrutor'), vincularAluno)
router.delete('/:id_treino/alunos/:id_aluno', authMiddleware, authorize('admin', 'instrutor'), desvincularAluno)

export default router
