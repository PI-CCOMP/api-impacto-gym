import { Router } from 'express'
import {
  login,
  refreshToken,
  logout,
  verificarMfa,
  esqueciSenha,
  alterarSenha,
  alterarEmail,
} from '../controllers/authController'
import { authMiddleware, requireMfa } from '../middlewares/auth'

const router = Router()

router.post('/login', login)
router.post('/refresh', refreshToken)                          // novo: renova access_token
router.post('/logout', authMiddleware, logout)                 // novo: invalida server-side
router.post('/esqueci-senha', esqueciSenha)
router.post('/mfa/verificar', authMiddleware, verificarMfa)
router.patch('/alterar-senha', authMiddleware, requireMfa, alterarSenha)
router.patch('/alterar-email', authMiddleware, requireMfa, alterarEmail)

export default router
