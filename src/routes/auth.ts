import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  login,
  refreshToken,
  logout,
  verificarLoginAdmin,
  reenviarVerificacaoEmail,
  verificarEmailCadastro,
  solicitarTokenUploadLaudo,
  esqueciSenha,
  redefinirSenha,
  alterarSenha,
  alterarEmail,
} from "../controllers/authController";
import { authMiddleware } from "../middlewares/auth";

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas. Tente novamente em 15 minutos.",
    codigo: "RATE_LIMIT_LOGIN",
  },
});
const emailCodeLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    erro: "Muitas tentativas de verificação. Tente novamente em 15 minutos.",
    codigo: "RATE_LIMIT_EMAIL",
  },
});

router.post("/login", loginLimiter, login);
router.post("/login/verificar-email", loginLimiter, verificarLoginAdmin);
router.post("/email/verificar", emailCodeLimiter, verificarEmailCadastro);
router.post("/email/reenviar-verificacao", emailCodeLimiter, reenviarVerificacaoEmail);
router.post("/email/solicitar-upload-laudo", emailCodeLimiter, solicitarTokenUploadLaudo);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);
router.post("/esqueci-senha", emailCodeLimiter, esqueciSenha);
router.post("/redefinir-senha", emailCodeLimiter, redefinirSenha);
router.patch("/alterar-senha", authMiddleware, alterarSenha);
router.patch("/alterar-email", authMiddleware, alterarEmail);

export default router;
