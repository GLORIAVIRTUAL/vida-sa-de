import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

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
        pacienteId,
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

    // Adicionar mensagem do usuário e obter resposta do agente
    console.log('💬 Enviando mensagem para o agente...');
    try {
      const conversaComResposta = await base44.asServiceRole.agents.addMessage(conversation, {
        role: 'user',
        content: messageText
      });
      console.log('✅ Resposta do agente recebida:', conversaComResposta?.messages?.length || 0, 'mensagens');
      
      // Se o agente respondeu, extrair a resposta
      if (conversaComResposta?.messages && conversaComResposta.messages.length > 1) {
        const ultimaMensagem = conversaComResposta.messages[conversaComResposta.messages.length - 1];
        if (ultimaMensagem.role === 'assistant') {
          console.log('📨 Enviando resposta do agente via WhatsApp...');
          await enviarWhatsApp(phoneNumber, ultimaMensagem.content);
          return Response.json({ 
            success: true, 
            conversationId: conversation.id,
            message: 'Conversa criada e resposta do agente entregue'
          });
        }
      }
    } catch (msgError) {
      console.log('⚠️ Erro ao processar com agente:', msgError.message);
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