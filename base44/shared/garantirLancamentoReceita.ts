const CATEGORIAS_POR_SERVICO = {
  Consulta: 'Receita Consultas',
  Procedimento: 'Receita Procedimentos',
  Exame: 'Receita Exames',
};

const FORMAS_VALIDAS = [
  'Dinheiro',
  'Cartão Débito',
  'Cartão Crédito',
  'PIX',
  'PIX Turmas',
  'Transferência',
  'Boleto',
];

/**
 * Para OS de "Múltiplos Serviços", usa o tipo de item com maior valor somado.
 */
function resolverCategoria(os) {
  const direta = CATEGORIAS_POR_SERVICO[os.tipo_servico];
  if (direta) return direta;

  const totais = {};
  for (const item of os.itens || []) {
    if (!CATEGORIAS_POR_SERVICO[item?.tipo]) continue;
    totais[item.tipo] = (totais[item.tipo] || 0) + (Number(item.valor_total) || 0);
  }
  const predominante = Object.keys(totais).sort((a, b) => totais[b] - totais[a])[0];
  return CATEGORIAS_POR_SERVICO[predominante] || 'Outros';
}

/**
 * Garante que exista um lançamento de receita (Entrada) no fluxo de caixa
 * para uma Ordem de Serviço paga. Idempotente: não duplica.
 * Usado pelos caminhos de confirmação automática (Pix Sicredi e cartão EvoluServices).
 */
export async function garantirLancamentoReceita(base44, os) {
  if (!os || !os.id) return { criado: false, motivo: 'OS inválida' };

  const existentes = await base44.asServiceRole.entities.Lancamento.filter({
    ordem_servico_id: os.id,
    tipo: 'Entrada',
  });

  if ((existentes || []).some((l) => l.status !== 'Cancelado')) {
    return { criado: false, motivo: 'Lançamento já existente' };
  }

  const dados = {
    tipo: 'Entrada',
    categoria: resolverCategoria(os),
    descricao: `Receita: ${os.tipo_servico || 'Serviço'} de ${os.paciente_nome || 'Paciente Não Identificado'}`,
    valor: Number(os.valor_final) || 0,
    data_lancamento: os.data_execucao || new Date().toISOString().split('T')[0],
    ordem_servico_id: os.id,
    status: 'Realizado',
  };

  if (FORMAS_VALIDAS.includes(os.forma_pagamento)) {
    dados.forma_pagamento = os.forma_pagamento;
  }

  const lancamento = await base44.asServiceRole.entities.Lancamento.create(dados);
  return { criado: true, lancamento_id: lancamento.id, valor: dados.valor };
}