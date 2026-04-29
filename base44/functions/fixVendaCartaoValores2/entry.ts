import { createClientFromRequest } from 'npm:@base44/sdk@0.8.27';

const VALORES_PLANOS = {
  "Individual à Vista": 273.90,
  "Individual Parcelado": 298.80,
  "Familiar à Vista": 438.90,
  "Familiar Parcelado": 478.80,
  "Grupo à Vista": 658.90,
  "Grupo Parcelado": 718.80
};

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    let atualizados = 0;
    let skip = 0;
    
    while (true) {
        const vendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 100, skip);
        if (vendas.length === 0) break;
        
        for (const venda of vendas) {
            if (venda.valor_total > 1000) {
                const valorPlano = VALORES_PLANOS[venda.tipo_plano] || 0;
                const valorCartoes = venda.valor_cartoes || 0;
                
                // Assuming imported vendas don't have CUSTO_BENEFICIO
                // since they weren't configured in the import script.
                const valorTotal = valorPlano + valorCartoes;
                const numeroParcelas = venda.numero_parcelas || 1;
                const valorParcela = valorTotal / numeroParcelas;
                
                console.log(`Atualizando ${venda.id} - ${venda.titular?.nome}: ${venda.valor_total} -> ${valorTotal}`);
                
                await base44.asServiceRole.entities.VendaCartao.update(venda.id, {
                    valor_plano: valorPlano,
                    valor_total: valorTotal,
                    valor_parcela: valorParcela
                });
                
                atualizados++;
                await new Promise(r => setTimeout(r, 100)); // Avoid rate limit
            }
        }
        
        skip += 100;
        if (vendas.length < 100) break;
    }
    
    return new Response(JSON.stringify({ 
        success: true,
        atualizados 
    }), { status: 200 });
});