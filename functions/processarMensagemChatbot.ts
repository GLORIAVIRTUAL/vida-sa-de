import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

    console.log('📝 Nova mensagem de:', senderName);
    console.log('📱 Telefone:', phoneNumber);

    // Buscar conversas existentes
    const conversasExistentes = await base44.asServiceRole.agents.listConversations({
      agent_name: 'chatbot_agendamentos'
    });

    console.log(`📋 Total conversas: ${conversasExistentes?.length || 0}`);

    let conversation = conversasExistentes?.find(
      c => c.metadata?.phone === phoneNumber && c.metadata?.source === 'whatsapp'
    );

    if (!conversation) {
      console.log('🆕 Criando nova conversa');
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: {
          name: senderName,
          phone: phoneNumber,
          pacienteId,
          senderName,
          source: 'whatsapp',
          pipeline_stage: 'novo',
          last_message_at: new Date().toISOString()
        }
      });
      console.log('✅ Conversa criada:', conversation.id);
    } else {
      console.log('📞 Conversa encontrada:', conversation.id);
      // Atualizar timestamp
      await base44.asServiceRole.agents.updateConversation(conversation.id, {
        metadata: {
          ...conversation.metadata,
          last_message_at: new Date().toISOString()
        }
      });
    }

    // ADICIONAR MENSAGEM VIA API HTTP DIRETA (evita bug do SDK)
    console.log('📤 Enviando mensagem via HTTP...');
    
    const appId = Deno.env.get('BASE44_APP_ID');
    const apiUrl = `https://api.base44.com/v1/agents/conversations/${conversation.id}/messages`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': appId
      },
      body: JSON.stringify({
        role: 'user',
        content: messageText
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Erro HTTP API:', response.status, errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const resultado = await response.json();
    console.log('✅ Mensagem adicionada via HTTP');

    // Aguardar o agente processar (5 segundos)
    console.log('⏳ Aguardando agente processar...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Buscar a conversa atualizada
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    
    console.log('📊 Mensagens na conversa:', conversaAtualizada.messages?.length || 0);

    // Encontrar última mensagem do assistente
    const assistantMessage = conversaAtualizada.messages
      ?.slice()
      .reverse()
      .find(msg => msg.role === 'assistant');

    if (assistantMessage?.content) {
      console.log('📤 Enviando resposta ao WhatsApp...');
      await enviarWhatsApp(phoneNumber, assistantMessage.content);
      console.log('✅ Resposta enviada');
    } else {
      console.log('⚠️ Nenhuma resposta do assistente');
    }

    return Response.json({ 
      success: true, 
      conversationId: conversation.id,
      messages: conversaAtualizada.messages?.length || 0
    });

  } catch (error) {
    console.error('❌ Erro:', error.message);
    
    // Enviar mensagem de erro ao usuário
    const { phoneNumber } = await req.json().catch(() => ({}));
    if (phoneNumber) {
      await enviarWhatsApp(
        phoneNumber, 
        'Desculpe, tive um problema ao processar sua mensagem. Por favor, tente novamente.'
      ).catch(() => {});
    }
    
    return Response.json({ 
      error: error.message
    }, { status: 500 });
  }
});

async function enviarWhatsApp(phoneNumber, mensagem) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) return;

  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: mensagem }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Erro WhatsApp:', result);
  }
}