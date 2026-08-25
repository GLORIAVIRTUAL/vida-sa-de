// gloriaRequisicao — orçamento a partir de uma requisição de exames enviada em
// imagem ou PDF. A IA só extrai os NOMES; os valores vêm sempre do cadastro.

import { normalizarTexto } from './gloriaCore.ts';
import { extrairNomesExames } from './gloriaLlm.ts';
import { precoPorTermoCore } from './gloriaPrecos.ts';

const MAX_ITENS = 15;

// Retorna { blocos, naoRealizados } no mesmo formato usado pelo orçamento por texto.
export async function resolverRequisicaoArquivo(sr, { fileUrl }) {
  const extraido = await extrairNomesExames(sr, { fileUrl });
  const nomes = (extraido.nomes || []).map((n) => String(n || '').trim()).filter(Boolean).slice(0, MAX_ITENS);
  if (nomes.length === 0) return { blocos: [], naoRealizados: [], vazio: true };

  const blocos = [];
  const naoRealizados = [];
  for (const nome of nomes) {
    const res = await precoPorTermoCore(sr, { termo: nome });
    if (res.ok) blocos.push(...res.itens);
    else naoRealizados.push(nome);
  }

  const vistos = new Set();
  const unicos = blocos.filter((b) => {
    const k = normalizarTexto(b.nome);
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { blocos: unicos, naoRealizados, vazio: false };
}