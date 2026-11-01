import * as AuthModel from "../models/authModel";
import { enviarEmail } from "./email";
import { alteracaoEmail, cadastroEmail, conviteContaEmail } from "./emailTemplates";
import { gerarCodigoEmail, hashCodigoEmail } from "../utils/emailCode";

export async function enviarCodigoVerificacaoCadastro(
  idUsuario: number,
  email: string,
): Promise<boolean> {
  const codigo = gerarCodigoEmail();
  const salvo = await AuthModel.salvarCodigoEmail(
    idUsuario,
    "verificacao_cadastro",
    hashCodigoEmail(codigo),
  );
  if (!salvo) return false;
  await enviarEmail(email, cadastroEmail(codigo));
  return true;
}

export async function enviarConviteConta(
  idUsuario: number,
  email: string,
  nome: string,
): Promise<boolean> {
  const codigo = gerarCodigoEmail();
  const salvo = await AuthModel.salvarCodigoEmail(
    idUsuario,
    "convite_conta",
    hashCodigoEmail(codigo),
  );
  if (!salvo) return false;
  await enviarEmail(email, conviteContaEmail(nome, codigo));
  return true;
}

export async function enviarCodigoAlteracaoEmail(
  idUsuario: number,
  email: string,
): Promise<boolean> {
  const codigo = gerarCodigoEmail();
  const salvo = await AuthModel.salvarCodigoEmail(
    idUsuario,
    "alteracao_email",
    hashCodigoEmail(codigo),
  );
  if (!salvo) return false;
  await enviarEmail(email, alteracaoEmail(codigo));
  return true;
}
