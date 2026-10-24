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

export function loginAdminEmail(codigo: string): EmailTemplate {
  return codeTemplate(
    "Confirme seu acesso | Impacto Gym",
    "Código de segurança solicitado para entrar na área administrativa.",
    "Confirmação de acesso",
    "Foi solicitada uma entrada na área administrativa da Impacto Gym usando sua conta.",
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

export function laudoRejeitadoEmail(motivo: string): EmailTemplate {
  const safeMotivo = escapeHtml(motivo);
  return {
    subject: "Ação necessária no seu documento | Impacto Gym",
    plainText: `O documento enviado para seu cadastro foi rejeitado.\n\nMotivo informado: ${motivo}\n\nEntre no sistema para corrigir o documento e enviá-lo novamente.`,
    html: layout(
      "Seu documento precisa de uma correção antes da aprovação do cadastro.",
      "Revise seu documento",
      `<p style="margin:0 0 20px;color:#c5c5cc;font-size:15px;line-height:1.7;">O documento enviado para análise não pôde ser aprovado. Consulte o motivo e envie uma nova versão.</p>
       <div style="margin:0 0 22px;padding:18px;background-color:#19191e;border-left:3px solid #ea3b46;border-radius:4px;">
         <p style="margin:0 0 8px;color:#9b9ba3;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Motivo informado</p>
         <p style="margin:0;color:#ffffff;font-size:14px;line-height:1.7;">${safeMotivo}</p>
       </div>
       <p style="margin:0;color:#b3b4b4;font-size:13px;line-height:1.7;">Entre no sistema para corrigir o documento e enviá-lo novamente. Seu acesso será liberado depois da análise e aprovação do cadastro.</p>`,
    ),
  };
}
