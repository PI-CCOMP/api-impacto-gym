import { Router } from 'express'
import {
  listarAvisosAluno, listarAvisosDashboard,
  criarAviso, editarAviso, excluirAviso,
} from '../controllers/avisoController'
import { authMiddleware, authorize } from '../middlewares/auth'

const router = Router()

// RN29 — apenas alunos veem a listagem pública
router.get('/', authMiddleware, authorize('aluno'), listarAvisosAluno)

// Dashboard — admin, instrutor, recepcionista
router.get('/dashboard', authMiddleware, authorize('admin', 'instrutor', 'recepcionista'), listarAvisosDashboard)

// RN28 — apenas admin e recepcionista criam/editam/excluem
router.post('/', authMiddleware, authorize('admin', 'recepcionista'), criarAviso)
router.put('/:id_aviso', authMiddleware, authorize('admin', 'recepcionista'), editarAviso)
router.delete('/:id_aviso', authMiddleware, authorize('admin', 'recepcionista'), excluirAviso)

export default router
