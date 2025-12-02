import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        if (req.method !== 'POST') {
            return Response.json({ error: 'Method not allowed' }, { status: 405 });
        }

        const payload = await req.json();
        console.log('🔔 Webhook Recebido (OS):', JSON.stringify(payload));

        // Log inicial
        await base44.asServiceRole.entities.WebhookLog.create({
            endpoint: 'callbackOrdemServico',
            method: 'POST',
            body: JSON.stringify(payload),
            status: 'processing'
        });

        const { transactionId, status, nsu, authorizationCode } = payload;

        if (!transactionId) {
            return Response.json({ error: 'Transaction ID missing' }, { status: 400 });
        }

        // Buscar OS pelo transaction_id
        // Nota: Base44 filter retorna array
        const osList = await base44.asServiceRole.entities.OrdemServico.filter({
            transaction_id: transactionId
        });

        const ordemServico = osList[0];

        if (!ordemServico) {
            console.error('❌ OS não encontrada para transactionId:', transactionId);
            return Response.json({ error: 'Order not found' }, { status: 404 });
        }

        // Mapear status
        let novoStatus = ordemServico.status_pagamento;
        if (status === 'CONFIRMED' || status === 'APPROVED') {
            novoStatus = 'Pago';
        } else if (status === 'CANCELLED' || status === 'DENIED') {
            novoStatus = 'Cancelado'; // Ou manter pendente/erro
        }

        await base44.asServiceRole.entities.OrdemServico.update(ordemServico.id, {
            status_pagamento: novoStatus,
            nsu: nsu || ordemServico.nsu,
            autorizacao: authorizationCode || ordemServico.autorizacao,
            observacoes: (ordemServico.observacoes || '') + `\n[Webhook]: Status atualizado para ${status}`
        });

        return Response.json({ success: true });

    } catch (error) {
        console.error('❌ Erro Webhook:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});