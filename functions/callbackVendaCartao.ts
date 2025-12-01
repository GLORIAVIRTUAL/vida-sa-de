import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Log para debug
        console.log("📥 Recebendo callback de pagamento da EvoluServices");
        const body = await req.json();
        console.log("📦 Payload:", JSON.stringify(body, null, 2));

        // NOTA: A estrutura exata do payload de retorno não foi fornecida na documentação enviada.
        // Estamos assumindo uma estrutura padrão. Se falhar, verifique os logs para ajustar os campos.
        // Exemplo esperado: { transactionId: "...", status: "APPROVED", nsu: "...", authorizationCode: "..." }
        
        const transactionId = body.transactionId || body.transaction?.id;
        const status = body.status || body.transaction?.status;
        const nsu = body.nsu || body.transaction?.nsu;
        const authorizationCode = body.authorizationCode || body.authorization || body.transaction?.authorizationCode;

        if (!transactionId) {
            console.error("❌ ID da transação não encontrado no payload");
            return Response.json({ error: 'Transaction ID missing' }, { status: 400 });
        }

        // 2. Buscar a venda associada
        console.log(`🔍 Buscando venda com transaction_id: ${transactionId}`);
        const vendas = await base44.asServiceRole.entities.VendaCartao.filter({
            transaction_id: transactionId
        });

        if (vendas.length === 0) {
            console.error("❌ Venda não encontrada para esta transação");
            return Response.json({ error: 'Sale not found' }, { status: 404 });
        }

        const venda = vendas[0];

        // 3. Atualizar status com base no retorno
        // Mapeamento de status (Ajuste conforme a documentação real da EvoluServices)
        let novoStatus = venda.status;
        const statusUpper = String(status).toUpperCase();

        if (statusUpper === 'APPROVED' || statusUpper === 'CONFIRMED' || statusUpper === 'SUCESSO') {
            novoStatus = 'Ativo';
        } else if (statusUpper === 'DENIED' || statusUpper === 'FAILED' || statusUpper === 'CANCELLED') {
            novoStatus = 'Falha Pagamento';
        }

        console.log(`🔄 Atualizando status: ${venda.status} -> ${novoStatus}`);

        await base44.asServiceRole.entities.VendaCartao.update(venda.id, {
            status: novoStatus,
            nsu: nsu || venda.nsu,
            autorizacao: authorizationCode || venda.autorizacao,
            observacoes: venda.observacoes ? 
                `${venda.observacoes}\n[${new Date().toISOString()}] Callback: ${status}` : 
                `[${new Date().toISOString()}] Callback: ${status}`
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('❌ Erro no callback:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});