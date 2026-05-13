/**
 * RN33 — Política de complexidade de senha:
 * mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número, 1 caractere especial.
 */
export function validarSenha(senha: string): boolean {
  if (senha.length < 8) return false;
  if (!/[A-Z]/.test(senha)) return false;
  if (!/[a-z]/.test(senha)) return false;
  if (!/[0-9]/.test(senha)) return false;
  if (!/[^A-Za-z0-9]/.test(senha)) return false;
  return true;
}

/** Valida CPF com verificação dos dígitos verificadores */
export function validarCpf(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, "");
  if (nums.length !== 11) return false;
  // Rejeita sequências inválidas conhecidas (todos iguais)
  if (/^(\d)\1{10}$/.test(nums)) return false;

  // Primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(nums[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(nums[9])) return false;

  // Segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(nums[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(nums[10])) return false;

  return true;
}

/** Valida formato básico de e-mail */
export function validarEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Gera nome de arquivo seguro (sem path traversal) */
export function nomeArquivoSeguro(original: string): string {
  const ext =
    original
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "") ?? "bin";
  return `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}
