import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const LEGACY_CATEGORY_NAMES = {
  '68cdd084c8857d27e40c6967': 'Particular',
  '68cdd084c8857d27e40c6968': 'Cartão Mais Vida',
  '68cdd084c8857d27e40c6969': 'Prefeitura de Tramandaí',
  '68cdd084c8857d27e40c696a': 'Prefeitura de Imbé',
  '68cdd084c8857d27e40c696b': 'Prefeitura de Pinhal',
  '68cdd084c8857d27e40c696c': 'FUMAM',
  '68cdd084c8857d27e40c696d': 'SMEC',
  '68cdd084c8857d27e40c696e': 'Óticas Parceiras'
};

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const [medicos, categorias] = await Promise.all([
      base44.asServiceRole.entities.Medico.list(),
      base44.asServiceRole.entities.CategoriaPreco.list()
    ]);

    const tania = medicos.find((medico) => medico.nome === 'Tania Regina Leal Pretto');

    if (!tania) {
      return Response.json({ error: 'Médica Tania Regina Leal Pretto não encontrada' }, { status: 404 });
    }

    let todasOrdens = [];
    let skip = 0;
    const limit = 500;

    while (true) {
      const lote = await base44.asServiceRole.entities.OrdemServico.list('-data_execucao', limit, skip);
      if (!lote || lote.length === 0) break;
      todasOrdens = [...todasOrdens, ...lote];
      if (lote.length < limit) break;
      skip += limit;
    }

    const categoriasPorId = Object.fromEntries(categorias.map((categoria) => [categoria.id, categoria]));
    const categoriasPorNome = Object.fromEntries(categorias.map((categoria) => [categoria.nome, categoria]));

    const obterCategoriaAtual = (ordem) => {
      const categoriaAtual = categoriasPorId[ordem.categoria_preco_id];
      if (categoriaAtual) return categoriaAtual;

      const nomeLegado = LEGACY_CATEGORY_NAMES[ordem.categoria_preco_id];
      if (nomeLegado && categoriasPorNome[nomeLegado]) {
        return categoriasPorNome[nomeLegado];
      }

      return null;
    };

    const calcularRepasse = (ordem) => {
      const categoria = obterCategoriaAtual(ordem);
      const categoriaNome = categoria?.nome || LEGACY_CATEGORY_NAMES[ordem.categoria_preco_id] || '';
      const isParticular = categoriaNome === 'Particular';
      const repasseEspecifico = categoria
        ? (tania.repasses_por_categoria || []).find((repasse) => repasse.categoria_id === categoria.id)
        : null;

      let repasse = 0;

      if (ordem.tipo_servico === 'Procedimento') {
        if (repasseEspecifico && repasseEspecifico.tipo_repasse === 'valor_fixo') {
          repasse = repasseEspecifico.valor_procedimento || repasseEspecifico.valor || 0;
        } else if (repasseEspecifico) {
          const percentualProcedimento = repasseEspecifico.valor_procedimento || repasseEspecifico.valor || 0;
          repasse = roundCurrency((ordem.valor_final || 0) * (percentualProcedimento / 100));
        } else if (tania.tipo_repasse === 'valor_fixo') {
          repasse = isParticular
            ? (tania.valor_repasse_fixo_procedimento || tania.valor_repasse_fixo || 0)
            : (tania.valor_repasse_fixo_procedimento_convenio || tania.valor_repasse_fixo_convenio || 0);
        } else {
          const percentual = isParticular
            ? (tania.percentual_repasse_procedimento || tania.percentual_repasse || 0)
            : (tania.percentual_repasse_procedimento_convenio || tania.percentual_repasse_convenio || 0);
          repasse = roundCurrency((ordem.valor_final || 0) * (percentual / 100));
        }
      } else {
        if (repasseEspecifico) {
          if (repasseEspecifico.tipo_repasse === 'valor_fixo') {
            repasse = repasseEspecifico.valor || 0;
          } else {
            repasse = roundCurrency((ordem.valor_final || 0) * ((repasseEspecifico.valor || 0) / 100));
          }
        } else if (tania.tipo_repasse === 'valor_fixo') {
          repasse = isParticular
            ? (tania.valor_repasse_fixo || 0)
            : (tania.valor_repasse_fixo_convenio || 0);
        } else {
          const percentual = isParticular
            ? (tania.percentual_repasse || 0)
            : (tania.percentual_repasse_convenio || 0);
          repasse = roundCurrency((ordem.valor_final || 0) * (percentual / 100));
        }
      }

      return roundCurrency(repasse);
    };

    const ordensDaTania = todasOrdens.filter((ordem) =>
      ordem.medico_id === tania.id && ordem.status_pagamento !== 'Cancelado' && roundCurrency(ordem.valor_repasse_medico || 0) === 0
    );

    let atualizadas = 0;
    const detalhes = [];

    for (const ordem of ordensDaTania) {
      const novoRepasse = calcularRepasse(ordem);
      if (novoRepasse <= 0) continue;

      const valorFinal = roundCurrency(ordem.valor_final || 0);
      const repasseLab = roundCurrency(ordem.valor_repasse_laboratorio || 0);
      const novoValorClinica = roundCurrency(valorFinal - novoRepasse - repasseLab);

      await base44.asServiceRole.entities.OrdemServico.update(ordem.id, {
        valor_repasse_medico: novoRepasse,
        valor_clinica: novoValorClinica
      });

      atualizadas += 1;
      detalhes.push({
        ordem_id: ordem.id,
        paciente_nome: ordem.paciente_nome,
        data_execucao: ordem.data_execucao,
        categoria_preco_id: ordem.categoria_preco_id,
        valor_final: valorFinal,
        repasse_novo: novoRepasse
      });
    }

    return Response.json({
      success: true,
      medico: tania.nome,
      especialidade: tania.especialidade,
      ordens_zeradas_encontradas: ordensDaTania.length,
      ordens_atualizadas: atualizadas,
      detalhes: detalhes.slice(0, 20)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});