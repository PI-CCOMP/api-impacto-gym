import { Router } from 'express'
import {
  cadastrarAluno, uploadDocumento,
  listarCadastros, aprovarCadastro, rejeitarCadastro,
} from '../controllers/cadastroController'
import { authMiddleware, authorize } from '../middlewares/auth'
import { uploadLaudo, handleMulterError } from '../middlewares/upload'

const router = Router()

// Públicas
router.post('/', cadastrarAluno)
router.post('/:id_aluno/documento', uploadLaudo, handleMulterError, uploadDocumento)

// Protegidas
router.get('/', authMiddleware, authorize('admin', 'recepcionista'), listarCadastros)
router.patch('/:id_aluno/aprovar', authMiddleware, authorize('admin', 'recepcionista'), aprovarCadastro)
router.patch('/:id_aluno/rejeitar', authMiddleware, authorize('admin', 'recepcionista'), rejeitarCadastro)

export default router
