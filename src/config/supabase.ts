import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error(
    "[Supabase] SUPABASE_URL, SUPABASE_SERVICE_KEY e SUPABASE_ANON_KEY são obrigatórias.",
  );
  process.exit(1);
}

/**
 * Cliente service_role — operações admin: criar/deletar usuários, storage, MFA.
 * NUNCA expor ao front-end.
 */
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Cliente anon — usado APENAS para signInWithPassword.
 * service_role bypassa a verificação de senha (autentica qualquer credencial),
 * o que seria uma falha de segurança crítica.
 */
export const supabaseAnon = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
