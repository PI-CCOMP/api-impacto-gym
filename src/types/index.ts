//  Perfis
export type Perfil = "admin" | "instrutor" | "recepcionista" | "aluno";

//  Payload JWT (extraído pelo middleware de auth)
export interface UsuarioToken {
  id: string; // UUID do Supabase Auth (id_auth)
  id_usuario: number; // PK numérica da tabela usuarios
  perfil: Perfil;
  mfa_verificado?: boolean;
}

//  Enums aceitos pela API
export const PERFIS_VALIDOS: Perfil[] = [
  "admin",
  "instrutor",
  "recepcionista",
  "aluno",
];

export type Sexo = "M" | "F" | "O";
export const SEXOS_VALIDOS: Sexo[] = ["M", "F", "O"];

export type Objetivo =
  | "hipertrofia"
  | "emagrecimento"
  | "condicionamento"
  | "forca"
  | "recomendacao_medica";
export const OBJETIVOS_VALIDOS: Objetivo[] = [
  "hipertrofia",
  "emagrecimento",
  "condicionamento",
  "forca",
  "recomendacao_medica",
];

export type Nivel = "iniciante" | "intermediario" | "avancado";
export const NIVEIS_VALIDOS: Nivel[] = [
  "iniciante",
  "intermediario",
  "avancado",
];

export type GrupoMuscular =
  | "Peitoral"
  | "Costas"
  | "Bracos"
  | "Pernas"
  | "Abdomen";
export const GRUPOS_MUSCULARES_VALIDOS: GrupoMuscular[] = [
  "Peitoral",
  "Costas",
  "Bracos",
  "Pernas",
  "Abdomen",
];

export type Deficiencia =
  | "nenhuma"
  | "visual"
  | "auditiva"
  | "motora"
  | "intelectual"
  | "multipla"
  | "outra";
export const DEFICIENCIAS_VALIDAS: Deficiencia[] = [
  "nenhuma",
  "visual",
  "auditiva",
  "motora",
  "intelectual",
  "multipla",
  "outra",
];

export type RestricaoMedica =
  | "nenhuma"
  | "problemas_cardiacos"
  | "dores_no_peito"
  | "tontura_ou_desmaios"
  | "problemas_osseos"
  | "medicamentos"
  | "cirurgias_recentes"
  | "outra";
export const RESTRICOES_VALIDAS: RestricaoMedica[] = [
  "nenhuma",
  "problemas_cardiacos",
  "dores_no_peito",
  "tontura_ou_desmaios",
  "problemas_osseos",
  "medicamentos",
  "cirurgias_recentes",
  "outra",
];

export type StatusCadastro = "pendente" | "ativo" | "rejeitado" | "inativo";
export type StatusDocumento = "pendente" | "aprovado" | "rejeitado";
export type StatusSolicitacao = "aberto" | "atendido" | "cancelado";
export type StatusSessao = "em_andamento" | "finalizado" | "abandonado";

//  Extensão do Request do Express
declare global {
  namespace Express {
    interface Request {
      user?: UsuarioToken;
    }
  }
}
