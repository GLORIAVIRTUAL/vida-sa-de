import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    // Buscar todas as vendas com numero_venda começando com CMV-IMP-1779909 (lote errado)
    const todasVendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 500);
    
    const vendasErradas = todasVendas.filter(v => 
      v.numero_venda && v.numero_venda.startsWith('CMV-IMP-1779909')
    );

    console.log(`Encontradas ${vendasErradas.length} vendas erradas para deletar`);

    let deletadas = 0;
    const erros = [];

    for (const venda of vendasErradas) {
      try {
        await base44.asServiceRole.entities.VendaCartao.delete(venda.id);
        deletadas++;
      } catch (err) {
        erros.push({ id: venda.id, titular: venda.titular?.nome, erro: err.message });
      }
    }

    return Response.json({
      total_encontradas: vendasErradas.length,
      deletadas,
      erros,
      titulares_deletados: vendasErradas.map(v => v.titular?.nome).filter(Boolean)
    });
  } catch (error) {
    console.error('Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});