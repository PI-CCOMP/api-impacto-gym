import { Request, Response, NextFunction } from "express";

type ErrorDetails = {
  status?: unknown;
  message?: unknown;
  expose?: unknown;
  codigo?: unknown;
};

/**
 * Handler de erros centralizado.
 * NUNCA expõe stack trace ou mensagens internas ao cliente.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const details: ErrorDetails =
    typeof err === "object" && err !== null ? err : {};
  // Log interno apenas — nunca retorna ao cliente
  console.error(
    "[ERROR]",
    typeof details.message === "string" ? details.message : err,
  );

  const status = typeof details.status === "number" ? details.status : 500;

  // Apenas erros marcados como seguros para exposição são devolvidos
  const mensagem =
    details.expose === true && typeof details.message === "string"
      ? details.message
      : "Erro interno no servidor.";

  void next;
  res
    .status(status)
    .json({
      erro: mensagem,
      codigo:
        typeof details.codigo === "string" ? details.codigo : "ERRO_INTERNO",
    });
}
