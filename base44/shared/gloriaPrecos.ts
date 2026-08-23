// gloriaPrecos — consulta de valores SEMPRE a partir do que está cadastrado
// (Procedimento + TabelaPreco + Exame). A IA nunca informa valores próprios.

import { normalizarTexto } from './gloriaCore.ts';

const CATEGORIAS = ['Particular', 'Cartão Mais Vida'];

async function categoriasAlvo(sr) {
  const ativas = await sr.entities.CategoriaPreco.filter({ status: 'Ativo' });
  return CATEGORIAS
    .map((nome) => ativas.find((c) => normalizarTexto(c.nome) === normalizarTexto(nome)))
    .filter(Boolean);
}

// Busca por nome exato; se não achar, por conteúdo (só aceita resultado único).
function localizar(lista, termo) {
  const alvo = normalizarTexto(termo);
  if (!alvo) return null;
  const exato = lista.filter((i) => normalizarTexto(i.nome) === alvo);
  if (exato.length === 1) return exato[0];
  const palavras = alvo.split(' ').filter((p) => p.length > 2);
  const parcial = lista.filter((i) => {
    const nome = normalizarTexto(i.nome);
    return palavras.length > 0 && palavras.every((p) => nome.includes(p));
  });
  if (parcial.length === 1) return parcial[0];
  return null;
}

// Retorna { nome, valores: [{ categoria, valor }] } para um exame/procedimento/consulta.
export async function precoPorTermoCore(sr, { termo }) {
  const cats = await categoriasAlvo(sr);
  if (cats.length === 0) return { ok: false };

  const procedimentos = await sr.entities.Procedimento.filter({ status: 'Ativo' });
  const proc = localizar(procedimentos, termo);
  if (proc) {
    const tabelas = await sr.entities.TabelaPreco.filter({ procedimento_id: proc.id });
    const valores = cats
      .map((c) => {
        const achado = tabelas.find((t) => t.categoria_id === c.id && typeof t.valor === 'number' && t.valor > 0);
        return achado ? { categoria: c.nome, valor: achado.valor } : null;
      })
      .filter(Boolean);
    if (valores.length > 0) return { ok: true, nome: proc.nome, valores };
    return { ok: false };
  }

  const exames = await sr.entities.Exame.filter({ status: 'Ativo' });
  const exame = localizar(exames, termo);
  if (exame && typeof exame.valor_particular === 'number' && exame.valor_particular > 0) {
    return { ok: true, nome: exame.nome, valores: [{ categoria: 'Particular', valor: exame.valor_particular }] };
  }
  return { ok: false };
}

// Valor de consulta a partir da especialidade informada pelo cliente.
export async function precoConsultaPorEspecialidadeCore(sr, { especialidade }) {
  if (!especialidade) return { ok: false };
  return await precoPorTermoCore(sr, { termo: 'consulta ' + especialidade });
}