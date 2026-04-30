export const APP_START_DATE = new Date('2026-01-20T13:40:00');

export function filtrarLancamentosValidos(lancamentos = []) {
  return lancamentos.filter((lancamento) => {
    if (!lancamento?.data_lancamento || !lancamento?.created_date) return false;
    return new Date(lancamento.created_date) >= APP_START_DATE;
  });
}

export function filtrarLancamentosPorPeriodo(lancamentos = [], filtros = {}) {
  const { dataInicio, dataFim, mesAno, formaPagamento } = filtros;

  return filtrarLancamentosValidos(lancamentos).filter((lancamento) => {
    const data = lancamento.data_lancamento;

    if (mesAno && data.substring(0, 7) !== mesAno) return false;
    if (dataInicio && data < dataInicio) return false;
    if (dataFim && data > dataFim) return false;
    if (formaPagamento && formaPagamento !== 'todos' && formaPagamento !== 'todas' && lancamento.forma_pagamento !== formaPagamento) return false;

    return true;
  });
}

/**
 * Exclui lançamentos de Entrada cujo ordem_servico_id aponta para uma OS cancelada,
 * e também lançamentos com status próprio "Cancelado".
 * Isso garante que a receita do DRE e relatórios bata com o Total Vendido das OS.
 */
export function excluirLancamentosDeOSCanceladas(lancamentos = [], ordensServico = []) {
  // Coletar IDs originais e desmembrados de OS canceladas
  const osCanceladasIds = new Set();
  ordensServico.forEach(os => {
    if (os.status_pagamento === 'Cancelado') {
      osCanceladasIds.add(os.id);
      // Se é desmembrada, incluir o original_id também
      if (os.original_id) osCanceladasIds.add(os.original_id);
    }
  });

  return lancamentos.filter((lancamento) => {
    // Excluir lançamentos com status próprio "Cancelado"
    if (lancamento.status === 'Cancelado') return false;

    // Excluir lançamentos de Entrada vinculados a OS canceladas
    // EXCETO estornos de Repasse Médico/Laboratório (que devem permanecer para reduzir a despesa)
    if (lancamento.tipo === 'Entrada' && lancamento.ordem_servico_id && osCanceladasIds.has(lancamento.ordem_servico_id)) {
      const isEstornoRepasse = lancamento.categoria === 'Repasse Médico' || lancamento.categoria === 'Repasse Laboratório';
      if (!isEstornoRepasse) return false;
    }
    return true;
  });
}

export function somarLancamentos(lancamentos = []) {
  const entradas = lancamentos
    .filter((lancamento) => lancamento.tipo === 'Entrada')
    .reduce((total, lancamento) => total + (lancamento.valor || 0), 0);

  const saidas = lancamentos
    .filter((lancamento) => lancamento.tipo === 'Saída')
    .reduce((total, lancamento) => total + (lancamento.valor || 0), 0);

  return {
    entradas,
    saidas,
    saldo: entradas - saidas,
  };
}

export function agruparLancamentosPorCategoria(lancamentos = [], tipo) {
  return lancamentos
    .filter((lancamento) => !tipo || lancamento.tipo === tipo)
    .reduce((grupos, lancamento) => {
      const categoria = lancamento.categoria || 'Outros';
      grupos[categoria] = (grupos[categoria] || 0) + (lancamento.valor || 0);
      return grupos;
    }, {});
}