import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Find all sales with a very large value (wrong format)
    let todasVendas = [];
    let skip = 0;
    
    while (true) {
        const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 500, skip);
        if (vendas.length === 0) break;
        
        for (const venda of vendas) {
            if (venda.valor_total > 10000) {
                todasVendas.push({
                    id: venda.id,
                    nome: venda.titular?.nome,
                    tipo_plano: venda.tipo_plano,
                    valor_total: venda.valor_total,
                    numero_parcelas: venda.numero_parcelas
                });
            }
        }
        
        skip += 500;
        if (vendas.length < 500) break;
    }
    
    return new Response(JSON.stringify({ 
        totalErradas: todasVendas.length, 
        amostra: todasVendas.slice(0, 5) 
    }), { status: 200 });
});