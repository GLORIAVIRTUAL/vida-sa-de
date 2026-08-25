// gloriaPrecos — consulta de valores SEMPRE a partir do que está cadastrado
// (Procedimento + TabelaPreco + Exame). A IA nunca informa valores próprios.

import { normalizarTexto } from './gloriaCore.ts';

const MAX_VARIACOES = 6;

// Todas as categorias ativas são consideradas; "Particular" sempre primeiro.
async function categoriasAlvo(sr) {
  const ativas = await sr.entities.CategoriaPreco.filter({ status: 'Ativo' });
  return ativas.slice().sort((a, b) => {
    const pa = normalizarTexto(a.nome) === 'particular' ? 0 : 1;
    const pb = normalizarTexto(b.nome) === 'particular' ? 0 : 1;
    return pa - pb || String(a.nome).localeCompare(String(b.nome));
  });
}

// Nomes das categorias/convênios ativos (para oferecer ao cliente).
export async function categoriasPrecoCore(sr) {
  const cats = await categoriasAlvo(sr);
  return cats.map((c) => c.nome);
}

// Distância de edição simples, para tolerar pequenos erros de digitação.
function distancia(a, b) {
  const m = a.length, n = b.length;
  let linha = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const nova = [i];
    for (let j = 1; j <= n; j++) {
      nova[j] = Math.min(
        linha[j] + 1,
        nova[j - 1] + 1,
        linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    linha = nova;
  }
  return linha[n];
}

function parecido(a, b) {
  if (Math.abs(a.length - b.length) > 2) return false;
  const limite = Math.min(a.length, b.length) >= 7 ? 2 : 1;
  return distancia(a, b) <= limite;
}

// Busca por nome exato; senão por conteúdo. Pode retornar várias variações
// (ex: "Hidroginástica 1x/2x/3x") para que todas sejam informadas ao cliente.
function localizar(lista, termo) {
  const alvo = normalizarTexto(termo);
  if (!alvo) return [];
  const exato = lista.filter((i) => normalizarTexto(i.nome) === alvo);
  if (exato.length > 0) return exato;
  const palavras = alvo.split(' ').filter((p) => p.length > 2);
  if (palavras.length === 0) return [];
  let parcial = lista.filter((i) => {
    const nome = normalizarTexto(i.nome);
    return palavras.every((p) => nome.includes(p));
  });
  // Tolera erros de digitação do cliente ("acografia" → "ecografia").
  if (parcial.length === 0) {
    parcial = lista.filter((i) => {
      const nomeP = normalizarTexto(i.nome).split(' ').filter(Boolean);
      return palavras.every((p) => nomeP.some((n) => n.includes(p) || parecido(n, p)));
    });
  }
  return parcial
    .slice()
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
    .slice(0, MAX_VARIACOES);
}

// Retorna { ok, itens: [{ nome, valores: [{ categoria, valor }] }] }.
export async function precoPorTermoCore(sr, { termo }) {
  const cats = await categoriasAlvo(sr);
  if (cats.length === 0) return { ok: false };

  const procedimentos = await sr.entities.Procedimento.filter({ status: 'Ativo' });
  const procs = localizar(procedimentos, termo);
  if (procs.length > 0) {
    const itens = [];
    for (const proc of procs) {
      const tabelas = await sr.entities.TabelaPreco.filter({ procedimento_id: proc.id });
      const valores = cats
        .map((c) => {
          const achado = tabelas.find((t) => t.categoria_id === c.id && typeof t.valor === 'number' && t.valor > 0);
          return achado ? { categoria: c.nome, valor: achado.valor } : null;
        })
        .filter(Boolean);
      if (valores.length > 0) itens.push({ nome: proc.nome, valores, especialidade: proc.especialidade || '' });
    }
    if (itens.length > 0) return { ok: true, itens };
    return { ok: false };
  }

  const exames = await sr.entities.Exame.filter({ status: 'Ativo' });
  const encontrados = localizar(exames, termo).filter(
    (e) => typeof e.valor_particular === 'number' && e.valor_particular > 0
  );
  if (encontrados.length > 0) {
    return {
      ok: true,
      itens: encontrados.map((e) => ({
        nome: e.nome,
        valores: [{ categoria: 'Particular', valor: e.valor_particular }]
      }))
    };
  }
  return { ok: false };
}

// Valor de consulta a partir da especialidade informada pelo cliente.
export async function precoConsultaPorEspecialidadeCore(sr, { especialidade }) {
  if (!especialidade) return { ok: false };
  return await precoPorTermoCore(sr, { termo: 'consulta ' + especialidade });
}