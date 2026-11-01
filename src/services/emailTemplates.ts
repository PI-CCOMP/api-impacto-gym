export interface EmailTemplate {
  subject: string;
  plainText: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function layout(preheader: string, title: string, content: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#1e1e22;font-family:Arial,Helvetica,sans-serif;color:#e3e3e3;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#1e1e22;width:100%;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#111111;border:1px solid #303036;border-radius:8px;overflow:hidden;">
          <tr><td height="4" style="height:4px;background-color:#1a63e5;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" style="padding:28px 32px 20px;border-bottom:1px solid #303036;text-align:center;">
              <table role="presentation" align="center" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
                <tr>
                  <td width="36" height="36" align="center" valign="middle" style="width:36px;height:36px;">
                    <img src="cid:impacto-gym-logo" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border:0;outline:none;text-decoration:none;">
                  </td>
                  <td style="padding-left:10px;color:#ffffff;font-size:17px;font-weight:700;white-space:nowrap;">Impacto <span style="color:#1a63e5;">Gym</span></td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 10px;color:#8eaef0;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Impacto Gym · Conta e segurança</p>
              <h1 style="margin:0 0 16px;color:#ffffff;font-size:25px;line-height:1.25;font-weight:700;">${escapeHtml(title)}</h1>
              ${content}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 24px;border-top:1px solid #303036;color:#9b9ba3;font-size:12px;line-height:1.6;">
              Esta é uma mensagem automática da Impacto Gym. Não responda a este e-mail.<br>
              Se você não solicitou esta ação, ignore a mensagem e mantenha sua senha segura.
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;color:#777780;font-size:11px;line-height:1.5;">Treino com acompanhamento. Cuidado em cada etapa.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function codeTemplate(
  subject: string,
  preheader: string,
  title: string,
  introduction: string,
  code: string,
  instruction: string,
): EmailTemplate {
  const safeCode = escapeHtml(code);
  const html = layout(
    preheader,
    title,
    `<p style="margin:0 0 24px;color:#c5c5cc;font-size:15px;line-height:1.7;">${escapeHtml(introduction)}</p>
     <div style="margin:0 0 22px;padding:20px 16px;background-color:#19191e;border:1px solid #34343c;border-radius:6px;text-align:center;">
       <p style="margin:0 0 8px;color:#9b9ba3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Seu código</p>
       <p style="margin:0;color:#ffffff;font-family:Consolas,'Courier New',monospace;font-size:32px;line-height:1.3;font-weight:700;letter-spacing:8px;white-space:nowrap;">${safeCode}</p>
     </div>
     <p style="margin:0;color:#b3b4b4;font-size:13px;line-height:1.7;">${escapeHtml(instruction)}</p>`,
  );

  return {
    subject,
    plainText: `${title}\n\n${introduction}\n\nCódigo: ${code}\n\n${instruction}\n\n${preheader}`,
    html,
  };
}

export function cadastroEmail(codigo: string): EmailTemplate {
  return codeTemplate(
    "Confirme seu e-mail | Impacto Gym",
    "Use o código para confirmar o e-mail da sua conta Impacto Gym.",
    "Confirme seu e-mail",
    "Recebemos seu cadastro na Impacto Gym. Confirme que este endereço de e-mail é seu para continuar.",
    codigo,
    "O código expira em 10 minutos. Depois da confirmação, seu cadastro seguirá para análise da academia.",
  );
}

export function conviteContaEmail(nome: string, codigo: string): EmailTemplate {
  return codeTemplate(
    "Sua conta foi criada | Impacto Gym",
    "Use o código para definir a senha da sua conta Impacto Gym.",
    "Defina sua senha",
    `Olá, ${nome}! A Impacto Gym criou uma conta para você. Use o código abaixo para definir sua senha.`,
    codigo,
    "O código expira em 10 minutos e só pode ser usado uma vez. Se expirar, use “Esqueci minha senha” com este e-mail.",
  );
}

export function loginAdminEmail(codigo: string): EmailTemplate {
  return codeTemplate(
    "Confirme seu acesso | Impacto Gym",
    "Código de segurança solicitado para entrar na sua conta da equipe.",
    "Confirmação de acesso",
    "Foi solicitada uma entrada na sua conta da equipe Impacto Gym.",
    codigo,
    "O código expira em 10 minutos e só pode ser usado uma vez. Se não foi você, ignore esta mensagem e altere sua senha.",
  );
}

export function recuperacaoSenhaEmail(codigo: string): EmailTemplate {
  return codeTemplate(
    "Recuperação de senha | Impacto Gym",
    "Use o código para redefinir a senha da sua conta Impacto Gym.",
    "Redefina sua senha",
    "Recebemos uma solicitação para redefinir a senha da sua conta.",
    codigo,
    "O código expira em 10 minutos e só pode ser usado uma vez. Se você não solicitou a alteração, ignore este e-mail.",
  );
}

export function alteracaoEmail(codigo: string): EmailTemplate {
  return codeTemplate(
    "Confirme seu novo e-mail | Impacto Gym",
    "Use o código para confirmar a alteração do e-mail da sua conta.",
    "Confirme seu novo e-mail",
    "Recebemos uma solicitação para alterar o e-mail da sua conta Impacto Gym.",
    codigo,
    "O código expira em 10 minutos. Seu e-mail atual continua válido até a confirmação deste novo endereço.",
  );
}

export function laudoRejeitadoEmail(
  motivo: string,
  revisaoMedica?: { pendente: boolean; prazo: Date | string | null },
): EmailTemplate {
  const safeMotivo = escapeHtml(motivo);
  const prazoRevisao =
    revisaoMedica?.pendente && revisaoMedica.prazo
      ? new Date(revisaoMedica.prazo).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        })
      : null;
  const orientacao = prazoRevisao
    ? `Sua revisão médica está pendente. Envie um novo laudo até ${prazoRevisao}. Seu acesso permanece disponível enquanto o prazo estiver vigente; depois do vencimento, ficará bloqueado até a aprovação. O envio tardio continua permitido.`
    : "Seu cadastro continua pendente. Envie uma nova versão do documento; o acesso só será liberado após a aprovação do laudo e do cadastro.";
  return {
    subject: "Ação necessária no seu documento | Impacto Gym",
    plainText: `O documento enviado para análise foi rejeitado.\n\nMotivo informado: ${motivo}\n\n${orientacao}`,
    html: layout(
      "Seu documento precisa de correção antes de ser aprovado.",
      "Revise seu documento",
      `<p style="margin:0 0 20px;color:#c5c5cc;font-size:15px;line-height:1.7;">O documento enviado para análise não pôde ser aprovado. Consulte o motivo e envie uma nova versão.</p>
       <div style="margin:0 0 22px;padding:18px;background-color:#19191e;border-left:3px solid #ea3b46;border-radius:4px;">
         <p style="margin:0 0 8px;color:#9b9ba3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Motivo informado</p>
         <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.7;">${safeMotivo}</p>
       </div>
       <p style="margin:0;color:#b3b4b4;font-size:13px;line-height:1.7;">${escapeHtml(orientacao)}</p>`,
    ),
  };
}

export function laudoSolicitadoEmail(prazo: Date | string): EmailTemplate {
  const data = new Date(prazo).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const textoPrazo = `Envie um novo laudo médico até ${data}. Após esse prazo, seu acesso ficará bloqueado até a análise e aprovação do documento.`;
  return {
    subject: "Envie um novo laudo médico | Impacto Gym",
    plainText: `Seus dados médicos foram atualizados.\n\n${textoPrazo}\n\nSe você acredita que esta mensagem foi enviada por engano, entre em contato com a academia.`,
    html: layout(
      "Seus dados médicos foram atualizados e precisam de uma nova análise.",
      "Envie um novo laudo médico",
      `<p style="margin:0 0 20px;color:#c5c5cc;font-size:15px;line-height:1.7;">Seus dados médicos foram atualizados e precisam de uma nova análise.</p>
       <div style="margin:0 0 22px;padding:18px;background-color:#19191e;border-left:3px solid #1a63e5;border-radius:4px;">
         <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.7;">${escapeHtml(textoPrazo)}</p>
       </div>
       <p style="margin:0;color:#b3b4b4;font-size:13px;line-height:1.7;">Acesse sua conta e envie o documento atualizado. Se você acredita que esta mensagem foi enviada por engano, entre em contato com a academia.</p>`,
    ),
  };
}

export function laudoPendenteAtualizadoEmail(
  prazo: Date | string,
  laudoAnteriorInvalidado: boolean,
): EmailTemplate {
  const data = new Date(prazo).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const orientacao = laudoAnteriorInvalidado
    ? `Como seus dados médicos foram atualizados antes da aprovação do cadastro, o laudo anterior não corresponde mais às informações atuais e foi invalidado. Envie um novo laudo até ${data}. O envio após essa data continua permitido, mas o cadastro só poderá ser aprovado depois da análise do novo documento.`
    : `Como seus dados médicos foram atualizados antes da aprovação do cadastro, é necessário enviar um laudo correspondente às informações atuais até ${data}. O envio após essa data continua permitido, mas o cadastro só poderá ser aprovado depois da análise do documento.`;
  return {
    subject: "Envie um laudo médico atualizado | Impacto Gym",
    plainText: `Seu cadastro continua em análise.\n\n${orientacao}\n\nSe você acredita que esta mensagem foi enviada por engano, entre em contato com a academia.`,
    html: layout(
      "Seu cadastro continua pendente e precisa de um laudo atualizado.",
      "Envie um laudo atualizado",
      `<p style="margin:0 0 20px;color:#c5c5cc;font-size:15px;line-height:1.7;">Seu cadastro continua em análise.</p>
       <div style="margin:0 0 22px;padding:18px;background-color:#19191e;border-left:3px solid #1a63e5;border-radius:4px;">
         <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.7;">${escapeHtml(orientacao)}</p>
       </div>
       <p style="margin:0;color:#b3b4b4;font-size:13px;line-height:1.7;">Se você acredita que esta mensagem foi enviada por engano, entre em contato com a academia.</p>`,
    ),
  };
}
