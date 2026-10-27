import { createHmac, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import * as AuthModel from "../models/authModel";
import { enviarEmail } from "../services/email";
import { enviarCodigoVerificacaoCadastro } from "../services/emailVerification";
import {
  loginAdminEmail,
  recuperacaoSenhaEmail,
} from "../services/emailTemplates";
import {
  criarAccessToken,
  criarTokenUploadLaudo,
  criarRefreshToken,
  novoIdSessao,
  verificarRefreshToken,
} from "../config/tokens";
import { Perfil } from "../types";
import { validarSenha, validarEmail } from "../utils/validate";

const hash = (value: string) =>
  createHmac("sha256", process.env.JWT_SECRET!).update(value).digest("hex");

async function emitirSessao(
  usuario: NonNullable<
    Awaited<ReturnType<typeof AuthModel.buscarUsuarioPorEmail>>
  >,
  res: Response,
): Promise<void> {
  const sessionId = novoIdSessao();
  const refreshToken = criarRefreshToken(usuario.id, sessionId);
  await AuthModel.criarSessao(usuario.id, sessionId, hash(refreshToken));
  res.json({
    access_token: criarAccessToken(
      usuario.id,
      usuario.perfil as Perfil,
      sessionId,
    ),
    refresh_token: refreshToken,
    expires_in: 900,
    expires_at: Math.floor(Date.now() / 1000) + 900,
    usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
  });
}

function erroResposta(
  res: Response,
  status: number,
  erro: string,
  codigo: string,
): void {
  res.status(status).json({ erro, codigo });
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, senha } = req.body;
    if (
      typeof email !== "string" ||
      typeof senha !== "string" ||
      !email ||
      !senha
    ) {
      erroResposta(
        res,
        400,
        "Email e senha são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    if (!validarEmail(email)) {
      erroResposta(res, 400, "Email inválido.", "EMAIL_INVALIDO");
      return;
    }

    const usuario = await AuthModel.buscarUsuarioPorEmail(email);
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
      erroResposta(res, 401, "Credenciais inválidas.", "CREDENCIAIS_INVALIDAS");
      return;
    }
    if (!usuario.email_verificado) {
      erroResposta(
        res,
        403,
        "Confirme seu e-mail antes de entrar.",
        "EMAIL_NAO_VERIFICADO",
      );
      return;
    }
    if (usuario.perfil === "aluno" && usuario.status !== "ativo") {
      erroResposta(
        res,
        403,
        "Cadastro pendente de aprovação.",
        "CADASTRO_INATIVO",
      );
      return;
    }

    if (usuario.perfil === "admin" || usuario.perfil === "recepcionista") {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salvo = await AuthModel.salvarCodigoEmail(
        usuario.id,
        "login_admin",
        hash(codigo),
      );
      if (!salvo) {
        erroResposta(
          res,
          429,
          "Aguarde antes de solicitar outro código.",
          "EMAIL_COOLDOWN",
        );
        return;
      }
      await enviarEmail(usuario.email, loginAdminEmail(codigo));
      res.json({
        email_verification_required: true,
        mensagem: "Enviamos um código de confirmação para o e-mail da conta.",
      });
      return;
    }

    await emitirSessao(usuario, res);
  } catch (err) {
    next(err);
  }
}

export async function reenviarVerificacaoEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;
    if (typeof email !== "string" || !validarEmail(email)) {
      erroResposta(res, 400, "Email válido obrigatório.", "EMAIL_INVALIDO");
      return;
    }
    const usuario = await AuthModel.buscarUsuarioParaVerificacao(email);
    if (usuario && !usuario.email_verificado) {
      await enviarCodigoVerificacaoCadastro(usuario.id, usuario.email);
    }
    res.json({
      mensagem:
        "Se houver uma conta não confirmada, enviaremos um código para o e-mail informado.",
    });
  } catch (err) {
    next(err);
  }
}

export async function verificarEmailCadastro(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, codigo } = req.body;
    if (
      typeof email !== "string" ||
      !validarEmail(email) ||
      typeof codigo !== "string" ||
      !/^\d{6}$/.test(codigo)
    ) {
      erroResposta(
        res,
        400,
        "Email válido e código de 6 dígitos são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioParaVerificacao(email);
    const verificado =
      usuario && !usuario.email_verificado
        ? await AuthModel.verificarEmailComCodigo(usuario.id, hash(codigo))
        : null;
    if (!usuario || !verificado) {
      erroResposta(res, 400, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    res.json({
      email_verificado: true,
      mensagem:
        usuario.perfil === "aluno" && usuario.status === "pendente"
          ? "E-mail confirmado. Aguarde a aprovação do cadastro."
          : "E-mail confirmado com sucesso.",
      ...(usuario.perfil === "aluno" &&
      usuario.status === "pendente" &&
      usuario.tem_restricao &&
      !usuario.tem_documento
        ? { cadastro_token: criarTokenUploadLaudo(usuario.id) }
        : {}),
    });
  } catch (err) {
    next(err);
  }
}

export async function solicitarTokenUploadLaudo(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, senha } = req.body;
    if (typeof email !== "string" || typeof senha !== "string") {
      erroResposta(
        res,
        400,
        "Email e senha são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email);
    if (!usuario || !(await bcrypt.compare(senha, usuario.senha_hash))) {
      erroResposta(res, 401, "Credenciais inválidas.", "CREDENCIAIS_INVALIDAS");
      return;
    }
    if (!usuario.email_verificado) {
      erroResposta(
        res,
        403,
        "Confirme seu e-mail antes de solicitar o upload.",
        "EMAIL_NAO_VERIFICADO",
      );
      return;
    }
    if (
      usuario.perfil !== "aluno" ||
      usuario.status !== "pendente" ||
      !usuario.tem_restricao ||
      usuario.tem_documento
    ) {
      erroResposta(
        res,
        403,
        "Não há laudo pendente para esta conta.",
        "UPLOAD_NAO_DISPONIVEL",
      );
      return;
    }
    res.json({
      cadastro_token: criarTokenUploadLaudo(usuario.id),
      expires_in: 1800,
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refresh_token: token } = req.body;
    if (typeof token !== "string" || !token) {
      erroResposta(
        res,
        400,
        "refresh_token obrigatório.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    const claims = verificarRefreshToken(token);
    const usuarioId = Number(claims.sub);
    const sessao = await AuthModel.buscarSessao(claims.sid, usuarioId);
    if (!sessao || sessao.refresh_token_hash !== hash(token)) {
      erroResposta(
        res,
        401,
        "Refresh token inválido ou expirado.",
        "REFRESH_INVALIDO",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorId(usuarioId);
    if (!usuario) {
      erroResposta(
        res,
        401,
        "Usuário não encontrado.",
        "USUARIO_NAO_ENCONTRADO",
      );
      return;
    }
    if (!usuario.email_verificado) {
      await AuthModel.revogarSessoesDoUsuario(usuarioId);
      erroResposta(
        res,
        401,
        "Confirme seu e-mail antes de entrar.",
        "EMAIL_NAO_VERIFICADO",
      );
      return;
    }
    const novoRefreshToken = criarRefreshToken(usuarioId, claims.sid);
    await AuthModel.atualizarRefreshToken(claims.sid, hash(novoRefreshToken));
    res.json({
      access_token: criarAccessToken(
        usuarioId,
        usuario.perfil as Perfil,
        claims.sid,
      ),
      refresh_token: novoRefreshToken,
      expires_in: 900,
      expires_at: Math.floor(Date.now() / 1000) + 900,
    });
  } catch {
    erroResposta(
      res,
      401,
      "Refresh token inválido ou expirado.",
      "REFRESH_INVALIDO",
    );
  }
}

export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    await AuthModel.revogarSessao(req.user!.session_id);
    res.json({ mensagem: "Logout realizado com sucesso." });
  } catch (err) {
    next(err);
  }
}

export async function verificarLoginAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, codigo } = req.body;
    if (
      typeof email !== "string" ||
      !validarEmail(email) ||
      typeof codigo !== "string" ||
      !/^\d{6}$/.test(codigo)
    ) {
      erroResposta(
        res,
        400,
        "Email e código de 6 dígitos são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email);
    if (
      !usuario ||
      !["admin", "recepcionista"].includes(usuario.perfil) ||
      !usuario.email_verificado
    ) {
      erroResposta(res, 401, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    const confirmado = await AuthModel.consumirCodigoEmail(
      usuario.id,
      "login_admin",
      hash(codigo),
    );
    if (!confirmado) {
      erroResposta(res, 401, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    await emitirSessao(usuario, res);
  } catch (err) {
    next(err);
  }
}

export async function esqueciSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;
    if (typeof email !== "string" || !validarEmail(email)) {
      erroResposta(res, 400, "Email válido obrigatório.", "EMAIL_INVALIDO");
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email);
    if (usuario) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salvo = await AuthModel.salvarCodigoEmail(
        usuario.id,
        "recuperacao_senha",
        hash(codigo),
      );
      if (salvo) await enviarEmail(email, recuperacaoSenhaEmail(codigo));
    }
    res.json({
      mensagem:
        "Se o e-mail estiver cadastrado, enviaremos um código de recuperação.",
    });
  } catch (err) {
    next(err);
  }
}

export async function redefinirSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, codigo, nova_senha } = req.body;
    if (
      typeof email !== "string" ||
      !validarEmail(email) ||
      typeof codigo !== "string" ||
      !/^\d{6}$/.test(codigo) ||
      typeof nova_senha !== "string"
    ) {
      erroResposta(
        res,
        400,
        "Email, código e nova_senha são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    if (!validarSenha(nova_senha)) {
      erroResposta(
        res,
        422,
        "Senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.",
        "SENHA_FRACA",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email);
    const confirmado = usuario
      ? await AuthModel.consumirCodigoEmail(
          usuario.id,
          "recuperacao_senha",
          hash(codigo),
        )
      : null;
    if (!usuario || !confirmado) {
      erroResposta(res, 400, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    await AuthModel.atualizarSenha(
      usuario.id,
      await bcrypt.hash(nova_senha, 12),
    );
    await AuthModel.revogarSessoesDoUsuario(usuario.id);
    res.json({ mensagem: "Senha redefinida com sucesso." });
  } catch (err) {
    next(err);
  }
}

export async function alterarSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { senha_atual, nova_senha } = req.body;
    if (typeof senha_atual !== "string" || typeof nova_senha !== "string") {
      erroResposta(
        res,
        400,
        "senha_atual e nova_senha são obrigatórias.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorId(req.user!.id_usuario);
    if (!usuario || !(await bcrypt.compare(senha_atual, usuario.senha_hash))) {
      erroResposta(res, 401, "Senha atual incorreta.", "SENHA_ATUAL_INVALIDA");
      return;
    }
    if (!validarSenha(nova_senha)) {
      erroResposta(
        res,
        422,
        "Senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.",
        "SENHA_FRACA",
      );
      return;
    }
    if (senha_atual === nova_senha) {
      erroResposta(
        res,
        422,
        "A nova senha deve ser diferente da atual.",
        "SENHA_IGUAL",
      );
      return;
    }
    await AuthModel.atualizarSenha(
      usuario.id,
      await bcrypt.hash(nova_senha, 12),
    );
    await AuthModel.revogarSessoesDoUsuario(usuario.id);
    res.json({
      mensagem: "Senha alterada com sucesso. Entre novamente com a nova senha.",
    });
  } catch (err) {
    next(err);
  }
}

export async function alterarEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { senha_atual, novo_email } = req.body;
    if (typeof senha_atual !== "string" || typeof novo_email !== "string") {
      erroResposta(
        res,
        400,
        "senha_atual e novo_email são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      return;
    }
    if (!validarEmail(novo_email)) {
      erroResposta(
        res,
        400,
        "novo_email válido obrigatório.",
        "EMAIL_INVALIDO",
      );
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorId(req.user!.id_usuario);
    if (!usuario || !(await bcrypt.compare(senha_atual, usuario.senha_hash))) {
      erroResposta(res, 401, "Senha atual incorreta.", "SENHA_ATUAL_INVALIDA");
      return;
    }
    if (novo_email.toLowerCase() === usuario.email.toLowerCase()) {
      erroResposta(
        res,
        422,
        "O novo e-mail deve ser diferente do atual.",
        "EMAIL_IGUAL",
      );
      return;
    }
    if (await AuthModel.buscarEmailExistente(novo_email)) {
      erroResposta(res, 409, "E-mail já em uso.", "EMAIL_DUPLICADO");
      return;
    }
    const emailNormalizado = novo_email.trim().toLowerCase();
    await AuthModel.atualizarEmail(req.user!.id_usuario, emailNormalizado);
    await AuthModel.revogarSessoesDoUsuario(req.user!.id_usuario);
    try {
      await enviarCodigoVerificacaoCadastro(
        req.user!.id_usuario,
        emailNormalizado,
      );
    } catch {
      res.status(503).json({
        erro: "E-mail atualizado, mas não foi possível enviar o código. Solicite novo envio.",
        codigo: "EMAIL_ENVIO_FALHOU",
        email_verification_required: true,
      });
      return;
    }
    res.json({
      mensagem:
        "E-mail atualizado. Confirme o novo endereço para entrar novamente.",
      email_verification_required: true,
    });
  } catch (err) {
    next(err);
  }
}
