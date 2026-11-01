import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobServiceClient } from "@azure/storage-blob";

function nomeArquivoFoto(fotoUrl: string, idUsuario: number): string | null {
  let pathname: string;
  try {
    pathname = new URL(fotoUrl).pathname;
  } catch {
    return null;
  }
  const segmentos = pathname.split("/").filter(Boolean);
  const nomeArquivo = segmentos[segmentos.length - 1];
  const idNaUrl = segmentos[segmentos.length - 2];
  if (
    idNaUrl !== String(idUsuario) ||
    !nomeArquivo ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i.test(
      nomeArquivo,
    )
  ) {
    return null;
  }
  return nomeArquivo;
}

export function urlFotoPerfil(
  idUsuario: number,
  fotoUrl: string | null,
): string | null {
  if (!fotoUrl) return null;
  const baseUrl = (
    process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`
  ).replace(/\/$/, "");
  return `${baseUrl}/usuarios/fotos/${idUsuario}`;
}

export async function inicializarArmazenamentoFotos(): Promise<void> {
  const provider = process.env.FILE_STORAGE_PROVIDER ?? "local";
  if (process.env.NODE_ENV === "production" && provider !== "azure") {
    throw new Error("Fotos de produção devem usar FILE_STORAGE_PROVIDER=azure.");
  }
  if (provider === "local") return;
  if (provider !== "azure") {
    throw new Error(`FILE_STORAGE_PROVIDER inválido: ${provider}`);
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName =
    process.env.AZURE_STORAGE_PHOTOS_CONTAINER ?? "fotos-perfil";
  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING é necessária para FILE_STORAGE_PROVIDER=azure.",
    );
  }
  const container = BlobServiceClient.fromConnectionString(
    connectionString,
  ).getContainerClient(containerName);
  await container.createIfNotExists();
  await container.setAccessPolicy(undefined);
}

export async function armazenarFotoPerfil(
  idUsuario: number,
  conteudo: Buffer,
): Promise<string> {
  const provider = process.env.FILE_STORAGE_PROVIDER ?? "local";
  const nomeArquivo = `${randomUUID()}.webp`;

  if (provider === "azure") {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName =
      process.env.AZURE_STORAGE_PHOTOS_CONTAINER ?? "fotos-perfil";
    if (!connectionString) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING é necessária para FILE_STORAGE_PROVIDER=azure.",
      );
    }

    const service = BlobServiceClient.fromConnectionString(connectionString);
    const container = service.getContainerClient(containerName);
    await container.createIfNotExists();
    const blobName = `${idUsuario}/${nomeArquivo}`;
    const blob = container.getBlockBlobClient(blobName);
    await blob.uploadData(conteudo, {
      blobHTTPHeaders: {
        blobContentType: "image/webp",
        blobCacheControl: "private, max-age=86400",
      },
    });
    const settings = Object.fromEntries(
      connectionString
        .split(";")
        .filter((setting) => setting.includes("="))
        .map((setting) => {
          const separator = setting.indexOf("=");
          return [
            setting.slice(0, separator).toLowerCase(),
            setting.slice(separator + 1),
          ] as const;
        }),
    );
    const endpoint = settings.blobendpoint
      ? settings.blobendpoint
      : settings.accountname
        ? `https://${settings.accountname}.blob.core.windows.net`
        : null;
    if (!endpoint) {
      throw new Error("A connection string do Azure não informa o endpoint Blob.");
    }
    const encodedBlobName = blobName
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${endpoint.replace(/\/$/, "")}/${containerName}/${encodedBlobName}`;
  }

  if (provider !== "local") {
    throw new Error(`FILE_STORAGE_PROVIDER inválido: ${provider}`);
  }

  const pastaFotos = path.resolve(
    process.env.UPLOAD_DIR ?? "uploads",
    "fotos",
    String(idUsuario),
  );
  await mkdir(pastaFotos, { recursive: true });
  await writeFile(path.join(pastaFotos, nomeArquivo), conteudo, {
    flag: "wx",
  });
  const baseUrl = (
    process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`
  ).replace(/\/$/, "");
  return `${baseUrl}/uploads/fotos/${idUsuario}/${nomeArquivo}`;
}

export async function obterFotoPerfil(
  idUsuario: number,
  fotoUrl: string | null,
): Promise<Buffer | null> {
  if (!fotoUrl) return null;
  const nomeArquivo = nomeArquivoFoto(fotoUrl, idUsuario);
  if (!nomeArquivo) return null;
  const provider = process.env.FILE_STORAGE_PROVIDER ?? "local";

  if (provider === "azure") {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName =
      process.env.AZURE_STORAGE_PHOTOS_CONTAINER ?? "fotos-perfil";
    if (!connectionString) {
      throw new Error(
        "AZURE_STORAGE_CONNECTION_STRING é necessária para FILE_STORAGE_PROVIDER=azure.",
      );
    }
    const service = BlobServiceClient.fromConnectionString(connectionString);
    const blob = service
      .getContainerClient(containerName)
      .getBlockBlobClient(`${idUsuario}/${nomeArquivo}`);
    try {
      return await blob.downloadToBuffer();
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "BlobNotFound"
      ) {
        return null;
      }
      throw error;
    }
  }

  if (provider !== "local") {
    throw new Error(`FILE_STORAGE_PROVIDER inválido: ${provider}`);
  }

  const caminho = path.resolve(
    process.env.UPLOAD_DIR ?? "uploads",
    "fotos",
    String(idUsuario),
    nomeArquivo,
  );
  try {
    return await readFile(caminho);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}
