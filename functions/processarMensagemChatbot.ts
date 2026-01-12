import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { conversationId, messageText, phoneNumber, senderName } = await req.json();

    console.log('📝 Processando mensagem para conversa:', conversationId);

    // Buscar conversa completa
    const conversation = await base44.asServiceRole.agents.getConversation(conversationId);
    
    if (!conversation) {
      throw new Error('Conversa não encontrada');
    }

    // Garantir que messages existe
    if (!conversation.messages) {
      conversation.messages = [];
    }

    console.log('📊 Conversa atual:', {
      id: conversation.id,
      messageCount: conversation.messages.length
    });

    // Adicionar mensagem do usuário
    const resultado = await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: messageText
    });

    console.log('✅ Mensagem adicionada com sucesso');

    // Enviar resposta automática via WhatsApp (opcional)
    if (phoneNumber) {
      try {
        await enviarRespostaWhatsApp(phoneNumber, resultado);
      } catch (error) {
        console.error('⚠️ Erro ao enviar resposta WhatsApp:', error.message);
      }
    }

    return Response.json({ 
      success: true, 
      conversationId,
      messageCount: conversation.messages.length + 1
    });

  } catch (error) {
    console.error('❌ Erro ao processar mensagem:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});

async function enviarRespostaWhatsApp(phoneNumber, resultado) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    console.warn('⚠️ Credenciais Meta não configuradas');
    return;
  }

  // Extrair última mensagem do assistente
  const ultimaMensagem = resultado?.messages?.[resultado.messages.length - 1];
  
  if (!ultimaMensagem || ultimaMensagem.role !== 'assistant') {
    console.log('ℹ️ Nenhuma resposta do assistente para enviar');
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
      text: {
        body: ultimaMensagem.content
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    console.error('❌ Erro ao enviar resposta Meta:', result);
    return;
  }

  console.log('✅ Resposta enviada via Meta:', result.messages?.[0]?.id);
}