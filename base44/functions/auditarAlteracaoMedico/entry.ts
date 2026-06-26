import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Campos relevantes para auditoria (financeiros e críticos)
const CAMPOS_MONITORADOS = [
  'nome',
  'crm',
  'especialidade',
  'status',
  'tipo_repasse',
  'percentual_repasse',
  'percentual_repasse_convenio',
  'valor_repasse_fixo',
  'valor_repasse_fixo_convenio',
  'repasses_por_categoria',
  'horarios_atendimento'
];

function compararValores(antigo, novo) {
  // Normalizar undefined/null
  const a = antigo ?? null;
  const n = novo ?? null;

  // Para arrays/objetos, comparar via JSON
  if (typeof a === 'object' || typeof n === 'object') {
    return JSON.stringify(a) !== JSON.stringify(n);
  }
  return a !== n;
}

function formatarValor(valor) {
  if (valor === null || valor === undefined) return '(vazio)';
  if (Array.isArray(valor)) {
    if (valor.length === 0) return '(lista vazia)';
    // Para repasses_por_categoria, formatar de forma legível
    if (valor[0]?.categoria_id) {
      return valor.map(r => `cat:${r.categoria_id?.substring(0, 8)}=${r.valor || 0}`).join(', ');
    }
    return `${valor.length} item(ns)`;
  }
  if (typeof valor === 'object') return JSON.stringify(valor).substring(0, 100);
  return String(valor);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const { event, data, old_data, payload_too_large } = payload;
    const eventType = event?.type;
    const medicoId = event?.entity_id;

    if (!medicoId || !eventType) {
      return Response.json({ skipped: 'missing event data' });
    }

    // Se payload muito grande, buscar dados completos
    let dadosAtuais = data;
    let dadosAntigos = old_data;
    if (payload_too_large) {
      try {
        dadosAtuais = await base44.asServiceRole.entities.Medico.get(medicoId);
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
            valor_antigo: dadosAntigos[campo] ?? null,
            valor_novo: dadosAtuais[campo] ?? null
          });
        }
      }

      // Se não houve mudança em campos monitorados, não registrar
      if (camposAlterados.length === 0) {
        return Response.json({ skipped: 'no monitored fields changed' });
      }
    }

    // Quem fez a alteração: campos gravados pelo formulário no momento do save
    const alteradoPorEmail = dadosAtuais?.alterado_por_email || dadosAntigos?.alterado_por_email || null;
    const alteradoPorNome = dadosAtuais?.alterado_por_nome || dadosAntigos?.alterado_por_nome || null;

    // Construir resumo legível
    let resumo;
    if (eventType === 'create') {
      resumo = `Médico cadastrado: ${dadosAtuais?.nome || medicoId}`;
    } else if (eventType === 'delete') {
      resumo = `Médico excluído: ${dadosAntigos?.nome || medicoId}`;
    } else {
      resumo = camposAlterados.map(c => 
        `${c.campo}: ${formatarValor(c.valor_antigo)} → ${formatarValor(c.valor_novo)}`
      ).join(' | ');
    }

    await base44.asServiceRole.entities.AuditoriaMedico.create({
      medico_id: medicoId,
      medico_nome: dadosAtuais?.nome || dadosAntigos?.nome || 'desconhecido',
      tipo_evento: eventType,
      alterado_por_email: alteradoPorEmail,
      alterado_por_nome: alteradoPorNome,
      campos_alterados: camposAlterados,
      resumo: resumo.substring(0, 2000)
    });

    return Response.json({ success: true, campos_alterados: camposAlterados.length });
  } catch (error) {
    console.error('Erro na auditoria:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});