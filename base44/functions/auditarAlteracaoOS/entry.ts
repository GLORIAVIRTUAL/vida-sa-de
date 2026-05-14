import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Campos relevantes para auditoria de OS
const CAMPOS_MONITORADOS = [
  'status_pagamento',
  'valor_final',
  'valor_total',
  'desconto',
  'valor_repasse_medico',
  'forma_pagamento',
  'repasse_realizado',
  'observacoes'
];

function compararValores(antigo, novo) {
  const a = antigo ?? null;
  const n = novo ?? null;
  if (typeof a === 'object' || typeof n === 'object') {
    return JSON.stringify(a) !== JSON.stringify(n);
  }
  return a !== n;
}

function formatarValor(valor) {
  if (valor === null || valor === undefined) return '(vazio)';
  if (typeof valor === 'object') return JSON.stringify(valor).substring(0, 100);
  return String(valor);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data, payload_too_large } = payload;
    const eventType = event?.type;
    const osId = event?.entity_id;

    if (!osId || !eventType) {
      return Response.json({ skipped: 'missing event data' });
    }

    let dadosAtuais = data;
    let dadosAntigos = old_data;
    if (payload_too_large) {
      try {
        dadosAtuais = await base44.asServiceRole.entities.OrdemServico.get(osId);
      } catch (e) {
        console.warn('Não foi possível buscar dados atuais:', e.message);
      }
    }

    const camposAlterados = [];

    if (eventType === 'update' && dadosAntigos && dadosAtuais) {
      for (const campo of CAMPOS_MONITORADOS) {
        if (compararValores(dadosAntigos[campo], dadosAtuais[campo])) {
          camposAlterados.push({
            campo,
            valor_antigo: formatarValor(dadosAntigos[campo]),
            valor_novo: formatarValor(dadosAtuais[campo])
          });
        }
      }

      // Se não houve mudança em campos monitorados, não registrar
      if (camposAlterados.length === 0) {
        return Response.json({ skipped: 'no monitored fields changed' });
      }
    }

    // Detectar se foi um cancelamento
    const foiCancelamento = 
      eventType === 'update' &&
      dadosAntigos?.status_pagamento !== 'Cancelado' &&
      dadosAtuais?.status_pagamento === 'Cancelado';

    const tipoEventoFinal = foiCancelamento ? 'cancel' : eventType;

    const alteradoPorEmail = dadosAtuais?.updated_by || dadosAtuais?.created_by || null;

    let resumo;
    if (eventType === 'create') {
      resumo = `OS criada: ${dadosAtuais?.numero_os || osId} - ${dadosAtuais?.paciente_nome || ''}`;
    } else if (eventType === 'delete') {
      resumo = `OS excluída: ${dadosAntigos?.numero_os || osId} - ${dadosAntigos?.paciente_nome || ''}`;
    } else if (foiCancelamento) {
      resumo = `OS CANCELADA: ${dadosAtuais?.numero_os || osId} - ${dadosAtuais?.paciente_nome || ''} - R$ ${dadosAtuais?.valor_final || 0}`;
    } else {
      resumo = camposAlterados.map(c => 
        `${c.campo}: ${formatarValor(c.valor_antigo)} → ${formatarValor(c.valor_novo)}`
      ).join(' | ');
    }

    await base44.asServiceRole.entities.AuditoriaOS.create({
      ordem_servico_id: osId,
      numero_os: dadosAtuais?.numero_os || dadosAntigos?.numero_os || null,
      paciente_nome: dadosAtuais?.paciente_nome || dadosAntigos?.paciente_nome || null,
      tipo_evento: tipoEventoFinal,
      alterado_por_email: alteradoPorEmail,
      alterado_por_nome: null,
      status_anterior: dadosAntigos?.status_pagamento || null,
      status_novo: dadosAtuais?.status_pagamento || null,
      valor_final: dadosAtuais?.valor_final ?? dadosAntigos?.valor_final ?? null,
      campos_alterados: camposAlterados,
      resumo: resumo.substring(0, 2000)
    });

    return Response.json({ success: true, tipo: tipoEventoFinal, campos: camposAlterados.length });
  } catch (error) {
    console.error('Erro na auditoria de OS:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});