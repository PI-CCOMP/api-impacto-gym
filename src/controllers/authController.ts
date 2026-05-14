import { Request, Response, NextFunction } from "express";
import * as AuthModel from "../models/authModel";
import { validarSenha, validarEmail } from "../utils/validate";

// POST /auth/login
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, senha } = req.body;

    if (!email || !senha || !email.trim() || !senha.trim()) {
      res
        .status(400)
        .json({
          erro: "Email e senha são obrigatórios.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }
    if (!validarEmail(email)) {
      res
        .status(400)
        .json({ erro: "Email inválido.", codigo: "EMAIL_INVALIDO" });
      return;
    }

    const { data, error } = await AuthModel.signInSupabase(email, senha);

    if (error || !data.session) {
      res
        .status(401)
        .json({
          erro: "Credenciais inválidas.",
          codigo: "CREDENCIAIS_INVALIDAS",
        });
      return;
    }

    const usuario = await AuthModel.buscarUsuarioPorAuthId(data.user.id);

    if (!usuario) {
      res
        .status(401)
        .json({
          erro: "Usuário não encontrado.",
          codigo: "USUARIO_NAO_ENCONTRADO",
        });
      return;
    }

    if (usuario.perfil === "aluno" && usuario.status !== "ativo") {
      res
        .status(403)
        .json({
          erro: "Cadastro pendente de aprovação.",
          codigo: "CADASTRO_INATIVO",
        });
      return;
    }

    // Retorna access_token + refresh_token para o front gerenciar a sessão
    // conforme a política de cada perfil (admin=sessionStorage, instrutor=1d, aluno=7d)
    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in, // segundos até expirar (normalmente 3600)
      expires_at: data.session.expires_at, // unix timestamp da expiração
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/refresh
// Front envia o refresh_token; backend renova e devolve novos tokens
export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token || typeof refresh_token !== "string") {
      res
        .status(400)
        .json({
          erro: "refresh_token obrigatório.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    const { data, error } = await AuthModel.refreshSession(refresh_token);

    if (error || !data.session) {
      res
        .status(401)
        .json({
          erro: "Refresh token inválido ou expirado.",
          codigo: "REFRESH_INVALIDO",
        });
      return;
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/logout
// Invalida o refresh_token no Supabase (server-side logout)
export async function logout(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // O front deve enviar o access_token no header Authorization (já validado pelo authMiddleware)
    // Aqui apenas sinalizamos sucesso; o front limpa o storage
    // Para invalidação total server-side, usamos signOut com scope global
    await AuthModel.signOut(req.user!.id);
    res.json({ mensagem: "Logout realizado com sucesso." });
  } catch (err) {
    next(err);
  }
}

// POST /auth/mfa/enviar
// Usuário já logado solicita o código OTP — chama antes de ação sensível
export async function enviarMfa(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const email = await AuthModel.buscarEmailPorAuthId(req.user!.id);
    if (!email) {
      res
        .status(404)
        .json({
          erro: "Usuário não encontrado.",
          codigo: "USUARIO_NAO_ENCONTRADO",
        });
      return;
    }

    const { error } = await AuthModel.enviarOtpEmail(email);
    if (error) {
      res
        .status(400)
        .json({
          erro: "Não foi possível enviar o código.",
          codigo: "OTP_ENVIO_FALHOU",
        });
      return;
    }

    res.json({ mensagem: "Código enviado para o seu e-mail." });
  } catch (err) {
    next(err);
  }
}

// POST /auth/mfa/verificar
// Usuário envia o código de 6 dígitos recebido no email
export async function verificarMfa(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigo } = req.body;

    if (!codigo || typeof codigo !== "string" || !/^\d{6}$/.test(codigo)) {
      res
        .status(400)
        .json({
          erro: "Código inválido. Deve ter exatamente 6 dígitos.",
          codigo: "CODIGO_INVALIDO",
        });
      return;
    }

    const email = await AuthModel.buscarEmailPorAuthId(req.user!.id);
    if (!email) {
      res
        .status(404)
        .json({
          erro: "Usuário não encontrado.",
          codigo: "USUARIO_NAO_ENCONTRADO",
        });
      return;
    }

    const { data, error } = await AuthModel.verificarOtpEmail(email, codigo);
    if (error || !data.session) {
      res
        .status(401)
        .json({
          erro: "Código inválido ou expirado.",
          codigo: "CODIGO_INVALIDO",
        });
      return;
    }

    // Devolve novos tokens — o access_token agora tem MFA verificado
    res.json({
      mensagem: "MFA verificado com sucesso.",
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/esqueci-senha
export async function esqueciSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email } = req.body;
    if (!email || !validarEmail(email)) {
      res
        .status(400)
        .json({ erro: "Email válido obrigatório.", codigo: "EMAIL_INVALIDO" });
      return;
    }

    await AuthModel.resetarSenhaEmail(email);
    res.json({ mensagem: "E-mail de recuperação enviado." });
  } catch (err) {
    next(err);
  }
}

// PATCH /auth/alterar-senha
export async function alterarSenha(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { senha_atual, nova_senha } = req.body;

    if (!senha_atual || !nova_senha) {
      res
        .status(400)
        .json({
          erro: "senha_atual e nova_senha são obrigatórias.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    // Confirma a senha atual tentando um signIn com o email do próprio usuário
    const email = await AuthModel.buscarEmailPorAuthId(req.user!.id);
    if (!email) {
      res
        .status(404)
        .json({
          erro: "Usuário não encontrado.",
          codigo: "USUARIO_NAO_ENCONTRADO",
        });
      return;
    }

    const { error: erroLogin } = await AuthModel.signInSupabase(
      email,
      senha_atual,
    );
    if (erroLogin) {
      res
        .status(401)
        .json({
          erro: "Senha atual incorreta.",
          codigo: "SENHA_ATUAL_INVALIDA",
        });
      return;
    }

    if (!validarSenha(nova_senha)) {
      res.status(422).json({
        erro: "Senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 caractere especial.",
        codigo: "SENHA_FRACA",
      });
      return;
    }

    if (senha_atual === nova_senha) {
      res
        .status(422)
        .json({
          erro: "A nova senha deve ser diferente da atual.",
          codigo: "SENHA_IGUAL",
        });
      return;
    }

    const { error } = await AuthModel.alterarSenhaAuth(
      req.user!.id,
      nova_senha,
    );
    if (error) {
      res
        .status(400)
        .json({
          erro: "Não foi possível alterar a senha.",
          codigo: "ALTERACAO_FALHOU",
        });
      return;
    }

    res.json({ mensagem: "Senha alterada com sucesso." });
  } catch (err) {
    next(err);
  }
}

// PATCH /auth/alterar-email
export async function alterarEmail(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { senha_atual, novo_email } = req.body;

    if (!senha_atual || !novo_email) {
      res
        .status(400)
        .json({
          erro: "senha_atual e novo_email são obrigatórios.",
          codigo: "CAMPOS_OBRIGATORIOS",
        });
      return;
    }

    if (!validarEmail(novo_email)) {
      res
        .status(400)
        .json({
          erro: "novo_email válido obrigatório.",
          codigo: "EMAIL_INVALIDO",
        });
      return;
    }

    // Confirma a senha atual antes de qualquer alteração
    const emailAtual = await AuthModel.buscarEmailPorAuthId(req.user!.id);
    if (!emailAtual) {
      res
        .status(404)
        .json({
          erro: "Usuário não encontrado.",
          codigo: "USUARIO_NAO_ENCONTRADO",
        });
      return;
    }

    const { error: erroLogin } = await AuthModel.signInSupabase(
      emailAtual,
      senha_atual,
    );
    if (erroLogin) {
      res
        .status(401)
        .json({
          erro: "Senha atual incorreta.",
          codigo: "SENHA_ATUAL_INVALIDA",
        });
      return;
    }

    if (novo_email === emailAtual) {
      res
        .status(422)
        .json({
          erro: "O novo e-mail deve ser diferente do atual.",
          codigo: "EMAIL_IGUAL",
        });
      return;
    }

    const emailEmUso = await AuthModel.buscarEmailExistente(novo_email);
    if (emailEmUso) {
      res
        .status(409)
        .json({ erro: "E-mail já em uso.", codigo: "EMAIL_DUPLICADO" });
      return;
    }

    const { error } = await AuthModel.alterarEmailAuth(
      req.user!.id,
      novo_email,
    );
    if (error) {
      res
        .status(400)
        .json({
          erro: "Não foi possível alterar o e-mail.",
          codigo: "ALTERACAO_FALHOU",
        });
      return;
    }

    await AuthModel.atualizarEmailUsuario(novo_email, req.user!.id);
    res.json({ mensagem: "E-mail alterado com sucesso." });
  } catch (err) {
    next(err);
  }
}
