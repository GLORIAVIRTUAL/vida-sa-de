import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    let logId = null;
    const base44 = createClientFromRequest(req);

    try {
        // 1. Log para debug e Registro no Banco
        console.log("📥 Recebendo callback de pagamento da EvoluServices");
        
        let body;
        try {
            body = await req.json();
        } catch (e) {
            body = { error: "Invalid JSON body", raw: "Could not parse" };
        }

        console.log("📦 Payload:", JSON.stringify(body, null, 2));

        // Criar Log inicial
        try {
            const log = await base44.asServiceRole.entities.WebhookLog.create({
                endpoint: "callbackVendaCartao",
                method: req.method,
                body: JSON.stringify(body),
                status: "processing"
            });
            logId = log.id;
        } catch (err) {
            console.error("Falha ao criar log:", err);
        }

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

        const responseData = { success: true, message: "Status updated", novoStatus };
        
        // Atualizar Log com sucesso
        if (logId) {
            await base44.asServiceRole.entities.WebhookLog.update(logId, {
                status: "success",
                response_sent: JSON.stringify(responseData)
            });
        }

        return Response.json(responseData);

    } catch (error) {
        console.error('❌ Erro no callback:', error);
        
        // Atualizar Log com erro
        if (logId) {
            await base44.asServiceRole.entities.WebhookLog.update(logId, {
                status: "error",
                response_sent: JSON.stringify({ error: error.message })
            });
        }

        return Response.json({ error: error.message }, { status: 500 });
    }
});