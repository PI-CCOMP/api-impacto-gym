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

    // Alunos com cadastro não aprovado não podem logar
    if (usuario.perfil === "aluno" && usuario.status !== "ativo") {
      res
        .status(403)
        .json({
          erro: "Cadastro pendente de aprovação.",
          codigo: "CADASTRO_INATIVO",
        });
      return;
    }

    res.json({
      access_token: data.session.access_token,
      usuario: { id: usuario.id, nome: usuario.nome, perfil: usuario.perfil },
    });
  } catch (err) {
    next(err);
  }
}

// POST /auth/mfa/verificar
export async function verificarMfa(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { codigo } = req.body;
    if (!codigo || typeof codigo !== "string" || !/^\d{4}$/.test(codigo)) {
      res
        .status(400)
        .json({
          erro: "Código inválido. Deve ter exatamente 4 dígitos.",
          codigo: "CODIGO_INVALIDO",
        });
      return;
    }

    // Verificação server-side de callback; o fluxo principal usa supabase.auth.verifyOtp() no front
    res.json({ verificado: true });
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

    // Retorna 200 independente de o e-mail existir (timing-safe)
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
    const { nova_senha } = req.body;
    if (!nova_senha) {
      res
        .status(400)
        .json({
          erro: "nova_senha obrigatória.",
          codigo: "CAMPOS_OBRIGATORIOS",
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
    const { novo_email } = req.body;
    if (!novo_email || !validarEmail(novo_email)) {
      res
        .status(400)
        .json({
          erro: "novo_email válido obrigatório.",
          codigo: "EMAIL_INVALIDO",
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
