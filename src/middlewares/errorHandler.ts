import { Request, Response, NextFunction } from "express";

/**
 * Handler de erros centralizado.
 * NUNCA expõe stack trace ou mensagens internas ao cliente.
 */
export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Log interno apenas — nunca retorna ao cliente
  console.error("[ERROR]", err?.message ?? err);

  const status: number = typeof err?.status === "number" ? err.status : 500;

  // Apenas erros marcados como seguros para exposição são devolvidos
  const mensagem =
    err?.expose === true && typeof err?.message === "string"
      ? err.message
      : "Erro interno no servidor.";

  res
    .status(status)
    .json({ erro: mensagem, codigo: err?.codigo ?? "ERRO_INTERNO" });
}
