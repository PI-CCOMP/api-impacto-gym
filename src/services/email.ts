import { EmailClient } from "@azure/communication-email";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EmailTemplate } from "./emailTemplates";

let emailClient: EmailClient | undefined;
let impactoGymLogoBase64: string | undefined;

function getImpactoGymLogoBase64(): string {
  if (impactoGymLogoBase64) return impactoGymLogoBase64;

  const logoCandidates = [
    path.resolve(__dirname, "impacto-gym-email-logo.png"),
    path.resolve(
      process.cwd(),
      "src",
      "services",
      "impacto-gym-email-logo.png",
    ),
  ];
  const logoPath = logoCandidates.find((candidate) => existsSync(candidate));
  if (!logoPath)
    throw new Error("Logo de e-mail da Impacto Gym não encontrado.");

  impactoGymLogoBase64 = readFileSync(logoPath).toString("base64");
  return impactoGymLogoBase64;
}

// Usar apenas em DEV
const emailDesabilitado =
  process.env.NODE_ENV !== "production" && process.env.DISABLE_EMAIL === "true";

export async function enviarEmail(
  destinatario: string,
  template: EmailTemplate,
): Promise<void> {
  // usar apenas em DEV
  if (emailDesabilitado) {
    console.log(
      `\n[EMAIL DEV] Para: ${destinatario}\nAssunto: ${template.subject}\n${template.plainText}\n`,
    );
    return;
  }

  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const remetente = process.env.AZURE_COMMUNICATION_SENDER_EMAIL;
  if (!connectionString || !remetente) {
    throw new Error(
      "Configure AZURE_COMMUNICATION_CONNECTION_STRING e AZURE_COMMUNICATION_SENDER_EMAIL.",
    );
  }

  try {
    emailClient ??= new EmailClient(connectionString);
    const poller = await emailClient.beginSend({
      senderAddress: remetente,
      recipients: { to: [{ address: destinatario }] },
      content: {
        subject: template.subject,
        plainText: template.plainText,
        html: template.html,
      },
      attachments: [
        {
          name: "impacto-gym-logo.png",
          contentType: "image/png",
          contentInBase64: getImpactoGymLogoBase64(),
          contentId: "impacto-gym-logo",
        },
      ],
    });
    await poller.pollUntilDone();
  } catch (error) {
    const details = error as {
      name?: unknown;
      code?: unknown;
      statusCode?: unknown;
    };
    console.error("[ACS_EMAIL] Falha ao enviar e-mail", {
      name: typeof details?.name === "string" ? details.name : "UnknownError",
      code: typeof details?.code === "string" ? details.code : undefined,
      statusCode:
        typeof details?.statusCode === "number"
          ? details.statusCode
          : undefined,
    });
    const safeError = new Error(
      "Falha ao enviar e-mail pelo Azure Communication Services.",
    );
    Object.assign(safeError, { cause: error });
    throw safeError;
  }
}
