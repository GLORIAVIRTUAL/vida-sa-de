import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
        const { dryRun = true } = await req.json();
        
        // Buscar TODAS as vendas importadas (criadas a partir de 10/03/2026 - data da CARMEN)
        const todasVendas = await base44.asServiceRole.entities.VendaCartao.list('-created_date', 1000);
        
        // Filtrar vendas criadas a partir de 10/03/2026 (data da importação da CARMEN)
        const dataCorte = new Date('2026-03-10T00:00:00Z');
        const vendasParaCorrigir = todasVendas.filter(v => new Date(v.created_date) >= dataCorte);
        
        console.log(`Total vendas: ${todasVendas.length}, Para corrigir: ${vendasParaCorrigir.length}`);
        
        const correcoes = [];
        
        for (const venda of vendasParaCorrigir) {
            const updates = {};
            const problemas = [];
            
            // 1. CORRIGIR VALIDADE: deve ser data_venda + 1 ano
            if (venda.data_venda) {
                const dataVenda = new Date(venda.data_venda + 'T12:00:00Z');
                const validadeCorreta = new Date(dataVenda);
                validadeCorreta.setFullYear(validadeCorreta.getFullYear() + 1);
                const validadeCorretaStr = validadeCorreta.toISOString().split('T')[0];
                
                const validadeAtual = (venda.validade_cartao || '').split(' ')[0]; // Remove " 00:00:00" se houver
                if (validadeAtual !== validadeCorretaStr) {
                    updates.validade_cartao = validadeCorretaStr;
                    problemas.push(`Validade: ${validadeAtual} → ${validadeCorretaStr}`);
                }
            }
            
            // 2. CORRIGIR VALORES ABSURDOS (datas misturadas com valores)
            // Padrão: valores como 24032027, 20032027, 18032027 etc (DDMMYYYY no valor)
            const valorTotal = venda.valor_total || 0;
            const valorPlano = venda.valor_plano || 0;
            const valorParcela = venda.valor_parcela || 0;
            
            // Detectar valores absurdos (> 10000 para um cartão é claramente erro)
            if (valorTotal > 10000) {
                // Tentar extrair o valor real
                // Padrão observado: "24032027" = data "24/03/2027" misturada
                // ou "20032002" = "20/03/2002" misturada
                // Na verdade, olhando os dados, parece que o formato é DDMMYYYY concatenado
                // Vamos usar um valor padrão baseado no tipo de plano
                const tipoPlano = venda.tipo_plano || '';
                let valorCorrigido = 0;
                
                if (tipoPlano.includes('Individual')) {
                    valorCorrigido = 298.80; // Valor padrão individual
                } else if (tipoPlano.includes('Familiar')) {
                    // Contar dependentes + titular
                    const numPessoas = 1 + (venda.dependentes?.length || 0);
                    if (numPessoas <= 2) valorCorrigido = 438.90;
                    else if (numPessoas <= 3) valorCorrigido = 468.90;
                    else if (numPessoas <= 5) valorCorrigido = 498.90;
                    else valorCorrigido = 498.90;
                } else if (tipoPlano.includes('Grupo')) {
                    valorCorrigido = 598.90;
                }
                
                const numCartoes = venda.quantidade_cartoes || 1;
                const valorCartoes = numCartoes * 5.0;
                const valorTotalCorrigido = valorCorrigido + valorCartoes;
                
                updates.valor_plano = valorCorrigido;
                updates.valor_total = valorTotalCorrigido;
                updates.valor_cartoes = valorCartoes;
                updates.valor_parcela = valorTotalCorrigido;
                problemas.push(`Valor absurdo: R$ ${valorTotal} → R$ ${valorTotalCorrigido} (plano: R$ ${valorCorrigido} + cartões: R$ ${valorCartoes})`);
            }
            // Detectar valores com casas decimais erradas (ex: 29.88 ao invés de 298.80)
            // ou 2988 ao invés de 298.80
            else if (valorTotal > 0 && valorTotal < 50 && !String(valorTotal).includes('.')) {
                // Valor muito baixo, provavelmente falta multiplicar por 10
                // Ignorar por segurança - esses são raros
            }
            
            if (Object.keys(updates).length > 0) {
                correcoes.push({
                    id: venda.id,
                    nome: venda.titular?.nome || 'Sem nome',
                    data_venda: venda.data_venda,
                    problemas,
                    updates,
                    valores_originais: {
                        validade_cartao: venda.validade_cartao,
                        valor_total: venda.valor_total,
                        valor_plano: venda.valor_plano,
                        valor_parcela: venda.valor_parcela,
                        valor_cartoes: venda.valor_cartoes
                    }
                });
                
                if (!dryRun) {
                    await base44.asServiceRole.entities.VendaCartao.update(venda.id, updates);
                }
            }
        }
        
        return Response.json({
            success: true,
            dryRun,
            totalAnalisadas: vendasParaCorrigir.length,
            totalCorrigidas: correcoes.length,
            correcoes: correcoes.slice(0, 50) // Limitar output para não estourar
        });
        
    } catch (error) {
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});