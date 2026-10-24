import * as AuthModel from "../models/authModel";
import { enviarEmail } from "./email";
import { cadastroEmail } from "./emailTemplates";
import { gerarCodigoEmail, hashCodigoEmail } from "../utils/emailCode";

export async function enviarCodigoVerificacaoCadastro(
  idUsuario: number,
  email: string,
): Promise<void> {
  const codigo = gerarCodigoEmail();
  await AuthModel.salvarCodigoEmail(
    idUsuario,
    "verificacao_cadastro",
    hashCodigoEmail(codigo),
  );
  await enviarEmail(email, cadastroEmail(codigo));
}
