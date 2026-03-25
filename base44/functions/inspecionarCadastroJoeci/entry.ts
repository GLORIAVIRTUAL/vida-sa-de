import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const normalizar = (texto = '') => texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const medicos = await base44.asServiceRole.entities.Medico.list();
    const joeci = medicos.find((item) => {
      const data = item.data || item;
      return normalizar(data.nome).includes('joeci') && normalizar(data.nome).includes('oliveira');
    });

    if (!joeci) {
      return Response.json({ error: 'Joeci não encontrada' }, { status: 404 });
    }

    const joeciData = joeci.data || joeci;
    const ordens = await base44.asServiceRole.entities.OrdemServico.list();
    const ordensJoeci = ordens
      .filter((item) => {
        const data = item.data || item;
        return data.medico_id === joeci.id && data.tipo_servico === 'Consulta';
      })
      .slice(0, 20)
      .map((item) => {
        const data = item.data || item;
        return {
          id: item.id,
          numero_os: data.numero_os,
          data_execucao: data.data_execucao,
          paciente_nome: data.paciente_nome,
          categoria_preco_id: data.categoria_preco_id,
          valor_total: data.valor_total,
          valor_repasse_medico: data.valor_repasse_medico,
          valor_imposto: data.valor_imposto,
          valor_clinica: data.valor_clinica,
          tipo_servico: data.tipo_servico,
          itens: data.itens,
        };
      });

    return Response.json({
      medico: {
        id: joeci.id,
        nome: joeciData.nome,
        tipo_repasse: joeciData.tipo_repasse,
        percentual_repasse: joeciData.percentual_repasse,
        percentual_repasse_convenio: joeciData.percentual_repasse_convenio,
        valor_repasse_fixo: joeciData.valor_repasse_fixo,
        valor_repasse_fixo_convenio: joeciData.valor_repasse_fixo_convenio,
        percentual_repasse_procedimento: joeciData.percentual_repasse_procedimento,
        percentual_repasse_procedimento_convenio: joeciData.percentual_repasse_procedimento_convenio,
        valor_repasse_fixo_procedimento: joeciData.valor_repasse_fixo_procedimento,
        valor_repasse_fixo_procedimento_convenio: joeciData.valor_repasse_fixo_procedimento_convenio,
        repasses_por_categoria: joeciData.repasses_por_categoria || [],
      },
      consultas_encontradas: ordensJoeci.length,
      consultas: ordensJoeci,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});