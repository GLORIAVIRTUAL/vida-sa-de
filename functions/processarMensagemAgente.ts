import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const APP_ID = Deno.env.get('BASE44_APP_ID');
const BASE_URL = 'https://app.base44.com/api/apps';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const authHeader = req.headers.get('authorization') || '';
    
    const { phoneNumber, messageText, senderName, pacienteId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText });
    
    // Buscar conversa existente via SDK
    const conversas = await base44.asServiceRole.agents.listConversations({ 
      agent_name: 'chatbot_agendamentos' 
    });
    
    let conversationId = conversas.conversations?.find(c => c.metadata?.phone === phoneNumber)?.id;
    
    if (!conversationId) {
      // Criar nova conversa via SDK
      console.log('🆕 Nova conversa');
      const newConv = await base44.asServiceRole.agents.createConversation({
        agent_name: 'chatbot_agendamentos',
        metadata: { phone: phoneNumber, senderName, pacienteId }
      });
      conversationId = newConv.id;
      console.log('✅ Criada:', conversationId.substring(0, 8));
    } else {
      console.log('📝 Conversa existente:', conversationId.substring(0, 8));
    }
    
    // Adicionar mensagem via API REST diretamente
    console.log('➕ Adicionando mensagem via REST...');
    const addMsgResponse = await fetch(
      `${BASE_URL}/${APP_ID}/agents/chatbot_agendamentos/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify({
          role: 'user',
          content: messageText
        })
      }
    );
    
    if (!addMsgResponse.ok) {
      const errorText = await addMsgResponse.text();
      console.error('❌ Erro ao adicionar mensagem:', addMsgResponse.status, errorText);
      throw new Error(`Falha ao adicionar mensagem: ${addMsgResponse.status}`);
    }
    
    console.log('✅ Mensagem enviada via REST');
    
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