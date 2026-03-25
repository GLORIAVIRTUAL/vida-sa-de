import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
    const normalizar = (texto = '') => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const joeci = medicos.find((item) => {
      const data = item.data || item;
      return normalizar(data.nome).includes('joeci') && normalizar(data.nome).includes('oliveira');
    });

    if (!joeci) {
      return Response.json({ error: 'Joeci de Oliveira não encontrada' }, { status: 404 });
    }

    const joeciData = joeci.data || joeci;
    const repassesPorCategoria = joeciData.repasses_por_categoria || [];
    const ordens = await base44.asServiceRole.entities.OrdemServico.list();

    const calcularRepasse = (ordemData) => {
      const categoria = repassesPorCategoria.find((item) => item.categoria_id === ordemData.categoria_preco_id);
      const valorBase = Number(ordemData.valor_total ?? ordemData.valor_final) || 0;
      const valorFinal = Number(ordemData.valor_final ?? ordemData.valor_total) || 0;
      const valorImposto = Number(ordemData.valor_imposto) || 0;
      const valorRepasseLaboratorio = Number(ordemData.valor_repasse_laboratorio) || 0;

      let tipoRepasse = joeciData.tipo_repasse || 'valor_fixo';
      let valorConfigurado = 0;

      if (categoria) {
        tipoRepasse = categoria.tipo_repasse || tipoRepasse;
        valorConfigurado = Number(categoria.valor) || 0;
      } else if (tipoRepasse === 'percentual') {
        valorConfigurado = ordemData.forma_pagamento === 'Convênio'
          ? Number(joeciData.percentual_repasse_convenio) || 0
          : Number(joeciData.percentual_repasse) || 0;
      } else {
        valorConfigurado = ordemData.forma_pagamento === 'Convênio'
          ? Number(joeciData.valor_repasse_fixo_convenio) || 0
          : Number(joeciData.valor_repasse_fixo) || 0;
      }

      const valorRepasseMedico = tipoRepasse === 'percentual'
        ? round2((valorBase * valorConfigurado) / 100)
        : round2(valorConfigurado);

      const valorClinica = round2(valorFinal - valorImposto - valorRepasseLaboratorio - valorRepasseMedico);

      return {
        tipo_repasse_aplicado: tipoRepasse,
        valor_configurado: valorConfigurado,
        valor_repasse_medico_correto: valorRepasseMedico,
        valor_clinica_correto: valorClinica,
      };
    };

    const consultasJoeci = ordens.filter((item) => {
      const data = item.data || item;
      return data.medico_id === joeci.id && data.tipo_servico === 'Consulta';
    });

    const divergencias = consultasJoeci.map((item) => {
      const data = item.data || item;
      const calculo = calcularRepasse(data);
      const repasseAtual = round2(data.valor_repasse_medico);
      const clinicaAtual = round2(data.valor_clinica);
      const precisaAtualizar = repasseAtual !== calculo.valor_repasse_medico_correto || clinicaAtual !== calculo.valor_clinica_correto;

      return {
        id: item.id,
        numero_os: data.numero_os,
        data_execucao: data.data_execucao,
        paciente_nome: data.paciente_nome,
        categoria_preco_id: data.categoria_preco_id,
        valor_total: round2(data.valor_total),
        valor_imposto: round2(data.valor_imposto),
        valor_repasse_medico_atual: repasseAtual,
        valor_repasse_medico_correto: calculo.valor_repasse_medico_correto,
        valor_clinica_atual: clinicaAtual,
        valor_clinica_correto: calculo.valor_clinica_correto,
        tipo_repasse_aplicado: calculo.tipo_repasse_aplicado,
        valor_configurado: calculo.valor_configurado,
        precisa_atualizar: precisaAtualizar,
      };
    }).filter((item) => item.precisa_atualizar);

    if (dryRun) {
      return Response.json({
        dryRun: true,
        medico: {
          id: joeci.id,
          nome: joeciData.nome,
          tipo_repasse: joeciData.tipo_repasse,
          valor_repasse_fixo: joeciData.valor_repasse_fixo,
          valor_repasse_fixo_convenio: joeciData.valor_repasse_fixo_convenio,
          percentual_repasse: joeciData.percentual_repasse,
          percentual_repasse_convenio: joeciData.percentual_repasse_convenio,
          repasses_por_categoria: repassesPorCategoria,
        },
        consultas_analisadas: consultasJoeci.length,
        consultas_com_divergencia: divergencias.length,
        divergencias,
      });
    }

    for (const item of divergencias) {
      await base44.asServiceRole.entities.OrdemServico.update(item.id, {
        valor_repasse_medico: item.valor_repasse_medico_correto,
        valor_clinica: item.valor_clinica_correto,
      });
    }

    return Response.json({
      success: true,
      medico_id: joeci.id,
      medico_nome: joeciData.nome,
      consultas_analisadas: consultasJoeci.length,
      consultas_corrigidas: divergencias.length,
      divergencias,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});