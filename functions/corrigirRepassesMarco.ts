import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dryRun = true } = await req.json().catch(() => ({}));

    // Carregar médicos e categorias
    const [medicos, categorias] = await Promise.all([
      base44.asServiceRole.entities.Medico.filter({}),
      base44.asServiceRole.entities.CategoriaPreco.filter({})
    ]);

    const medicosMap = {};
    medicos.forEach(m => { medicosMap[m.id] = m; });

    // Carregar todas as OS de março com repasse = 0
    let todasOS = [];
    let skip = 0;
    while (true) {
      const batch = await base44.asServiceRole.entities.OrdemServico.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) break;
      const osMar = batch.filter(os => 
        os.data_execucao >= '2026-03-01' && 
        os.data_execucao <= '2026-03-31' &&
        (os.valor_repasse_medico === 0 || os.valor_repasse_medico === null) &&
        os.status_pagamento !== 'Cancelado' &&
        os.medico_id
      );
      todasOS = [...todasOS, ...osMar];
      if (batch.length < 500) break;
      skip += 500;
    }

    console.log(`Total OS março com repasse zerado: ${todasOS.length}`);

    const resultados = [];
    const erros = [];

    for (const os of todasOS) {
      const medico = medicosMap[os.medico_id];
      if (!medico) {
        erros.push({ os_id: os.id, paciente: os.paciente_nome, erro: `Médico ${os.medico_id} não encontrado` });
        continue;
      }

      // Pular agendas auxiliares (sem repasse)
      if (['ELETROCARDIO CLINICA', 'EXAMES', 'CARTÃO MAIS VIDA'].includes(medico.nome)) {
        continue;
      }

      const categoriaId = os.categoria_preco_id;
      const tipoServico = os.tipo_servico; // Consulta, Procedimento, Exame
      const valorFinal = os.valor_final || 0;

      let valorRepasse = 0;

      // 1. Tentar repasses_por_categoria do médico
      const repasseCategoria = (medico.repasses_por_categoria || []).find(r => r.categoria_id === categoriaId);
      
      if (repasseCategoria) {
        const tipoRep = repasseCategoria.tipo_repasse;
        
        if (tipoServico === 'Procedimento') {
          if (tipoRep === 'percentual') {
            const pct = repasseCategoria.valor_procedimento ?? repasseCategoria.valor ?? 0;
            valorRepasse = Math.round((valorFinal * pct / 100) * 100) / 100;
          } else {
            valorRepasse = repasseCategoria.valor_procedimento ?? repasseCategoria.valor ?? 0;
          }
        } else {
          // Consulta ou Retorno
          if (tipoRep === 'percentual') {
            const pct = repasseCategoria.valor ?? 0;
            valorRepasse = Math.round((valorFinal * pct / 100) * 100) / 100;
          } else {
            valorRepasse = repasseCategoria.valor ?? 0;
          }
        }
      } else {
        // 2. Fallback: usar campos legados do médico
        const isParticular = categoriaId === '6966af28c3f66155da5cd7c2';
        
        if (medico.tipo_repasse === 'percentual') {
          if (tipoServico === 'Procedimento') {
            const pct = isParticular 
              ? (medico.percentual_repasse_procedimento || medico.percentual_repasse || 0)
              : (medico.percentual_repasse_procedimento_convenio || medico.percentual_repasse_convenio || 0);
            valorRepasse = Math.round((valorFinal * pct / 100) * 100) / 100;
          } else {
            const pct = isParticular 
              ? (medico.percentual_repasse || 0)
              : (medico.percentual_repasse_convenio || 0);
            valorRepasse = Math.round((valorFinal * pct / 100) * 100) / 100;
          }
        } else if (medico.tipo_repasse === 'valor_fixo') {
          if (tipoServico === 'Procedimento') {
            valorRepasse = isParticular 
              ? (medico.valor_repasse_fixo_procedimento || medico.valor_repasse_fixo || 0)
              : (medico.valor_repasse_fixo_procedimento_convenio || medico.valor_repasse_fixo_convenio || 0);
          } else {
            valorRepasse = isParticular 
              ? (medico.valor_repasse_fixo || 0)
              : (medico.valor_repasse_fixo_convenio || 0);
          }
        }
      }

      if (valorRepasse <= 0) {
        erros.push({ 
          os_id: os.id, 
          paciente: os.paciente_nome, 
          medico: medico.nome,
          categoria_id: categoriaId,
          tipo_servico: tipoServico,
          valor_final: valorFinal,
          erro: 'Repasse calculado = 0 (sem config encontrada)'
        });
        continue;
      }

      const valorClinica = Math.round((valorFinal - valorRepasse - (os.valor_repasse_laboratorio || 0)) * 100) / 100;

      resultados.push({
        os_id: os.id,
        numero_os: os.numero_os,
        paciente: os.paciente_nome,
        medico: medico.nome,
        tipo_servico: tipoServico,
        categoria_id: categoriaId,
        valor_final: valorFinal,
        valor_repasse_calculado: valorRepasse,
        valor_clinica_calculado: valorClinica
      });

      if (!dryRun) {
        await base44.asServiceRole.entities.OrdemServico.update(os.id, {
          valor_repasse_medico: valorRepasse,
          valor_clinica: valorClinica
        });
      }
    }

    return Response.json({
      modo: dryRun ? 'SIMULAÇÃO (dry run)' : 'APLICADO',
      total_os_zeradas: todasOS.length,
      total_corrigidas: resultados.length,
      total_erros: erros.length,
      resultados: resultados.slice(0, 100),
      erros: erros.slice(0, 50)
    });

  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});