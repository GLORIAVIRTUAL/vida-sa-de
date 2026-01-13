import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText });
    
    // Buscar conversa existente
    const conversas = await base44.asServiceRole.agents.listConversations({ 
      agent_name: 'chatbot_agendamentos' 
    });
    
    let conversation = conversas.conversations?.find(c => c.metadata?.phone === phoneNumber);
    
    if (!conversation) {
      // Criar nova conversa COM initial_message para já disparar o agente
      console.log('🆕 Nova conversa com mensagem inicial');
      conversation = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: { phone: phoneNumber, senderName, pacienteId },
        initial_message: { role: 'user', content: messageText }
      });
      console.log('✅ Criada:', conversation.id.substring(0, 8));
    } else {
      // Conversa existente - precisa adicionar mensagem
      console.log('📝 Conversa existente:', conversation.id.substring(0, 8));
      
      // Buscar conversa completa com todas as mensagens
      const conversaCompleta = await base44.asServiceRole.agents.getConversation(conversation.id);
      
      // Garantir que messages existe
      if (!conversaCompleta.messages) {
        conversaCompleta.messages = [];
      }
      
      console.log('➕ Adicionando mensagem:', messageText.substring(0, 30));
      await base44.asServiceRole.agents.addMessage(conversaCompleta, {
        role: 'user',
        content: messageText
      });
      console.log('✅ Mensagem adicionada');
    }
    
    // Aguardar resposta do agente com polling
    let resposta = null;
    const delays = [3000, 3000, 4000, 5000, 5000, 5000]; // Total: 25s
    
    for (let i = 0; i < delays.length; i++) {
      await new Promise(resolve => setTimeout(resolve, delays[i]));
      
      const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversation.id);
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
      conversationId: conversation.id
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});