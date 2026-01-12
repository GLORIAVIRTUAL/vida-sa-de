import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

    console.log('📝 Processando mensagem de:', senderName);

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
      console.log('📋 Metadata:', conversation.metadata);
    } else {
      console.log('📞 Conversa existente encontrada:', conversation.id);
    }

    // Adicionar mensagem do usuário
    console.log('📤 Adicionando mensagem à conversa...');

    // Garantir que a conversa tem estrutura correta
    const conversaCompleta = {
      id: conversation.id,
      agent_name: 'chatbot_agendamentos',
      messages: conversation.messages || []
    };
    
    console.log('📊 Conversa antes:', {
      id: conversaCompleta.id,
      messages: conversaCompleta.messages.length
    });

    // Adicionar mensagem manualmente
    await base44.asServiceRole.agents.addMessage(conversaCompleta, {
      role: 'user',
      content: messageText
    });

    console.log('✅ Mensagem adicionada');

    // Aguardar processamento do agente (tempo maior)
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Buscar conversa atualizada
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    
    console.log('📊 Conversa depois:', {
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
      conversationId: conversation.id
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