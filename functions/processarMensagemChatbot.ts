import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

    console.log('📝 Processando mensagem de:', senderName);

    // Buscar ou criar conversa
    const conversasExistentes = await base44.asServiceRole.agents.listConversations({
      agent_name: 'chatbot_agendamentos'
    });

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
    } else {
      console.log('📞 Usando conversa existente:', conversation.id);
      // Atualizar metadata da conversa
      await base44.asServiceRole.agents.updateConversation(conversation.id, {
        metadata: {
          ...conversation.metadata,
          last_message_at: new Date().toISOString()
        }
      });
    }

    // Adicionar mensagem do usuário usando o SDK (corrigido)
    console.log('📤 Adicionando mensagem à conversa...');

    // Recarregar conversa completa com todas as mensagens
    const conversaCompleta = await base44.asServiceRole.agents.getConversation(conversation.id);
    
    console.log('📊 Conversa antes:', {
      id: conversaCompleta.id,
      messages: conversaCompleta.messages?.length || 0
    });

    // Adicionar mensagem - SDK tratará a resposta do agente automaticamente
    await base44.asServiceRole.agents.addMessage(conversaCompleta, {
      role: 'user',
      content: messageText
    });

    console.log('✅ Mensagem adicionada ao agente');

    // Aguardar processamento do agente
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Buscar resposta atualizada
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    
    console.log('📊 Conversa depois:', {
      id: conversaAtualizada.id,
      messages: conversaAtualizada.messages?.length || 0
    });

    // Encontrar última mensagem do assistente
    const ultimaMensagem = conversaAtualizada.messages?.findLast(
      msg => msg.role === 'assistant'
    );

    // Enviar resposta via WhatsApp se houver
    if (ultimaMensagem?.content) {
      try {
        await enviarRespostaWhatsApp(phoneNumber, ultimaMensagem.content);
      } catch (error) {
        console.error('⚠️ Erro ao enviar WhatsApp:', error.message);
      }
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