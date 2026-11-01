import { createHmac, randomInt } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import * as AuthModel from "../models/authModel";
import { enviarEmail } from "../services/email";
import {
  enviarCodigoAlteracaoEmail,
} from "../services/emailVerification";
import {
  alteracaoEmail,
  cadastroEmail,
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
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("impacto-gym-invalid-login", 12);
const AUTH_RESPONSE_MINIMUM_MS = 350;

async function aguardarTempoMinimo(inicio: number): Promise<void> {
  const restante = AUTH_RESPONSE_MINIMUM_MS - (Date.now() - inicio);
  if (restante > 0) await delay(restante);
}

function enviarEmailSemAguardar(
  email: string,
  template: Parameters<typeof enviarEmail>[1],
): void {
  void enviarEmail(email, template).catch(() => {
    console.error("[AUTH_EMAIL] Não foi possível enviar um e-mail de autenticação.");
  });
}

async function emitirSessao(
  usuario: NonNullable<
    Awaited<ReturnType<typeof AuthModel.buscarUsuarioPorEmail>>
  >,
  res: Response,
  inicio?: number,
): Promise<void> {
  const sessionId = novoIdSessao();
  const refreshToken = criarRefreshToken(usuario.id, sessionId);
  await AuthModel.criarSessao(usuario.id, sessionId, hash(refreshToken));
  if (inicio !== undefined) await aguardarTempoMinimo(inicio);
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

function respostaStatusCadastro(status: string | null) {
  if (status === "rejeitado") {
    return {
      mensagem: "Seu cadastro foi rejeitado. Entre em contato com a academia.",
      codigo: "CADASTRO_REJEITADO",
    };
  }
  if (status === "inativo") {
    return {
      mensagem: "Seu cadastro está inativo. Entre em contato com a academia.",
      codigo: "CADASTRO_INATIVO",
    };
  }
  return {
    mensagem: "Seu cadastro está aguardando aprovação da academia.",
    codigo: "CADASTRO_PENDENTE",
  };
}

function revisaoMedicaExpirada(usuario: {
  revisao_medica_pendente: boolean | null;
  prazo_revisao_medica: Date | null;
}): boolean {
  return Boolean(
    usuario.revisao_medica_pendente &&
      usuario.prazo_revisao_medica &&
      new Date(usuario.prazo_revisao_medica).getTime() <= Date.now(),
  );
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const inicio = Date.now();
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
      await aguardarTempoMinimo(inicio);
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email.trim());
    const senhaValida = await bcrypt.compare(
      senha,
      usuario?.senha_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!usuario || !senhaValida) {
      erroResposta(
        res,
        401,
        "E-mail ou senha incorretos.",
        "CREDENCIAIS_INVALIDAS",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    if (!usuario.email_verificado) {
      erroResposta(
        res,
        403,
        "Confirme seu e-mail antes de entrar.",
        "EMAIL_NAO_VERIFICADO",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    if (usuario.perfil === "aluno" && usuario.status !== "ativo") {
      const cadastro = respostaStatusCadastro(usuario.status);
      erroResposta(res, 403, cadastro.mensagem, cadastro.codigo);
      await aguardarTempoMinimo(inicio);
      return;
    }

    if (usuario.perfil === "aluno" && revisaoMedicaExpirada(usuario)) {
      erroResposta(
        res,
        403,
        "O prazo para envio do laudo expirou. Envie o documento para liberar seu acesso após a análise.",
        "REVISAO_MEDICA_PENDENTE",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }

    if (["admin", "recepcionista", "instrutor"].includes(usuario.perfil)) {
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
        await aguardarTempoMinimo(inicio);
        return;
      }
      enviarEmailSemAguardar(usuario.email, loginAdminEmail(codigo));
      await aguardarTempoMinimo(inicio);
      res.json({
        email_verification_required: true,
        perfil: usuario.perfil,
        mensagem: "Enviamos um código de confirmação para o e-mail da conta.",
      });
      return;
    }

    await emitirSessao(usuario, res, inicio);
  } catch (err) {
    next(err);
  }
}

export async function reenviarCodigoLoginAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const inicio = Date.now();
  try {
    const { email } = req.body;
    if (typeof email === "string" && validarEmail(email)) {
      const usuario = await AuthModel.buscarUsuarioPorEmail(email.trim());
      if (
        usuario &&
        usuario.email_verificado &&
        ["admin", "recepcionista", "instrutor"].includes(usuario.perfil)
      ) {
        const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const salvo = await AuthModel.salvarCodigoEmail(
          usuario.id,
          "login_admin",
          hash(codigo),
        );
        if (salvo) enviarEmailSemAguardar(usuario.email, loginAdminEmail(codigo));
      }
    }
    await aguardarTempoMinimo(inicio);
    res.json({
      mensagem:
        "Se houver uma conta da equipe habilitada, enviaremos um novo código.",
    });
  } catch (err) {
    next(err);
  }
}

export async function reenviarVerificacaoEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const inicio = Date.now();
  try {
    const { email } = req.body;
    if (typeof email !== "string" || !validarEmail(email)) {
      erroResposta(res, 400, "Email válido obrigatório.", "EMAIL_INVALIDO");
      await aguardarTempoMinimo(inicio);
      return;
    }
    const usuario = await AuthModel.buscarUsuarioParaVerificacao(email.trim());
    if (
      usuario &&
      usuario.email_pendente?.toLowerCase() === email.trim().toLowerCase()
    ) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salvo = await AuthModel.salvarCodigoEmail(
        usuario.id,
        "alteracao_email",
        hash(codigo),
      );
      if (salvo) {
        enviarEmailSemAguardar(usuario.email_pendente, alteracaoEmail(codigo));
      }
    } else if (usuario && !usuario.email_verificado) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salvo = await AuthModel.salvarCodigoEmail(
        usuario.id,
        "verificacao_cadastro",
        hash(codigo),
      );
      if (salvo) {
        enviarEmailSemAguardar(usuario.email, cadastroEmail(codigo));
      }
    }
    await aguardarTempoMinimo(inicio);
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
    const alterandoEmail =
      usuario?.email_pendente?.toLowerCase() === email.toLowerCase();
    const verificado = usuario
      ? alterandoEmail
        ? await AuthModel.confirmarAlteracaoEmail(
            usuario.id,
            hash(codigo),
            usuario.email_pendente ?? "",
          )
        : !usuario.email_verificado
          ? await AuthModel.verificarEmailComCodigo(usuario.id, hash(codigo))
          : null
      : null;
    if (!usuario || !verificado) {
      erroResposta(res, 400, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    res.json({
      email_verificado: true,
      mensagem:
        alterandoEmail
          ? "Novo e-mail confirmado. Você já pode usá-lo para entrar."
          : usuario.perfil === "aluno" && usuario.status === "pendente"
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
  const inicio = Date.now();
  try {
    const { email, senha } = req.body;
    if (typeof email !== "string" || typeof senha !== "string") {
      erroResposta(
        res,
        400,
        "Email e senha são obrigatórios.",
        "CAMPOS_OBRIGATORIOS",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email.trim());
    const senhaValida = await bcrypt.compare(
      senha,
      usuario?.senha_hash ?? DUMMY_PASSWORD_HASH,
    );
    if (!usuario || !senhaValida) {
      erroResposta(
        res,
        401,
        "E-mail ou senha incorretos.",
        "CREDENCIAIS_INVALIDAS",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    if (!usuario.email_verificado) {
      erroResposta(
        res,
        403,
        "Confirme seu e-mail antes de solicitar o upload.",
        "EMAIL_NAO_VERIFICADO",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    if (
      usuario.perfil !== "aluno" ||
      !(
        (usuario.status === "pendente" &&
          usuario.tem_restricao &&
          !usuario.tem_documento) ||
        (usuario.status === "ativo" &&
          usuario.revisao_medica_pendente &&
          !usuario.tem_documento_pendente)
      )
    ) {
      erroResposta(
        res,
        403,
        "Não há laudo pendente para esta conta.",
        "UPLOAD_NAO_DISPONIVEL",
      );
      await aguardarTempoMinimo(inicio);
      return;
    }
    await aguardarTempoMinimo(inicio);
    res.json({
      cadastro_token: criarTokenUploadLaudo(usuario.id),
      id_aluno: usuario.id,
      expires_in: 1800,
    });
  } catch (err) {
    next(err);
  }
}

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    let claims: ReturnType<typeof verificarRefreshToken>;
    try {
      claims = verificarRefreshToken(token);
    } catch {
      erroResposta(
        res,
        401,
        "Refresh token inválido ou expirado.",
        "REFRESH_INVALIDO",
      );
      return;
    }
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
    if (usuario.perfil === "aluno" && usuario.status !== "ativo") {
      await AuthModel.revogarSessoesDoUsuario(usuarioId);
      const cadastro = respostaStatusCadastro(usuario.status);
      erroResposta(
        res,
        403,
        cadastro.mensagem,
        cadastro.codigo,
      );
      return;
    }
    if (usuario.perfil === "aluno" && revisaoMedicaExpirada(usuario)) {
      await AuthModel.revogarSessoesDoUsuario(usuarioId);
      erroResposta(
        res,
        403,
        "O prazo para envio do laudo expirou. Envie o documento para liberar seu acesso após a análise.",
        "REVISAO_MEDICA_PENDENTE",
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
  } catch (err) {
    next(err);
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
      !["admin", "recepcionista", "instrutor"].includes(usuario.perfil) ||
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
  const inicio = Date.now();
  try {
    const { email } = req.body;
    if (typeof email !== "string") {
      erroResposta(res, 400, "E-mail obrigatório.", "CAMPOS_OBRIGATORIOS");
      await aguardarTempoMinimo(inicio);
      return;
    }
    const usuario = await AuthModel.buscarUsuarioPorEmail(email.trim());
    if (usuario) {
      const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const salvo = await AuthModel.salvarCodigoEmail(
        usuario.id,
        "recuperacao_senha",
        hash(codigo),
      );
      if (salvo) enviarEmailSemAguardar(email.trim(), recuperacaoSenhaEmail(codigo));
    }
    await aguardarTempoMinimo(inicio);
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
    let confirmado = usuario
      ? await AuthModel.consumirCodigoEmail(
          usuario.id,
          "recuperacao_senha",
          hash(codigo),
        )
      : null;
    let conviteValido = false;
    if (usuario && !confirmado) {
      confirmado = await AuthModel.consumirCodigoEmail(
        usuario.id,
        "convite_conta",
        hash(codigo),
      );
      conviteValido = Boolean(confirmado);
    }
    if (!usuario || !confirmado) {
      erroResposta(res, 400, "Código inválido ou expirado.", "CODIGO_INVALIDO");
      return;
    }
    await AuthModel.atualizarSenha(
      usuario.id,
      await bcrypt.hash(nova_senha, 12),
      conviteValido,
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
    const emailNormalizado = novo_email.trim().toLowerCase();
    if (emailNormalizado === usuario.email.toLowerCase()) {
      erroResposta(
        res,
        422,
        "O novo e-mail deve ser diferente do atual.",
        "EMAIL_IGUAL",
      );
      return;
    }
    const reservado = await AuthModel.solicitarAlteracaoEmail(
      req.user!.id_usuario,
      emailNormalizado,
    );
    if (!reservado) {
      erroResposta(res, 409, "E-mail já em uso.", "EMAIL_DUPLICADO");
      return;
    }
    try {
      const enviado = await enviarCodigoAlteracaoEmail(
        req.user!.id_usuario,
        emailNormalizado,
      );
      if (!enviado) {
        erroResposta(
          res,
          429,
          "Aguarde antes de solicitar outro código.",
          "EMAIL_COOLDOWN",
        );
        return;
      }
    } catch {
      res.status(503).json({
        erro: "O endereço atual não foi alterado, mas não foi possível enviar o código. Solicite novo envio.",
        codigo: "EMAIL_ENVIO_FALHOU",
        email_verification_required: true,
      });
      return;
    }
    res.json({
      mensagem:
        "Enviamos um código para o novo endereço. O e-mail atual continua válido até a confirmação.",
      email_verification_required: true,
    });
  } catch (err) {
    next(err);
  }
}
