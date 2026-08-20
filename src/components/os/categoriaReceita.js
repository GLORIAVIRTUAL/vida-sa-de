const CATEGORIAS_POR_SERVICO = {
  Consulta: "Receita Consultas",
  Procedimento: "Receita Procedimentos",
  Exame: "Receita Exames"
};

/**
 * Define a categoria de receita de uma OS.
 * Para OS de "Múltiplos Serviços", usa o tipo de item com maior valor somado.
 */
export default function resolverCategoriaReceita(os) {
  const direta = CATEGORIAS_POR_SERVICO[os?.tipo_servico];
  if (direta) return direta;

  const totaisPorTipo = {};
  for (const item of os?.itens || []) {
    if (!CATEGORIAS_POR_SERVICO[item?.tipo]) continue;
    totaisPorTipo[item.tipo] = (totaisPorTipo[item.tipo] || 0) + (Number(item.valor_total) || 0);
  }

  const tipoPredominante = Object.keys(totaisPorTipo).sort((a, b) => totaisPorTipo[b] - totaisPorTipo[a])[0];
  return CATEGORIAS_POR_SERVICO[tipoPredominante] || "Outros";
}