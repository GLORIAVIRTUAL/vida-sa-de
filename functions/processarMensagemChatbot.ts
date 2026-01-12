import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

      Deno.serve(async (req) => {
        try {
          const base44 = createClientFromRequest(req);
          const { phoneNumber, messageText, pacienteId, senderName } = await req.json();

          console.log('📝 Nova mensagem de:', senderName);
          console.log('📱 Telefone:', phoneNumber);
          console.log('💬 Mensagem:', messageText);
          console.log('👤 Paciente ID:', pacienteId);

          // Criar sempre nova conversa para teste
          console.log('🆕 Criando nova conversa');
          const conversation = await base44.asServiceRole.agents.createConversation({
            agent_name: 'chatbot_agendamentos',
            metadata: {
              name: senderName,
              phone: phoneNumber,
              pacienteId: pacienteId || 'nao_identificado',
              senderName,
              source: 'whatsapp',
              pipeline_stage: 'novo',
              last_message_at: new Date().toISOString()
            }
          });
          console.log('✅ Conversa criada:', conversation.id);

    // Criar entrada de contato para rastrear a conversa
    try {
      const contato = await base44.asServiceRole.entities.Contato.create({
        nome: senderName,
        telefone: phoneNumber,
        origem: 'WhatsApp',
        status: 'Lead',
        ultima_interacao: new Date().toISOString(),
        observacoes: `ID Conversa: ${conversation.id}`
      });
      console.log('✅ Contato criado:', contato.id);
    } catch (contatoError) {
      console.log('⚠️ Contato já existe ou erro ao criar:', contatoError.message);
    }

    // Adicionar a mensagem do usuário à conversa para que o agente processe
    console.log('💬 Adicionando mensagem do usuário à conversa...');
    try {
      await base44.asServiceRole.agents.addMessage(conversation, {
        role: 'user',
        content: messageText
      });
      
      console.log('✅ Mensagem adicionada. Aguardando processamento do agente...');
      
      // Aguardar um pouco para o agente processar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Buscar a conversa atualizada com a resposta do agente
      const conversaComResposta = await base44.asServiceRole.agents.getConversation(conversation.id);
      console.log('📊 Conversa atualizada. Total de mensagens:', conversaComResposta?.messages?.length || 0);
      
      // Procurar pela resposta do agente (última mensagem do assistente)
      if (conversaComResposta?.messages && Array.isArray(conversaComResposta.messages) && conversaComResposta.messages.length > 1) {
        const mensagensRevertidas = [...conversaComResposta.messages].reverse();
        const respostaAgente = mensagensRevertidas.find(msg => msg.role === 'assistant');
        
        if (respostaAgente && respostaAgente.content) {
          console.log('📨 Resposta do agente encontrada:', respostaAgente.content.substring(0, 50) + '...');
          await enviarWhatsApp(phoneNumber, respostaAgente.content);
          return Response.json({ 
            success: true, 
            conversationId: conversation.id,
            message: 'Conversa criada e resposta do agente entregue',
            messageCount: conversaComResposta.messages.length
          });
        } else {
          console.log('⚠️ Nenhuma resposta do assistente encontrada ainda');
        }
      } else {
        console.log('⚠️ Nenhuma mensagem na conversa ou conversa com menos de 2 mensagens');
      }
    } catch (agentError) {
      console.log('⚠️ Erro ao processar com agente:', agentError.message);
    }

    // Se algo deu errado, enviar resposta padrão
    console.log('📤 Enviando resposta padrão...');
    await enviarWhatsApp(phoneNumber, '👋 Olá ' + senderName + '! Obrigado por entrar em contato. Um agente irá responder em breve.');

    return Response.json({ 
      success: true, 
      conversationId: conversation.id,
      message: 'Conversa criada e resposta enviada'
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