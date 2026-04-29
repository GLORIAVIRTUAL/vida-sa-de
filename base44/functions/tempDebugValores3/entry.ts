import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Find all sales with a very large value (wrong format)
    let valores = {};
    let skip = 0;
    
    while (true) {
        const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 500, skip);
        if (vendas.length === 0) break;
        
        for (const venda of vendas) {
            if (venda.valor_total < 1000 && venda.valor_total > 0) {
                valores[venda.valor_total] = (valores[venda.valor_total] || 0) + 1;
            }
        }
        
        skip += 500;
        if (vendas.length < 500) break;
    }
    
    return new Response(JSON.stringify(valores), { status: 200 });
});