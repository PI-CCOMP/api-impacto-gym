import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import {
  cadastrarAluno, uploadDocumento,
  listarCadastros, aprovarCadastro, rejeitarCadastro,
  verDocumento, aprovarDocumento, rejeitarDocumento,
} from '../controllers/cadastroController'
import { authMiddleware, authorize } from '../middlewares/auth'
import { autorizarUploadLaudoPendente } from '../middlewares/pendingUpload'
import { uploadLaudo, handleMulterError } from '../middlewares/upload'

const router = Router()
const cadastroLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Muitos cadastros. Tente novamente em 15 minutos.',
    codigo: 'RATE_LIMIT_CADASTRO',
  },
})

// Públicas
router.post('/', cadastroLimiter, cadastrarAluno)
router.post('/:id_aluno/documento', autorizarUploadLaudoPendente, uploadLaudo, handleMulterError, uploadDocumento)

// Protegidas
router.get('/', authMiddleware, authorize('admin', 'recepcionista', 'instrutor'), listarCadastros)
router.patch('/:id_aluno/aprovar', authMiddleware, authorize('admin', 'recepcionista', 'instrutor'), aprovarCadastro)
router.patch('/:id_aluno/rejeitar', authMiddleware, authorize('admin', 'recepcionista'), rejeitarCadastro)
router.get('/:id_aluno/documentos/:id_documento', authMiddleware, authorize('admin', 'recepcionista', 'instrutor'), verDocumento)
router.patch('/:id_aluno/documentos/:id_documento/aprovar', authMiddleware, authorize('admin', 'recepcionista'), aprovarDocumento)
router.patch('/:id_aluno/documentos/:id_documento/rejeitar', authMiddleware, authorize('admin', 'recepcionista'), rejeitarDocumento)

export default router
