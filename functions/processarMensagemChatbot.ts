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
          phone: phoneNumber,
          pacienteId,
          senderName,
          source: 'whatsapp',
          pipeline_stage: 'novo'
        }
      });
    } else {
      console.log('📞 Usando conversa existente:', conversation.id);
    }

    // Fazer chamada HTTP direta para adicionar mensagem (evita problemas do SDK)
    const apiUrl = `https://api.base44.com/v1/agents/conversations/${conversation.id}/messages`;
    const serviceToken = Deno.env.get('BASE44_SERVICE_ROLE_KEY') || base44.serviceRoleKey;

    console.log('📤 Enviando mensagem para API...');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceToken}`
      },
      body: JSON.stringify({
        role: 'user',
        content: messageText
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro na API: ${error}`);
    }

    const resultado = await response.json();
    console.log('✅ Mensagem processada com sucesso');

    // Aguardar um pouco para o agente processar
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Buscar a última resposta do assistente
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
    const ultimaMensagem = conversaAtualizada.messages?.[conversaAtualizada.messages.length - 1];

    // Enviar resposta via WhatsApp
    if (ultimaMensagem && ultimaMensagem.role === 'assistant') {
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