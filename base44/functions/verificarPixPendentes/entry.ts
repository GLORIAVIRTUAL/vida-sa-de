import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROXY_SERVER = 'http://216.238.126.207:3000';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Busca OS com Pix pendente (tem transaction_id e ainda não está Paga/Cancelada)
    const pendentes = await base44.asServiceRole.entities.OrdemServico.filter({
      forma_pagamento: 'PIX',
      status_pagamento: 'Pendente',
    });

    const comTxid = (pendentes || []).filter((os) => os.transaction_id);

    let confirmadas = 0;
    const resultados = [];

    for (const os of comTxid) {
      try {
        const proxyResponse = await fetch(`${PROXY_SERVER}/consultar-pix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txid: os.transaction_id }),
        });

        if (!proxyResponse.ok) {
          resultados.push({ os_id: os.id, erro: `HTTP ${proxyResponse.status}` });
          continue;
        }

        const cobData = await proxyResponse.json();
        const isPaid =
          cobData.status === 'CONCLUIDA' ||
          cobData.status === 'RECEBIDA' ||
          cobData.status === 'PAGA' ||
          (Array.isArray(cobData.pix) && cobData.pix.length > 0);

        if (isPaid) {
          await base44.asServiceRole.entities.OrdemServico.update(os.id, {
            status_pagamento: 'Pago',
            data_pagamento: new Date().toISOString(),
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
            status_anterior: 'Pendente',
            status_novo: 'Pago',
            alterado_por_nome: 'Sistema (verificação automática Pix)',
            valor_final: os.valor_final,
            campos_alterados: [
              { campo: 'status_pagamento', valor_antigo: 'Pendente', valor_novo: 'Pago' },
            ],
            resumo: `Pagamento Pix confirmado automaticamente (Sicredi). TXID: ${os.transaction_id}`,
          });

          confirmadas++;
          resultados.push({ os_id: os.id, numero_os: os.numero_os, status: 'Pago' });
        } else {
          resultados.push({ os_id: os.id, status: cobData.status });
        }
      } catch (err) {
        resultados.push({ os_id: os.id, erro: err.message });
      }
    }

    return Response.json({
      success: true,
      verificadas: comTxid.length,
      confirmadas,
      resultados,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});