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

        // Extração robusta de dados
        const transactionId = payload.transactionId || payload.transaction?.transactionId || payload.transaction?.id;
        const status = payload.status || payload.transaction?.status;
        const nsu = payload.nsu || payload.transaction?.nsu;
        const authorizationCode = payload.authorizationCode || payload.authorization || payload.transaction?.authorizationCode;

        if (!transactionId) {
            console.error('❌ Transaction ID não encontrado no payload');
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
        const statusUpper = String(status || '').toUpperCase();
        
        if (['CONFIRMED', 'APPROVED', 'SUCESSO', 'PAID'].includes(statusUpper)) {
            novoStatus = 'Pago';
        } else if (['CANCELLED', 'DENIED', 'FAILED', 'VOIDED'].includes(statusUpper)) {
            novoStatus = 'Cancelado';
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