import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText });
    
    // Buscar conversa existente via SDK
    const conversas = await base44.asServiceRole.agents.listConversations({ 
      agent_name: 'chatbot_agendamentos' 
    });
    
    let conversation = conversas.conversations?.find(c => c.metadata?.phone === phoneNumber);
    let conversationId;
    
    if (!conversation) {
      // Criar nova conversa COM mensagem inicial
      console.log('🆕 Nova conversa com mensagem');
      const newConv = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: { phone: phoneNumber, senderName, pacienteId },
        initial_message: { role: 'user', content: messageText }
      });
      conversationId = newConv.id;
      console.log('✅ Criada:', conversationId.substring(0, 8));
    } else {
      conversationId = conversation.id;
      console.log('📝 Conversa existente:', conversationId.substring(0, 8));
      
      // Buscar conversa completa
      const fullConv = await base44.asServiceRole.agents.getConversation(conversationId);
      
      // Forçar array de mensagens para evitar erro 'map'
      const conversaParaAddMsg = {
        ...fullConv,
        messages: fullConv.messages || []
      };
      
      console.log('➕ Adicionando mensagem...');
      try {
        await base44.asServiceRole.agents.addMessage(conversaParaAddMsg, {
          role: 'user',
          content: messageText
        });
        console.log('✅ Mensagem adicionada');
      } catch (addErr) {
        console.error('⚠️ Erro addMessage:', addErr.message);
        // Tentar criar nova conversa se falhar
        console.log('🔄 Criando nova conversa...');
        const newConv = await base44.asServiceRole.agents.createConversation({
          agent_name: 'chatbot_agendamentos',
          metadata: { phone: phoneNumber, senderName, pacienteId },
          initial_message: { role: 'user', content: messageText }
        });
        conversationId = newConv.id;
        console.log('✅ Nova conversa:', conversationId.substring(0, 8));
      }
    }
    
    // Aguardar resposta do agente com polling
    let resposta = null;
    const delays = [3000, 3000, 4000, 5000, 5000, 5000]; // Total: 25s
    
    for (let i = 0; i < delays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));
      
      const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversationId);
      const msgs = conversaAtualizada.messages || [];
      const ultimaMensagem = msgs[msgs.length - 1];
      
      console.log(`🔍 Tentativa ${i+1}/${delays.length}: ${msgs.length} msgs`);
      
      if (ultimaMensagem?.role === 'assistant' && ultimaMensagem.content) {
        resposta = ultimaMensagem.content;
        console.log('✅ Agente respondeu');
        break;
      }
    }
    
    return Response.json({ 
      success: true, 
      resposta,
      conversationId
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});