// gloriaCartao — informações do Cartão Mais Vida Saúde, lidas do cadastro
// de informações institucionais (ChatbotConfig), nunca de valores fixos no código.

const INICIO = 'CARTÃO MAIS VIDA';
const FIM = 'AUXÍLIO FUNERAL';

async function textoInstitucional(sr) {
  const ativos = await sr.entities.ChatbotConfig.filter({ ativo: true });
  const config = ativos[0] || (await sr.entities.ChatbotConfig.list())[0];
  return config?.informacoes_institucionais || '';
}

// Retorna o trecho cadastrado sobre o cartão, ou null se não houver.
export async function infoCartaoCore(sr) {
  const texto = await textoInstitucional(sr);
  const inicio = texto.indexOf(INICIO);
  if (inicio < 0) return null;
  const depois = texto.indexOf(FIM, inicio + INICIO.length);
  const trecho = (depois > inicio ? texto.slice(inicio, depois) : texto.slice(inicio)).trim();
  return trecho.length > 20 ? trecho : null;
}