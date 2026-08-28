import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  try {
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = new Date().toISOString();
    
    // Buscar notificações pendentes que já deveriam ter sido enviadas
    const notificationsToSend = await base44.asServiceRole.entities.ScheduledNotification.filter({
      status: 'pending',
      send_at: { $lte: now }
    }, '-created_date', 50);

    if (notificationsToSend.length === 0) {
      return Response.json({ message: 'Nenhuma notificação para processar', processed: 0, errors: 0 });
    }

    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const zapiClientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    if (!instanceId || !zapiToken) {
      return Response.json({ error: 'Z-API não configurado (ZAPI_INSTANCE_ID ou ZAPI_TOKEN ausente)' }, { status: 500 });
    }

    let processedCount = 0;
    let errorCount = 0;

    for (const notification of notificationsToSend) {
      try {
        let telefone = notification.telefone_destino.replace(/\D/g, '');
        if (!telefone.startsWith('55')) telefone = '55' + telefone;

        const headers = { 'Content-Type': 'application/json' };
        if (zapiClientToken) headers['Client-Token'] = zapiClientToken;

        const response = await fetch(
          `https://api.z-api.io/instances/${instanceId}/token/${zapiToken}/send-text`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ phone: telefone, message: notification.mensagem })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || result.error?.message || `HTTP ${response.status}`);
        }

        const timestamp = new Date().toISOString();

        await base44.asServiceRole.entities.ScheduledNotification.update(notification.id, {
          status: 'sent',
          sent_at: timestamp
        });

        // Registrar no log e no histórico do contato para aparecer na conversa
        await base44.asServiceRole.entities.NotificationLog.create({
          tipo_canal: 'whatsapp',
          api_message_id: result.zapiMessageId || result.messageId || result.id || null,
          telefone_destino: telefone,
          mensagem_enviada: notification.mensagem,
          agendamento_id: notification.agendamento_id || null,
          status_entrega: 'enviado',
          timestamp_envio: timestamp
        });

        try {
          const telSem55 = telefone.startsWith('55') ? telefone.slice(2) : telefone;
          const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone });
          const contato = contatos?.[0]
            || (await base44.asServiceRole.entities.Contato.filter({ telefone: telSem55 }))?.[0];
          if (contato) {
            const historico = contato.historico_mensagens || [];
            historico.push({
              role: 'assistant',
              content: `📢 [Notificação agendada]\n${notification.mensagem}`,
              timestamp,
              humano: true
            });
            await base44.asServiceRole.entities.Contato.update(contato.id, {
              historico_mensagens: historico,
              ultima_resposta: notification.mensagem,
              ultima_interacao: timestamp,
              atendimento_humano: true,
              conversa_finalizada: false
            });
          }
        } catch (histError) {
          console.error('⚠️ Erro ao registrar no histórico do contato:', histError.message);
        }

        processedCount++;
      } catch (error) {
        await base44.asServiceRole.entities.ScheduledNotification.update(notification.id, {
          status: 'error',
          processing_log: error.message
        });
        errorCount++;
      }
    }

    return Response.json({ 
      message: 'Fila processada.',
      processed: processedCount,
      errors: errorCount 
    });

  } catch (error) {
    console.error('Erro no processador de fila:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});