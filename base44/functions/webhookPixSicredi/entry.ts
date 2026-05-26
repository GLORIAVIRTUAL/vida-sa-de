import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Parse webhook payload
    const payload = await req.json();
    
    console.log('Webhook Pix Sicredi recebido:', JSON.stringify(payload, null, 2));

    // Extract transaction info
    const { id, status, valor, pix, identificador_unico } = payload;

    if (!id) {
      return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Check if payment was received
    const isPaid = status === 'RECEBIDA' || status === 'PAGA' || (pix && pix.length > 0);

    if (isPaid && identificador_unico) {
      // Fetch the OS to update it
      const ordensServico = await base44.asServiceRole.entities.OrdemServico.filter(
        { id: identificador_unico }
      );

      if (ordensServico.length > 0) {
        const os = ordensServico[0];

        // Update OS status to "Pago"
        await base44.asServiceRole.entities.OrdemServico.update(os.id, {
          status_pagamento: 'Pago',
          data_pagamento: new Date().toISOString(),
          transaction_id: id,
        });

        // Create audit log
        await base44.asServiceRole.entities.AuditoriaOS.create({
          ordem_servico_id: os.id,
          numero_os: os.numero_os,
          paciente_nome: os.paciente_nome,
          tipo_evento: 'update',
          status_anterior: 'Pendente',
          status_novo: 'Pago',
          alterado_por_email: 'sicredi-webhook@system',
          alterado_por_nome: 'Sicredi Webhook',
          valor_final: os.valor_final,
          campos_alterados: [
            { campo: 'status_pagamento', valor_antigo: 'Pendente', valor_novo: 'Pago' },
            { campo: 'data_pagamento', valor_antigo: null, valor_novo: new Date().toISOString() },
            { campo: 'transaction_id', valor_antigo: null, valor_novo: id },
          ],
          resumo: `Pagamento Pix confirmado pelo Sicredi. Valor: R$ ${valor}. ID transação: ${id}`,
        });

        console.log(`OS ${os.numero_os} marcada como Pago`);
      }
    }

    // Log webhook
    await base44.asServiceRole.entities.WebhookLog.create({
      endpoint: 'webhookPixSicredi',
      method: 'POST',
      body: JSON.stringify(payload),
      response_sent: `Processado: isPaid=${isPaid}, transactionId=${id}`,
      status: isPaid ? 'success' : 'processing',
    });

    return Response.json({
      success: true,
      message: isPaid ? 'Pagamento confirmado e OS atualizada' : 'Webhook recebido, aguardando confirmação',
      transaction_id: id,
      is_paid: isPaid,
    });
  } catch (error) {
    console.error('Webhook error:', error.message);
    
    return Response.json({ 
      success: false,
      error: error.message 
    }, { status: 500 });
  }
});