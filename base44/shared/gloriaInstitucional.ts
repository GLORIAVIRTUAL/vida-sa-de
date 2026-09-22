import { normalizarTexto } from './gloriaCore.ts';

export async function textoInstitucional(sr) {
  const ativos = await sr.entities.ChatbotConfig.filter({ ativo: true });
  const config = ativos[0] || (await sr.entities.ChatbotConfig.list())[0];
  return config?.informacoes_institucionais || '';
}

export async function enderecoClinica(sr) {
  const linhas = (await textoInstitucional(sr)).split(/\r?\n/).map(l => l.trim());
  const endereco = linhas.find(l => /^endere[cç]o\s*:/i.test(l));
  if (!endereco) return null;
  const mapa = linhas.find(l => /^localiza[cç][aã]o\s*:\s*https:\/\//i.test(l));
  return [endereco, mapa].filter(Boolean).join('\n\n');
}

export function perguntaEndereco(texto) {
  const t = normalizarTexto(texto);
  return /\b(endereco|localizacao|como chegar)\b/.test(t) || /\bonde\s+(fica|e|esta|voces ficam)\b/.test(t);
}