export function normalizarListaEnum<T extends string>(
  value: unknown,
  opcoes: readonly T[],
  valorNenhum: T,
): T[] | null {
  const valores = Array.isArray(value) ? value : [value];

  const normalizados: T[] = [];
  for (const item of valores) {
    if (typeof item !== "string") return null;
    const valor = item;
    const chave = valor
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
    const opcao = opcoes.find((item) => item === chave);
    if (!opcao) return null;
    if (!normalizados.includes(opcao)) normalizados.push(opcao);
  }

  if (normalizados.length === 0) return [valorNenhum];
  if (normalizados.includes(valorNenhum) && normalizados.length > 1) return null;
  return normalizados;
}

export function listaTemValor<T extends string>(
  valores: readonly T[] | null | undefined,
  valorNenhum: T,
): boolean {
  return Boolean(valores?.some((valor) => valor !== valorNenhum));
}
