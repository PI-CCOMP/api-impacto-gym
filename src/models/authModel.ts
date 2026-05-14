import pool from "../config/database";
import { supabaseAdmin, supabaseAnon } from "../config/supabase";

export async function buscarUsuarioPorAuthId(authId: string) {
  const { rows } = await pool.query<{
    id: number;
    nome: string;
    perfil: string;
    status: string | null;
  }>(
    `SELECT u.id, u.nome, u.perfil, a.status
     FROM usuarios u
     LEFT JOIN alunos a ON a.id_usuario = u.id
     WHERE u.id_auth = $1`,
    [authId],
  );
  return rows[0] ?? null;
}

export async function buscarEmailExistente(email: string) {
  const { rows } = await pool.query("SELECT 1 FROM usuarios WHERE email = $1", [
    email,
  ]);
  return rows.length > 0;
}

// supabaseAnon — service_role bypassa verificação de senha, nunca usar aqui
export async function signInSupabase(email: string, senha: string) {
  return supabaseAnon.auth.signInWithPassword({ email, password: senha });
}

export async function resetarSenhaEmail(email: string) {
  return supabaseAdmin.auth.resetPasswordForEmail(email);
}

export async function alterarSenhaAuth(authId: string, novaSenha: string) {
  return supabaseAdmin.auth.admin.updateUserById(authId, {
    password: novaSenha,
  });
}

export async function alterarEmailAuth(authId: string, novoEmail: string) {
  return supabaseAdmin.auth.admin.updateUserById(authId, { email: novoEmail });
}

export async function atualizarEmailUsuario(novoEmail: string, authId: string) {
  return pool.query("UPDATE usuarios SET email = $1 WHERE id_auth = $2", [
    novoEmail,
    authId,
  ]);
}

export async function refreshSession(refreshToken: string) {
  return supabaseAnon.auth.refreshSession({ refresh_token: refreshToken });
}

// Revoga todos os tokens ativos do usuário (logout global)
export async function signOut(authId: string) {
  return supabaseAdmin.auth.admin.signOut(authId, 'global');
}
