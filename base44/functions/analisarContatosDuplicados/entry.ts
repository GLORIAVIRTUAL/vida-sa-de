import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar todos os contatos (paginação)
    let todosContatos = [];
    let skip = 0;
    const batchSize = 500;
    while (todosContatos.length < 20000) {
      const lote = await base44.asServiceRole.entities.Contato.list('-created_date', batchSize, skip);
      if (!lote || lote.length === 0) break;
      todosContatos = [...todosContatos, ...lote];
      if (lote.length < batchSize) break;
      skip += batchSize;
    }

    // Agrupar por últimos 8 dígitos do telefone (chave estável)
    const grupos = new Map();
    for (const c of todosContatos) {
      const telNum = (c.telefone || '').replace(/\D/g, '');
      if (telNum.length < 8) continue;
      const chave = telNum.slice(-8);
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push({
        id: c.id,
        nome: c.nome || '',
        telefone: c.telefone || '',
        created_date: c.created_date,
        total_mensagens: (c.historico_mensagens?.length) || 0,
      });
    }

    // Filtrar apenas os com duplicatas
    const duplicados = [];
    for (const [chave, lista] of grupos.entries()) {
      if (lista.length > 1) {
        duplicados.push({
          telefone_final_8: chave,
          quantidade: lista.length,
          contatos: lista.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
        });
      }
    }

    // Ordenar pelos com mais duplicatas
    duplicados.sort((a, b) => b.quantidade - a.quantidade);

    const totalContatosDuplicados = duplicados.reduce((acc, g) => acc + g.quantidade, 0);
    const totalGruposDuplicados = duplicados.length;
    const totalRegistrosExcedentes = duplicados.reduce((acc, g) => acc + (g.quantidade - 1), 0);

    return Response.json({
      total_contatos_analisados: todosContatos.length,
      total_grupos_com_duplicatas: totalGruposDuplicados,
      total_contatos_em_duplicatas: totalContatosDuplicados,
      total_registros_excedentes: totalRegistrosExcedentes,
      duplicados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});