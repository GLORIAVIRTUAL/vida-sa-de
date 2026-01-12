import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

    console.log('📝 Processando mensagem de:', senderName);
    console.log('📱 Telefone:', phoneNumber);
    console.log('💬 Mensagem:', messageText);

    // Buscar ou criar conversa
    console.log('🔍 Buscando conversas existentes...');
    const conversasExistentes = await base44.asServiceRole.agents.listConversations({
      agent_name: 'chatbot_agendamentos'
    });

    console.log(`📋 Total de conversas: ${conversasExistentes?.length || 0}`);

    let conversation = conversasExistentes?.find(
      c => c.metadata?.phone === phoneNumber && c.metadata?.source === 'whatsapp'
    );

    if (!conversation) {
      console.log('🆕 Criando nova conversa para:', phoneNumber);
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
      console.log('📞 Conversa existente encontrada:', conversation.id);
    }

    // Enviar mensagem diretamente via API HTTP (evita problemas do SDK)
    console.log('📤 Enviando mensagem via API HTTP...');
    
    const apiUrl = `${Deno.env.get('BASE44_API_URL') || 'https://api.base44.com'}/v1/agents/conversations/${conversation.id}/messages`;
    const appId = Deno.env.get('BASE44_APP_ID');
    
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
      console.error('❌ Erro da API:', errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const resultado = await response.json();
    console.log('✅ Mensagem adicionada, aguardando resposta do agente...');

    // Aguardar processamento do agente
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Buscar resposta atualizada
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    
    console.log('📊 Conversa atualizada:', {
      id: conversaAtualizada.id,
      messages: conversaAtualizada.messages?.length || 0
    });

    // Encontrar última mensagem do assistente
    const ultimaMensagem = conversaAtualizada.messages?.reverse().find(
      msg => msg.role === 'assistant'
    );

    // Enviar resposta via WhatsApp
    if (ultimaMensagem?.content) {
      console.log('📤 Enviando resposta ao WhatsApp...');
      try {
        await enviarRespostaWhatsApp(phoneNumber, ultimaMensagem.content);
        console.log('✅ Resposta enviada com sucesso');
      } catch (error) {
        console.error('⚠️ Erro ao enviar WhatsApp:', error.message);
      }
    } else {
      console.log('⚠️ Nenhuma resposta do assistente encontrada');
    }

    return Response.json({ 
      success: true, 
      conversationId: conversation.id,
      messagesCount: conversaAtualizada.messages?.length || 0
    });

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

async function enviarRespostaWhatsApp(phoneNumber, mensagem) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken || !mensagem) {
    return;
  }

  const metaUrl = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  const response = await fetch(metaUrl, {
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

  if (response.ok) {
    console.log('✅ Resposta enviada via Meta:', result.messages?.[0]?.id);
  } else {
    console.error('❌ Erro ao enviar Meta:', result);
  }
}