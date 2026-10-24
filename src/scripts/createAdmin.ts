import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pool from "../config/database";
import { validarCpf, validarEmail, validarSenha } from "../utils/validate";

dotenv.config();

async function main(): Promise<void> {
  const nome = process.env.ADMIN_NAME?.trim();
  const cpf = process.env.ADMIN_CPF?.replace(/\D/g, "");
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.ADMIN_PASSWORD;

  if (!nome || nome.length < 3 || !cpf || !email || !senha) {
    throw new Error(
      "Defina ADMIN_NAME, ADMIN_CPF, ADMIN_EMAIL e ADMIN_PASSWORD no .env.",
    );
  }
  if (!validarCpf(cpf) || !validarEmail(email) || !validarSenha(senha)) {
    throw new Error("CPF, e-mail ou senha não atendem aos critérios da API.");
  }

  const hash = await bcrypt.hash(senha, 12);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO usuarios (nome, cpf, email, senha_hash, sexo, perfil, email_verificado)
     VALUES ($1, $2, $3, $4, 'O', 'admin', true)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [nome, cpf, email, hash],
  );

  if (rows.length === 0) {
    throw new Error("Já existe um usuário com esse CPF ou e-mail.");
  }
  console.log(`Administrador criado com id ${rows[0].id}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Erro ao criar admin.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });