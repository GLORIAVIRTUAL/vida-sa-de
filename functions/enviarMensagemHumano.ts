import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { phoneNumber, messageText, contatoId } = await req.json();
    
    if (!phoneNumber || !messageText) {
      return Response.json({ error: 'phoneNumber e messageText são obrigatórios' }, { status: 400 });
    }

    console.log('📤 Enviando mensagem humana para:', phoneNumber);

    // Enviar mensagem via WhatsApp (Z-API ou Meta)
    const phoneId = Deno.env.get("META_PHONE_NUMBER_ID");
    const accessToken = Deno.env.get("META_ACCESS_TOKEN");

    if (phoneId && accessToken) {
      // Formatar número
      let numero = phoneNumber.replace(/\D/g, '');
      if (!numero.startsWith('55')) numero = '55' + numero;

      const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: numero,
          type: 'text',
          text: { body: messageText }
        })
      });

      const result = await response.json();
      console.log('📱 WhatsApp response:', result);
    }

    // Atualizar histórico do contato
    if (contatoId) {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ id: contatoId });
      if (contatos.length > 0) {
        const contato = contatos[0];
        const historicoAtual = contato.historico_mensagens || [];
        const timestamp = new Date().toISOString();
        
        historicoAtual.push({
          role: 'assistant',
          content: `[👤 ${user.full_name || 'Recepção'}]: ${messageText}`,
          timestamp,
          humano: true
        });

        await base44.asServiceRole.entities.Contato.update(contatoId, {
          historico_mensagens: historicoAtual.slice(-50),
          ultima_resposta: messageText,
          ultima_interacao: timestamp,
          total_mensagens: (contato.total_mensagens || 0) + 1
        });
      }
    }

    return Response.json({ success: true, message: 'Mensagem enviada' });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});