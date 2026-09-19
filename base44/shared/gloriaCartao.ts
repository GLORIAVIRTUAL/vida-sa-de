// gloriaCartao — informações do Cartão Mais Vida Saúde, lidas do cadastro
// de informações institucionais (ChatbotConfig), nunca de valores fixos no código.

const INICIO = /cart[aã]o\s+mais\s+vida/i;

async function textoInstitucional(sr) {
  const ativos = await sr.entities.ChatbotConfig.filter({ ativo: true });
  const config = ativos[0] || (await sr.entities.ChatbotConfig.list())[0];
  return config?.informacoes_institucionais || '';
}

// Retorna o trecho cadastrado sobre o cartão, ou null se não houver.
// Inclui todos os benefícios cadastrados, sem truncar o material institucional.
export async function infoCartaoCore(sr) {
  const texto = await textoInstitucional(sr);
  const inicio = texto.search(INICIO);
  if (inicio < 0) return null;
  const trecho = texto.slice(inicio).trim();
  return trecho || null;
}
