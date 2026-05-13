import pool from "../config/database";

const QUERY_AVISOS = `
  SELECT a.id AS id_aviso, a.titulo, a.mensagem, a.criado_em AS publicado_em,
         u.nome AS autor_nome, u.foto_url AS autor_foto_url
  FROM avisos a JOIN usuarios u ON u.id = a.id_autor
  ORDER BY a.criado_em DESC
`;

export async function listar() {
  return pool.query(QUERY_AVISOS);
}

export async function buscarIdPorAuthId(authId: string) {
  return pool.query("SELECT id FROM usuarios WHERE id_auth = $1", [authId]);
}

export async function inserir(titulo: string, mensagem: string, idAutor: number) {
  return pool.query(
    "INSERT INTO avisos (titulo, mensagem, id_autor) VALUES ($1, $2, $3) RETURNING id, criado_em",
    [titulo, mensagem, idAutor],
  );
}

export async function atualizar(idAviso: string, titulo: string, mensagem: string) {
  return pool.query(
    "UPDATE avisos SET titulo = $1, mensagem = $2 WHERE id = $3 RETURNING id",
    [titulo, mensagem, idAviso],
  );
}

export async function excluir(idAviso: string) {
  return pool.query(
    "DELETE FROM avisos WHERE id = $1 RETURNING id",
    [idAviso],
  );
}
