import { Router } from 'express'
import {
  listarUsuarios, usuarioAtual, buscarUsuario,
  criarUsuario, editarUsuario, excluirUsuario,
  uploadFotoPerfil, desvincularTreino,
} from '../controllers/usuarioController'
import { authMiddleware, authorize } from '../middlewares/auth'
import { uploadFoto, handleMulterError } from '../middlewares/upload'

const router = Router()

// Todos os perfis autenticados
router.get('/eu', authMiddleware, usuarioAtual)
router.patch('/eu/foto', authMiddleware, uploadFoto, handleMulterError, uploadFotoPerfil)

// admin, instrutor, recepcionista
router.get('/', authMiddleware, authorize('admin', 'instrutor', 'recepcionista'), listarUsuarios)
router.get('/:id', authMiddleware, authorize('admin', 'instrutor', 'recepcionista'), buscarUsuario)
router.put('/:id', authMiddleware, authorize('admin', 'instrutor', 'recepcionista'), editarUsuario)

// Apenas admin
router.post('/', authMiddleware, authorize('admin'), criarUsuario)
router.delete('/:id', authMiddleware, authorize('admin'), excluirUsuario)
router.delete('/:id/treinos/:id_aluno_treino', authMiddleware, authorize('admin', 'instrutor'), desvincularTreino)

export default router
