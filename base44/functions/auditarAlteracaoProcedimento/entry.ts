import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Campos relevantes para auditoria (valores e repasses)
const CAMPOS_MONITORADOS = [
  'nome',
  'codigo',
  'especialidade',
  'status',
  'duracao_minutos',
  'tipo_repasse',
  'valor_repasse_medico',
  'percentual_repasse_medico',
  'is_pacote',
  'itens_pacote',
  'desconto_pacote'
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
  if (Array.isArray(valor)) {
    if (valor.length === 0) return '(lista vazia)';
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
    const procedimentoId = event?.entity_id;

    if (!procedimentoId || !eventType) {
      return Response.json({ skipped: 'missing event data' });
    }

    let dadosAtuais = data;
    let dadosAntigos = old_data;
    if (payload_too_large) {
      try {
        dadosAtuais = await base44.asServiceRole.entities.Procedimento.get(procedimentoId);
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

      if (camposAlterados.length === 0) {
        return Response.json({ skipped: 'no monitored fields changed' });
      }
    }

    const alteradoPorEmail = dadosAtuais?.alterado_por_email || dadosAntigos?.alterado_por_email || null;
    const alteradoPorNome = dadosAtuais?.alterado_por_nome || dadosAntigos?.alterado_por_nome || null;

    let resumo;
    if (eventType === 'create') {
      resumo = `Procedimento cadastrado: ${dadosAtuais?.nome || procedimentoId}`;
    } else if (eventType === 'delete') {
      resumo = `Procedimento excluído: ${dadosAntigos?.nome || procedimentoId}`;
    } else {
      resumo = camposAlterados.map(c =>
        `${c.campo}: ${formatarValor(c.valor_antigo)} → ${formatarValor(c.valor_novo)}`
      ).join(' | ');
    }

    await base44.asServiceRole.entities.AuditoriaProcedimento.create({
      procedimento_id: procedimentoId,
      procedimento_nome: dadosAtuais?.nome || dadosAntigos?.nome || 'desconhecido',
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