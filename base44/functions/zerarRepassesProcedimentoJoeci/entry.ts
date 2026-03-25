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

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const medico = medicos.find((item) => {
      const nome = (item.nome || item.data?.nome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nome.includes('joeci') && nome.includes('oliveira');
    });

    if (!medico) {
      return Response.json({ error: 'Médica Joeci de Oliveira não encontrada' }, { status: 404 });
    }

    const medicoData = medico.data || medico;
    const repassesPorCategoriaOriginais = medicoData.repasses_por_categoria || [];
    const repassesPorCategoriaAtualizados = repassesPorCategoriaOriginais.map((repasse) => ({
      ...repasse,
      valor_procedimento: 0,
    }));

    const ordensServico = await base44.asServiceRole.entities.OrdemServico.list();
    const ordensProcedimento = ordensServico.filter((ordem) => {
      const data = ordem.data || ordem;
      return data.medico_id === medico.id && data.tipo_servico === 'Procedimento';
    });

    const ordensAtualizadasPreview = ordensProcedimento.map((ordem) => {
      const data = ordem.data || ordem;
      const valorFinal = Number(data.valor_final) || 0;
      const valorImposto = Number(data.valor_imposto) || 0;
      const valorRepasseLaboratorio = Number(data.valor_repasse_laboratorio) || 0;
      const novoValorClinica = valorFinal - valorImposto - valorRepasseLaboratorio;

      return {
        id: ordem.id,
        numero_os: data.numero_os,
        data_execucao: data.data_execucao,
        paciente_nome: data.paciente_nome,
        valor_repasse_medico_anterior: Number(data.valor_repasse_medico) || 0,
        valor_repasse_medico_novo: 0,
        valor_clinica_anterior: Number(data.valor_clinica) || 0,
        valor_clinica_novo: novoValorClinica,
      };
    });

    if (dryRun) {
      return Response.json({
        dryRun: true,
        medico: {
          id: medico.id,
          nome: medicoData.nome,
          percentual_repasse_procedimento_atual: Number(medicoData.percentual_repasse_procedimento) || 0,
          percentual_repasse_procedimento_convenio_atual: Number(medicoData.percentual_repasse_procedimento_convenio) || 0,
          valor_repasse_fixo_procedimento_atual: Number(medicoData.valor_repasse_fixo_procedimento) || 0,
          valor_repasse_fixo_procedimento_convenio_atual: Number(medicoData.valor_repasse_fixo_procedimento_convenio) || 0,
          categorias_com_valor_procedimento: repassesPorCategoriaOriginais.filter((item) => Number(item.valor_procedimento) !== 0).length,
        },
        ordens_procedimento_afetadas: ordensAtualizadasPreview.length,
        ordens_preview: ordensAtualizadasPreview,
      });
    }

    await base44.asServiceRole.entities.Medico.update(medico.id, {
      percentual_repasse_procedimento: 0,
      percentual_repasse_procedimento_convenio: 0,
      valor_repasse_fixo_procedimento: 0,
      valor_repasse_fixo_procedimento_convenio: 0,
      repasses_por_categoria: repassesPorCategoriaAtualizados,
    });

    for (const ordem of ordensProcedimento) {
      const data = ordem.data || ordem;
      const valorFinal = Number(data.valor_final) || 0;
      const valorImposto = Number(data.valor_imposto) || 0;
      const valorRepasseLaboratorio = Number(data.valor_repasse_laboratorio) || 0;
      const novoValorClinica = valorFinal - valorImposto - valorRepasseLaboratorio;

      await base44.asServiceRole.entities.OrdemServico.update(ordem.id, {
        valor_repasse_medico: 0,
        valor_clinica: novoValorClinica,
      });
    }

    return Response.json({
      success: true,
      medico_id: medico.id,
      medico_nome: medicoData.nome,
      ordens_procedimento_atualizadas: ordensAtualizadasPreview.length,
      ordens_preview: ordensAtualizadasPreview,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});