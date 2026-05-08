import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Replica a função excluirLancamentosDeOSCanceladas
function excluirLancamentosDeOSCanceladas(lancamentos, ordensServico) {
  const osCanceladasIds = new Set();
  ordensServico.forEach(os => {
    if (os.status_pagamento === 'Cancelado') {
      osCanceladasIds.add(os.id);
    }
  });

  return lancamentos.filter((l) => {
    if (l.status === 'Cancelado') return false;
    if (l.tipo === 'Entrada' && l.ordem_servico_id && osCanceladasIds.has(l.ordem_servico_id)) {
      const isEstornoRepasse = l.categoria === 'Repasse Médico' || l.categoria === 'Repasse Laboratório';
      if (!isEstornoRepasse) return false;
    }
    return true;
  });
}

const APP_START_DATE = new Date('2026-01-20T13:40:00');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dataInicio = '2026-04-01';
    const dataFim = '2026-04-30';
    const mesAno = '2026-04';

    const [lancamentos, ordensServico] = await Promise.all([
      base44.asServiceRole.entities.Lancamento.filter({ 
        data_lancamento: { $gte: dataInicio, $lte: dataFim } 
      }, '-data_lancamento', 5000),
      base44.asServiceRole.entities.OrdemServico.filter({ 
        data_execucao: { $gte: dataInicio, $lte: dataFim } 
      }, '-data_execucao', 5000)
    ]);

    // === SIMULAR CÁLCULO DA DRE ===
    // DRE filtra por mesAno do data_lancamento
    const lancamentosDRE_raw = lancamentos.filter(l => {
      if (!l?.data_lancamento || !l?.created_date) return false;
      if (new Date(l.created_date) < APP_START_DATE) return false;
      return l.data_lancamento.substring(0, 7) === mesAno;
    });
    const lancamentosDRE = excluirLancamentosDeOSCanceladas(lancamentosDRE_raw, ordensServico);
    const entradasDRE = lancamentosDRE.filter(l => l.tipo === 'Entrada').reduce((acc, l) => acc + (l.valor || 0), 0);

    // === SIMULAR CÁLCULO DO RELATÓRIO FINANCEIRO ===
    // Relatórios usa Total Vendido das OS (valor_final), excluindo canceladas (a menos que filtro = Cancelado)
    const osNaoCanceladas = ordensServico.filter(os => os.status_pagamento !== 'Cancelado');
    const totalVendidoOS = osNaoCanceladas.reduce((acc, os) => acc + (os.valor_final || 0), 0);

    // === ANÁLISE DETALHADA ===
    const diferenca = totalVendidoOS - entradasDRE;

    // OS sem lançamento correspondente
    const lancamentoOsIds = new Set(
      lancamentosDRE.filter(l => l.ordem_servico_id).map(l => l.ordem_servico_id)
    );

    const osSemLancamento = osNaoCanceladas.filter(os => !lancamentoOsIds.has(os.id));
    const valorOsSemLancamento = osSemLancamento.reduce((acc, os) => acc + (os.valor_final || 0), 0);

    // Lançamentos sem OS (entradas avulsas, ex.: receita de cartão, taxa, etc.)
    const lancamentosSemOS = lancamentosDRE.filter(l => l.tipo === 'Entrada' && !l.ordem_servico_id);
    const valorLancamentosSemOS = lancamentosSemOS.reduce((acc, l) => acc + (l.valor || 0), 0);

    // OS cuja data_execucao está em abril mas data_lancamento pode estar fora (ou vice-versa)
    const osIdsAbril = new Set(osNaoCanceladas.map(os => os.id));
    
    // Buscar lançamentos de OSs de abril que estão em outros meses
    const todosLancamentosOSAbril = await base44.asServiceRole.entities.Lancamento.filter({
      tipo: 'Entrada'
    }, '-data_lancamento', 10000);
    
    const lancamentosForaDoMes = todosLancamentosOSAbril.filter(l => 
      l.ordem_servico_id && 
      osIdsAbril.has(l.ordem_servico_id) && 
      l.data_lancamento &&
      l.data_lancamento.substring(0, 7) !== mesAno
    );
    const valorLancamentosForaDoMes = lancamentosForaDoMes.reduce((acc, l) => acc + (l.valor || 0), 0);

    // OS cuja data_lancamento (da entrada vinculada) está em abril mas data_execucao não
    const lancamentosAbrilOsDeFora = lancamentosDRE.filter(l => {
      if (!l.ordem_servico_id || l.tipo !== 'Entrada') return false;
      return !osIdsAbril.has(l.ordem_servico_id);
    });
    const valorLancamentosAbrilOsDeFora = lancamentosAbrilOsDeFora.reduce((acc, l) => acc + (l.valor || 0), 0);

    return Response.json({
      periodo: mesAno,
      dre: {
        entradas: entradasDRE.toFixed(2),
        qtd_lancamentos_entrada: lancamentosDRE.filter(l => l.tipo === 'Entrada').length
      },
      relatorio_financeiro: {
        total_vendido_os: totalVendidoOS.toFixed(2),
        qtd_os: osNaoCanceladas.length
      },
      diferenca: diferenca.toFixed(2),
      analise: {
        os_sem_lancamento: {
          qtd: osSemLancamento.length,
          valor: valorOsSemLancamento.toFixed(2),
          exemplos: osSemLancamento.slice(0, 10).map(os => ({
            id: os.id,
            numero_os: os.numero_os,
            paciente: os.paciente_nome,
            data_execucao: os.data_execucao,
            valor: os.valor_final,
            status_pagamento: os.status_pagamento,
            forma_pagamento: os.forma_pagamento
          }))
        },
        lancamentos_entrada_sem_os: {
          qtd: lancamentosSemOS.length,
          valor: valorLancamentosSemOS.toFixed(2),
          exemplos: lancamentosSemOS.slice(0, 10).map(l => ({
            id: l.id,
            categoria: l.categoria,
            descricao: l.descricao,
            valor: l.valor,
            data: l.data_lancamento
          }))
        },
        lancamentos_de_os_abril_em_outros_meses: {
          qtd: lancamentosForaDoMes.length,
          valor: valorLancamentosForaDoMes.toFixed(2),
          obs: 'OSs de abril cujos lançamentos foram registrados em outros meses (provavelmente data de pagamento diferente)',
          exemplos: lancamentosForaDoMes.slice(0, 10).map(l => ({
            id: l.id,
            os_id: l.ordem_servico_id,
            data_lancamento: l.data_lancamento,
            valor: l.valor
          }))
        },
        lancamentos_abril_de_os_de_outros_meses: {
          qtd: lancamentosAbrilOsDeFora.length,
          valor: valorLancamentosAbrilOsDeFora.toFixed(2),
          obs: 'Lançamentos em abril vinculados a OSs executadas em outros meses'
        }
      }
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});