import { Router } from 'express'
import {
  iniciarSessao, sessaoAtiva, registrarSerie,
  finalizarSessao, abandonarSessao,
} from '../controllers/sessaoController'
import { authMiddleware, authorize } from '../middlewares/auth'

const router = Router()

router.post('/', authMiddleware, authorize('aluno'), iniciarSessao)
router.get('/ativa', authMiddleware, authorize('aluno'), sessaoAtiva)
router.post('/:id_sessao/series', authMiddleware, authorize('aluno'), registrarSerie)
router.patch('/:id_sessao/finalizar', authMiddleware, authorize('aluno'), finalizarSessao)
router.patch('/:id_sessao/abandonar', authMiddleware, authorize('aluno'), abandonarSessao)

export default router
