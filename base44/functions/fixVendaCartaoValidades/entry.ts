import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        let todasVendas = [];
        let skip = 0;
        const batchSize = 100;
        
        // Buscar todas as vendas
        while (true) {
            const batch = await base44.asServiceRole.entities.VendaCartao.list('-created_date', batchSize, skip);
            if (!batch || batch.length === 0) break;
            todasVendas = todasVendas.concat(batch);
            if (batch.length < batchSize) break;
            skip += batchSize;
        }
        
        let atualizados = 0;
        
        for (const venda of todasVendas) {
            if (venda.data_venda) {
                // Presumindo formato YYYY-MM-DD
                const dataVenda = new Date(venda.data_venda + 'T12:00:00Z'); // Evitar problemas de fuso horário
                dataVenda.setFullYear(dataVenda.getFullYear() + 1);
                
                const novaValidade = dataVenda.toISOString().split('T')[0];
                
                // Só atualiza se a data for diferente ou se estiver vazia
                const validadeAtual = venda.validade_cartao ? venda.validade_cartao.substring(0, 10) : '';
                if (validadeAtual !== novaValidade) {
                    console.log(`Atualizando venda ${venda.id}: ${venda.data_venda} -> ${novaValidade} (antes era ${venda.validade_cartao})`);
                    await base44.asServiceRole.entities.VendaCartao.update(venda.id, {
                        validade_cartao: novaValidade
                    });
                    atualizados++;
                    await new Promise(r => setTimeout(r, 250)); // Sleep de 250ms
                    
                    if (atualizados >= 35) { // Atualiza até 35 por vez para evitar rate limit
                        break;
                    }
                }
            }
        }
        
        return Response.json({ 
            success: true, 
            totalVendas: todasVendas.length, 
            vendasAtualizadas: atualizados 
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});