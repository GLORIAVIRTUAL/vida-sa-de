import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

    console.log('📝 Nova mensagem de:', senderName);
    console.log('📱 Telefone:', phoneNumber);
    console.log('💬 Mensagem:', messageText);
    console.log('👤 Paciente ID:', pacienteId);

    // Buscar conversa existente ou criar nova
    console.log('🔍 Procurando conversa existente...');
    let response = await base44.asServiceRole.functions.invoke('listarConversasChatbot');
    const conversasExistentes = response.data?.conversas || [];

    let conversation = conversasExistentes.find(c => c.metadata?.phone === phoneNumber);

    if (conversation) {
      console.log('✅ Conversa existente encontrada:', conversation.id);
    } else {
      console.log('🆕 Criando nova conversa');
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: {
          phone: phoneNumber,
          pacienteId: pacienteId || 'nao_identificado',
          senderName,
          source: 'whatsapp',
          pipeline_stage: 'novo',
          last_message_at: new Date().toISOString()
        }
      });
      console.log('✅ Conversa criada:', conversation.id);

      // Criar contato para rastrear
      try {
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Lead',
          ultima_interacao: new Date().toISOString(),
          observacoes: `ID Conversa: ${conversation.id}`
        });
        console.log('✅ Contato criado');
      } catch (contatoError) {
        console.log('⚠️ Contato já existe:', contatoError.message);
      }
    }

    // Adicionar a mensagem do usuário via HTTP direto
    console.log('💬 Adicionando mensagem do usuário à conversa...');
    try {
      // Usar a API interna do agente diretamente
      const internalApiUrl = `https://agents.base44.io/v1/conversations/${conversation.id}/messages`;

      const addMessageResponse = await fetch(internalApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('BASE44_SERVICE_ROLE_KEY') || ''}`
        },
        body: JSON.stringify({
          role: 'user',
          content: messageText
        })
      });

      if (addMessageResponse.ok) {
        console.log('✅ Mensagem adicionada via API');
      } else {
        console.log('⚠️ Status ao adicionar mensagem:', addMessageResponse.status);
      }

      // Aguardar tempo para o agente processar
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Buscar a conversa atualizada
      const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
      console.log('📊 Conversa atualizada. Total de mensagens:', conversaAtualizada?.messages?.length || 0);

      if (conversaAtualizada?.messages && Array.isArray(conversaAtualizada.messages) && conversaAtualizada.messages.length > 0) {
        console.log('📋 Mensagens:', conversaAtualizada.messages.map((m, i) => `${i}: ${m.role}`).join(' | '));

        // Procurar pela resposta do agente
        const respostaAgente = [...conversaAtualizada.messages].reverse().find(msg => msg.role === 'assistant');

        if (respostaAgente && respostaAgente.content) {
          console.log('📨 Resposta do agente encontrada');
          await enviarWhatsApp(phoneNumber, respostaAgente.content);
          return Response.json({ 
            success: true, 
            conversationId: conversation.id,
            message: 'Resposta do agente entregue'
          });
        }
      }

      console.log('⚠️ Agente não respondeu ainda, enviando resposta padrão');
    } catch (agentError) {
      console.error('❌ Erro:', agentError.message);
    }

    // Se algo deu errado, enviar resposta padrão
    console.log('📤 Enviando resposta padrão...');
    await enviarWhatsApp(phoneNumber, '👋 Olá ' + senderName + '! Obrigado por entrar em contato. Um agente irá responder em breve.');

    return Response.json({ 
      success: true, 
      conversationId: conversation.id,
      message: 'Conversa processada'
    });

  } catch (error) {
    console.error('❌ Erro completo:', {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    });

    return Response.json({ 
      error: error.message,
      errorType: error.name,
      errorCode: error.code
    }, { status: 500 });
  }
});


async function enviarWhatsApp(phoneNumber, mensagem) {
  const phoneNumberId = Deno.env.get('META_PHONE_NUMBER_ID');
  const accessToken = Deno.env.get('META_ACCESS_TOKEN');

  if (!phoneNumberId || !accessToken) {
    console.warn('⚠️ WhatsApp não configurado');
    return;
  }

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
  } else {
    console.log('✅ Mensagem enviada via WhatsApp');
  }
}