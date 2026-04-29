import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Check distribution of valor_total
    let todasVendas = [];
    let skip = 0;
    
    let acima1000 = 0;
    let abaixo1000 = 0;
    let igual0 = 0;
    
    while (true) {
        const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 500, skip);
        if (vendas.length === 0) break;
        
        for (const venda of vendas) {
            if (venda.valor_total > 1000) acima1000++;
            else if (venda.valor_total === 0) igual0++;
            else abaixo1000++;
        }
        
        skip += 500;
        if (vendas.length < 500) break;
    }
    
    return new Response(JSON.stringify({ 
        total: acima1000 + abaixo1000 + igual0,
        acima1000,
        abaixo1000,
        igual0
    }), { status: 200 });
});