import { Router } from "express";
import {
  login,
  refreshToken,
  logout,
  enviarMfa,
  verificarMfa,
  esqueciSenha,
  alterarSenha,
  alterarEmail,
} from "../controllers/authController";
import { authMiddleware, requireMfa } from "../middlewares/auth";

const router = Router();

router.post("/login", login);
router.post("/refresh", refreshToken);
router.post("/logout", authMiddleware, logout);
router.post("/esqueci-senha", esqueciSenha);
router.post("/mfa/enviar", authMiddleware, enviarMfa); // envia o código por email
router.post("/mfa/verificar", authMiddleware, verificarMfa); // verifica o código
router.patch("/alterar-senha", authMiddleware, requireMfa, alterarSenha);
router.patch("/alterar-email", authMiddleware, requireMfa, alterarEmail);

export default router;
