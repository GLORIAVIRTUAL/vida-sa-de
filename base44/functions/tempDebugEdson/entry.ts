import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Find EDSON
    const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 500, 0);
    const edson = vendas.find(v => v.titular?.nome === 'EDSON RODRIGUES PEDROSO');
    
    return new Response(JSON.stringify(edson || { error: 'Not found' }), { status: 200 });
});