import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 10);
    return new Response(JSON.stringify(vendas), { status: 200 });
});