import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";

dotenv.config();

import authRoutes from "./routes/auth";
import cadastroRoutes from "./routes/cadastros";
import usuarioRoutes from "./routes/usuarios";
import treinoRoutes from "./routes/treinos";
import exercicioRoutes from "./routes/exercicios";
import sessaoRoutes from "./routes/sessoes";
import historicoRoutes from "./routes/historico";
import avisoRoutes from "./routes/avisos";
import solicitacaoRoutes from "./routes/solicitacoes";
import { errorHandler } from "./middlewares/errorHandler";
import { authMiddleware } from "./middlewares/auth";
import { servirFotoPerfil } from "./controllers/usuarioController";
import { inicializarArmazenamentoFotos } from "./services/photoStorage";

const app = express();

//  Segurança
app.use(helmet()); // Cabeçalhos HTTP de segurança
app.disable("x-powered-by"); // Não anuncia Express

// CORS restrito — ajuste ALLOWED_ORIGIN no .env para produção
const allowedOrigin = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
app.use(cors({ origin: allowedOrigin, credentials: true }));

// Rate limit global — 100 req/min por IP
app.use(
  rateLimit({
    windowMs: 60_000,
    max: 1000000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      erro: "Muitas requisições. Tente novamente em breve.",
      codigo: "RATE_LIMIT",
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
//  Health check (sem dados sensíveis)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

//  Rotas da API
const api = express.Router();

api.use("/auth", authRoutes);
api.get("/usuarios/fotos/:id_usuario", authMiddleware, servirFotoPerfil);
api.use("/cadastros", cadastroRoutes);
api.use("/usuarios", usuarioRoutes);
api.use("/treinos", treinoRoutes);
api.use("/exercicios", exercicioRoutes);
api.use("/sessoes", sessaoRoutes);
api.use("/historico", historicoRoutes);
api.use("/avisos", avisoRoutes);
api.use("/solicitacoes-auxilio", solicitacaoRoutes);

app.use("/", api);

//  404
app.use((_req, res) => {
  res
    .status(404)
    .json({ erro: "Rota não encontrada.", codigo: "ROTA_NAO_ENCONTRADA" });
});

//  Handler de erros centralizado
app.use(errorHandler);

//  Start
const PORT = Number(process.env.PORT) || 3001;
void inicializarArmazenamentoFotos()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[SERVER] Impacto Gym API rodando em http://localhost:${PORT}`);
    });
  })
  .catch((error: unknown) => {
    const name =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      typeof error.name === "string"
        ? error.name
        : "StorageError";
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error("[STORAGE] Falha ao inicializar armazenamento privado de fotos.", {
      name,
      code,
    });
    process.exitCode = 1;
  });

export default app;
