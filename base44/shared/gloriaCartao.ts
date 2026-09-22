// gloriaCartao — informações do Cartão Mais Vida Saúde, lidas do cadastro
// de informações institucionais (ChatbotConfig), nunca de valores fixos no código.

import { textoInstitucional } from './gloriaInstitucional.ts';
import { normalizarTexto } from './gloriaCore.ts';

// Só a seção do cartão: nunca começar em uma menção dentro de outro preço.
export async function infoCartaoCore(sr) {
  const linhas = (await textoInstitucional(sr)).split(/\r?\n/);
  const inicio = linhas.findIndex(l => /^\s*[*#]*\s*cart[aã]o\s+mais\s+vida(?:\s+sa[uú]de)?\s*[*:]*\s*$/i.test(l));
  if (inicio < 0) return null;
  const permitidos = /^(planos|beneficios|carencias|auxilio funeral|lojas parceiras|documentos|como aderir)/;
  const saida = [linhas[inicio].trim()];
  for (const linha of linhas.slice(inicio + 1)) {
    const l = linha.trim();
    const normal = normalizarTexto(l.replace(/^[*#\s]+|[*:]+$/g, ''));
    if (/^[-=_]{3,}$/.test(l)) break;
    const titulo = l && !/^[-•\d]/.test(l) && l === l.toUpperCase() && /[A-ZÀ-Ú]/.test(l);
    if (titulo && !permitidos.test(normal)) break;
    if (/\b(sempre|nunca|forneca|mostre|informe|pergunte|solicite|sugira|verifique|realize|deve|cliente|assistente|prompt)\b/.test(normal)) continue;
    saida.push(l);
  }
  return saida.join('\n').trim() || null;
}