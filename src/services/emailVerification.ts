import * as AuthModel from "../models/authModel";
import { enviarEmail } from "./email";
import { cadastroEmail } from "./emailTemplates";
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
