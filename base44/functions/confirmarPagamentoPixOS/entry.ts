import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROXY_SERVER = 'http://216.238.126.207:3000';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ordem_servico_id, txid } = await req.json();

    if (!ordem_servico_id) {
      return Response.json({ error: 'Missing ordem_servico_id' }, { status: 400 });
    }

    // Buscar a OS
    const ordens = await base44.asServiceRole.entities.OrdemServico.filter({ id: ordem_servico_id });
    if (!ordens || ordens.length === 0) {
      return Response.json({ error: 'OS não encontrada' }, { status: 404 });
    }
    const os = ordens[0];

    const transactionId = txid || os.transaction_id;
    if (!transactionId) {
      return Response.json({ error: 'Esta OS não possui transação Pix vinculada.' }, { status: 400 });
    }

    // Verificar status real do Pix via servidor-ponte (mesma rota usada para gerar)
    const proxyResponse = await fetch(`${PROXY_SERVER}/consultar-pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txid: transactionId }),
    });

    const responseText = await proxyResponse.text();

    if (!proxyResponse.ok) {
      console.error('Proxy/Sicredi error:', responseText);
      return Response.json({
        error: 'Falha ao consultar status do Pix',
        details: responseText,
      }, { status: 500 });
    }

    const cobData = JSON.parse(responseText);
    const isPaid = cobData.status === 'CONCLUIDA' || cobData.status === 'RECEBIDA' || cobData.status === 'PAGA' ||
                   (Array.isArray(cobData.pix) && cobData.pix.length > 0);

    if (!isPaid) {
      return Response.json({
        success: true,
        is_paid: false,
        status: cobData.status,
        message: 'Pagamento ainda não confirmado.',
      });
    }

    // Pagamento confirmado: marcar OS como Pago (se ainda não estiver)
    if (os.status_pagamento !== 'Pago') {
      await base44.asServiceRole.entities.OrdemServico.update(os.id, {
        status_pagamento: 'Pago',
        data_pagamento: new Date().toISOString(),
        transaction_id: transactionId,
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

      await base44.asServiceRole.entities.AuditoriaOS.create({
        ordem_servico_id: os.id,
        numero_os: os.numero_os,
        paciente_nome: os.paciente_nome,
        tipo_evento: 'update',
        status_anterior: os.status_pagamento,
        status_novo: 'Pago',
        alterado_por_email: user.email,
        alterado_por_nome: user.full_name || user.email,
        valor_final: os.valor_final,
        campos_alterados: [
          { campo: 'status_pagamento', valor_antigo: os.status_pagamento, valor_novo: 'Pago' },
        ],
        resumo: `Pagamento Pix confirmado (Sicredi). TXID: ${transactionId}`,
      });
    }

    return Response.json({
      success: true,
      is_paid: true,
      status: cobData.status,
      message: 'Pagamento Pix confirmado. OS marcada como Paga.',
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});