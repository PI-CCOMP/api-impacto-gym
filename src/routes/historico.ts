import { Router } from 'express'
import { meuHistorico, detalheHistorico } from '../controllers/historicoController'
import { authMiddleware, authorize } from '../middlewares/auth'

const router = Router()

router.get('/meu', authMiddleware, authorize('aluno'), meuHistorico)
router.get('/meu/:id_historico', authMiddleware, authorize('aluno'), detalheHistorico)

export default router
