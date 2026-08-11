import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();
    const { event, data, old_data } = payload;
    const origem = event?.entity_name;
    const registroId = event?.entity_id;
    const tipoEvento = event?.type;

    if (!['Medico', 'Procedimento', 'TabelaPreco'].includes(origem) || !registroId || !tipoEvento) {
      return Response.json({ skipped: 'Evento inválido' });
    }

    const atual = tipoEvento === 'delete' ? null : data;
    const anterior = tipoEvento === 'create' ? null : old_data;
    const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
    const categoriasPorId = Object.fromEntries(categorias.map((categoria) => [categoria.id, categoria.nome]));
    const camposAlterados = [];
    const adicionar = (campo, valorAntigo, valorNovo) => {
      const a = valorAntigo ?? null;
      const n = valorNovo ?? null;
      if (JSON.stringify(a) !== JSON.stringify(n)) camposAlterados.push({ campo, valor_antigo: a, valor_novo: n });
    };

    if (origem === 'Medico') {
      const campos = [
        'tipo_repasse', 'percentual_repasse', 'percentual_repasse_convenio',
        'percentual_repasse_procedimento', 'percentual_repasse_procedimento_convenio',
        'valor_repasse_fixo', 'valor_repasse_fixo_convenio',
        'valor_repasse_fixo_procedimento', 'valor_repasse_fixo_procedimento_convenio'
      ];
      campos.forEach((campo) => adicionar(campo, anterior?.[campo], atual?.[campo]));
      const antigos = Object.fromEntries((anterior?.repasses_por_categoria || []).map((item) => [item.categoria_id, item]));
      const novos = Object.fromEntries((atual?.repasses_por_categoria || []).map((item) => [item.categoria_id, item]));
      const ids = [...new Set([...Object.keys(antigos), ...Object.keys(novos)])];
      ids.forEach((id) => {
        const nome = categoriasPorId[id] || id;
        adicionar(`${nome} - tipo`, antigos[id]?.tipo_repasse, novos[id]?.tipo_repasse);
        adicionar(`${nome} - consulta`, antigos[id]?.valor, novos[id]?.valor);
        adicionar(`${nome} - procedimento`, antigos[id]?.valor_procedimento, novos[id]?.valor_procedimento);
      });
    }

    if (origem === 'Procedimento') {
      ['tipo_repasse', 'valor_repasse_medico', 'percentual_repasse_medico'].forEach((campo) =>
        adicionar(campo, anterior?.[campo], atual?.[campo])
      );
    }

    if (origem === 'TabelaPreco') {
      ['valor', 'tipo_repasse', 'valor_repasse', 'percentual_repasse'].forEach((campo) =>
        adicionar(campo, anterior?.[campo], atual?.[campo])
      );
    }

    if (camposAlterados.length === 0) return Response.json({ skipped: 'Nenhum valor de repasse alterado' });

    const dadosReferencia = atual || anterior || {};
    let registroNome = dadosReferencia.nome || registroId;
    let categoriaNome = null;
    if (origem === 'TabelaPreco') {
      registroNome = dadosReferencia.procedimento_id || registroId;
      categoriaNome = categoriasPorId[dadosReferencia.categoria_id] || dadosReferencia.categoria_id || null;
    }

    const formatar = (valor) => valor === null || valor === undefined ? '(vazio)' : typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
    const resumo = camposAlterados.map((item) => `${item.campo}: ${formatar(item.valor_antigo)} → ${formatar(item.valor_novo)}`).join(' | ');

    await base44.asServiceRole.entities.AuditoriaRepasse.create({
      origem,
      registro_id: registroId,
      registro_nome: registroNome,
      categoria_nome: categoriaNome,
      tipo_evento: tipoEvento,
      data_hora: new Date().toISOString(),
      alterado_por_email: dadosReferencia.alterado_por_email || null,
      alterado_por_nome: dadosReferencia.alterado_por_nome || null,
      campos_alterados: camposAlterados,
      resumo: resumo.substring(0, 5000)
    });

    return Response.json({ success: true, campos_alterados: camposAlterados.length });
  } catch (error) {
    console.error('Erro ao auditar repasse:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}