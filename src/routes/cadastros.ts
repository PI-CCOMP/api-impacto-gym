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
const uploadLaudoLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: 'Limite de envio de laudos atingido. Tente novamente mais tarde.',
    codigo: 'RATE_LIMIT_UPLOAD',
  },
})

// Públicas
router.post('/', cadastroLimiter, cadastrarAluno)
router.post('/:id_aluno/documento', uploadLaudoLimiter, autorizarUploadLaudoPendente, uploadLaudo, handleMulterError, uploadDocumento)

// Protegidas
router.get('/', authMiddleware, authorize('admin', 'instrutor'), listarCadastros)
router.patch('/:id_aluno/aprovar', authMiddleware, authorize('admin', 'instrutor'), aprovarCadastro)
router.patch('/:id_aluno/rejeitar', authMiddleware, authorize('admin'), rejeitarCadastro)
router.get('/:id_aluno/documentos/:id_documento', authMiddleware, authorize('admin'), verDocumento)
router.patch('/:id_aluno/documentos/:id_documento/aprovar', authMiddleware, authorize('admin'), aprovarDocumento)
router.patch('/:id_aluno/documentos/:id_documento/rejeitar', authMiddleware, authorize('admin'), rejeitarDocumento)

export default router
