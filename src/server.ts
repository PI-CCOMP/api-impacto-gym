import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "node:path";

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
    max: 100,
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
app.use(
  "/uploads/fotos",
  express.static(path.resolve(process.env.UPLOAD_DIR ?? "uploads", "fotos")),
);

//  Health check (sem dados sensíveis)
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

//  Rotas da API
const api = express.Router();

api.use("/auth", authRoutes);
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
app.listen(PORT, () => {
  console.log(`[SERVER] Impacto Gym API rodando em http://localhost:${PORT}`);
});

export default app;
