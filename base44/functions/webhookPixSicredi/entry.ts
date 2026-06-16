import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Validação de segurança: token secreto na URL (?token=...)
    const expectedToken = Deno.env.get('SICREDI_WEBHOOK_TOKEN');
    const url = new URL(req.url);
    const receivedToken = url.searchParams.get('token');
    if (expectedToken && receivedToken !== expectedToken) {
      console.warn('Webhook rejeitado: token inválido');
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // O Sicredi faz uma verificação GET ao registrar/validar o webhook
    if (req.method === 'GET' || req.method === 'HEAD') {
      return Response.json({ status: 'ok' }, { status: 200 });
    }

    // Parse webhook payload
    const payload = await req.json();
    
    console.log('Webhook Pix Sicredi recebido:', JSON.stringify(payload, null, 2));

    // Sicredi envia notificações Pix no formato { pix: [{ txid, valor, status, ... }] }
    // Também tratamos o formato simplificado { id, status, valor }
    const pixArray = Array.isArray(payload.pix) ? payload.pix : [];
    const primeiroPix = pixArray[0] || {};

    const txid = payload.txid || primeiroPix.txid || payload.id;
    const status = payload.status || primeiroPix.status;
    const valor = payload.valor || primeiroPix.valor;
    const id = txid;

    if (!txid) {
      return Response.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    // Pix recebido: se há registro de pix pago no array OU status confirmado
    const isPaid = pixArray.length > 0 || status === 'RECEBIDA' || status === 'PAGA' || status === 'CONCLUIDA';

    if (isPaid && txid) {
      // 1ª tentativa: localizar a OS pelo transaction_id exato (txid salvo ao gerar o Pix)
      let ordensServico = await base44.asServiceRole.entities.OrdemServico.filter(
        { transaction_id: txid }
      );

      // 2ª tentativa (fallback): se não achou pelo txid, busca uma OS PIX Pendente
      // com o MESMO valor gerada recentemente. Isso cobre casos em que o Pix foi
      // regerado (txid sobrescrito) e o cliente pagou um QR anterior.
      if (ordensServico.length === 0 && valor != null) {
        const valorNum = Number(valor);
        const pendentes = await base44.asServiceRole.entities.OrdemServico.filter({
          forma_pagamento: 'PIX',
          status_pagamento: 'Pendente',
        });
        const limiteHoras = Date.now() - 6 * 60 * 60 * 1000; // últimas 6 horas
        const candidatas = (pendentes || [])
          .filter((o) => Math.abs(Number(o.valor_final) - valorNum) < 0.01)
          .filter((o) => new Date(o.created_date).getTime() >= limiteHoras)
          .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
        if (candidatas.length > 0) {
          ordensServico = [candidatas[0]];
          console.log(`Fallback por valor: OS ${candidatas[0].numero_os} (R$ ${valor}) associada ao txid ${txid}`);
        }
      }

      if (ordensServico.length > 0 && ordensServico[0].status_pagamento !== 'Pago') {
        const os = ordensServico[0];

        // Update OS status to "Pago"
        await base44.asServiceRole.entities.OrdemServico.update(os.id, {
          status_pagamento: 'Pago',
          data_pagamento: new Date().toISOString(),
          transaction_id: id,
        });

        // Atualizar o agendamento vinculado para "Pago"
        if (os.agendamento_id) {
          try {
            await base44.asServiceRole.entities.Agendamento.update(os.agendamento_id, {
              status: 'Pago',
            });
          } catch (e) {
            console.error('Falha ao atualizar agendamento:', e.message);
          }
        }

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