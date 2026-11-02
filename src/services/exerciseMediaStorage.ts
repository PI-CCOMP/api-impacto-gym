import { BlobServiceClient } from "@azure/storage-blob";

export type TipoMidiaExercicio = "foto" | "video" | "ativacao";

function containerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error(
      "AZURE_STORAGE_CONNECTION_STRING é necessária para armazenar mídias de exercícios.",
    );
  }
  const containerName =
    process.env.AZURE_STORAGE_CONTAINER_EXERCICIOS ?? "exercicios";
  return BlobServiceClient.fromConnectionString(
    connectionString,
  ).getContainerClient(containerName);
}

export function urlMidiaExercicio(
  idExercicio: string | number,
  tipo: TipoMidiaExercicio,
  versao?: string,
): string {
  const url = `/exercicios/${idExercicio}/midia/${tipo}`;
  return versao ? `${url}?v=${encodeURIComponent(versao)}` : url;
}

export async function armazenarMidiaExercicio(
  idExercicio: string,
  tipo: TipoMidiaExercicio,
  conteudo: Buffer,
  contentType: string,
): Promise<void> {
  const container = containerClient();
  await container.createIfNotExists();
  await container.setAccessPolicy(undefined);
  const blob = container.getBlockBlobClient(`${idExercicio}/${tipo}`);
  await blob.uploadData(conteudo, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: "private, max-age=3600",
    },
  });
}

export async function obterMidiaExercicio(
  idExercicio: string,
  tipo: TipoMidiaExercicio,
): Promise<{ conteudo: Buffer; contentType: string } | null> {
  const blob = containerClient()
    .getBlockBlobClient(`${idExercicio}/${tipo}`);
  try {
    const [conteudo, properties] = await Promise.all([
      blob.downloadToBuffer(),
      blob.getProperties(),
    ]);
    return {
      conteudo,
      contentType: properties.contentType ?? "application/octet-stream",
    };
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
