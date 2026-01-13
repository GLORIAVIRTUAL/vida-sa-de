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
    console.log('🔍 Procurando conversa existente para:', phoneNumber);
    let response = await base44.asServiceRole.functions.invoke('listarConversasChatbot');
    const conversasExistentes = response.data?.conversations || [];

    // Buscar a conversa por telefone no metadata
    let conversation = conversasExistentes.find(c => {
      const phone = c.metadata?.phone || c.metadata?.phoneNumber || c.metadata?.telefone;
      return phone === phoneNumber;
    });
    
    console.log('📊 Conversas encontradas:', conversasExistentes.length);
    if (conversation) {
      console.log('✅ Conversa existente encontrada:', conversation.id);
    }

    if (!conversation) {
      console.log('🆕 Criando nova conversa');
      const recifeTz = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: {
          phone: phoneNumber,
          phoneNumber: phoneNumber,
          telefone: phoneNumber,
          pacienteId: pacienteId || 'nao_identificado',
          senderName,
          source: 'whatsapp',
          pipeline_stage: 'novo',
          created_at: recifeTz,
          last_message_at: recifeTz
        }
      });
      console.log('✅ Conversa criada:', conversation.id);
    } else {
      console.log('✅ Usando conversa existente:', conversation.id);

      // Criar contato para rastrear
      try {
        const recifeTz = new Date().toLocaleString('pt-BR', { timeZone: 'America/Recife' });
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          origem: 'WhatsApp',
          status: 'Lead',
          ultima_interacao: recifeTz,
          observacoes: `ID Conversa: ${conversation.id} | Criado em: ${recifeTz}`
        });
        console.log('✅ Contato criado');
      } catch (contatoError) {
        console.log('⚠️ Contato já existe ou erro:', contatoError.message);
      }
    }

    // Adicionar a mensagem do usuário
    console.log('💬 Adicionando mensagem do usuário à conversa...');
    try {
      await base44.asServiceRole.agents.addMessage(conversation, {
        role: 'user',
        content: messageText
      });

      console.log('✅ Mensagem adicionada. Aguardando processamento do agente...');
      
      // Aguardar tempo maior para o agente processar completamente
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Buscar a conversa atualizada múltiplas vezes
      let conversaAtualizada = null;
      let tentativas = 0;
      const maxTentativas = 3;
      
      while (tentativas < maxTentativas) {
        conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
        console.log(`📊 Tentativa ${tentativas + 1}: Total de mensagens:`, conversaAtualizada?.messages?.length || 0);
        
        // Se tiver resposta do assistente, parar de tentar
        const respostaAgente = conversaAtualizada?.messages?.find(msg => msg.role === 'assistant');
        if (respostaAgente?.content) {
          break;
        }
        
        tentativas++;
        if (tentativas < maxTentativas) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      if (conversaAtualizada?.messages) {
        console.log('📋 Mensagens na conversa:', conversaAtualizada.messages.map((m, i) => `${i}: ${m.role} - ${(m.content || '').substring(0, 30)}`).join(' | '));
      }

      if (conversaAtualizada?.messages && Array.isArray(conversaAtualizada.messages) && conversaAtualizada.messages.length > 0) {
        // Procurar resposta do agente (a mais recente)
        const respostaAgente = [...conversaAtualizada.messages].reverse().find(msg => msg.role === 'assistant');

        if (respostaAgente?.content) {
          console.log('📨 Resposta do agente encontrada, enviando para WhatsApp');
          await enviarWhatsApp(phoneNumber, respostaAgente.content);
          return Response.json({ 
            success: true, 
            conversationId: conversation.id,
            message: 'Resposta entregue',
            messagesCount: conversaAtualizada.messages.length
          });
        } else {
          console.log('⚠️ Nenhuma resposta do agente após múltiplas tentativas');
        }
      } else {
        console.log('⚠️ Nenhuma mensagem na conversa após atualização');
      }

      console.log('📤 Enviando resposta padrão enquanto aguarda o agente...');
    } catch (agentError) {
      console.error('❌ Erro ao processar mensagem:', agentError.message, agentError.stack);
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