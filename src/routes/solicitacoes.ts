import { Router } from 'express'
import {
  criarSolicitacao, minhasSolicitacoes, cancelarSolicitacao,
  solicitacoesDashboard, atenderSolicitacao,
} from '../controllers/solicitacaoController'
import { authMiddleware, authorize } from '../middlewares/auth'

const router = Router()

// Aluno
router.post('/', authMiddleware, authorize('aluno'), criarSolicitacao)
router.get('/minhas', authMiddleware, authorize('aluno'), minhasSolicitacoes)
router.patch('/:id_solicitacao/cancelar', authMiddleware, authorize('aluno'), cancelarSolicitacao)

// Admin / Instrutor
router.get('/dashboard', authMiddleware, authorize('admin', 'instrutor'), solicitacoesDashboard)
router.patch('/:id_solicitacao/atender', authMiddleware, authorize('admin', 'instrutor'), atenderSolicitacao)

export default router
