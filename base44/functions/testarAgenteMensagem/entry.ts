import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, testMessage } = await req.json();

    console.log('🧪 TESTE: Obtendo conversa:', conversationId);
    const conversation = await base44.asServiceRole.agents.getConversation(conversationId);
    console.log('📊 Conversa antes:', {
      id: conversation.id,
      totalMensagens: conversation.messages?.length || 0,
      metadata: conversation.metadata
    });

    console.log('🧪 TESTE: Adicionando mensagem de teste...');
    const result = await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: testMessage || 'Mensagem de teste do sistema'
    });

    console.log('✅ Resultado addMessage:', result);

    // Aguardar 3 segundos
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('🧪 TESTE: Obtendo conversa atualizada...');
    const conversaAtualizada = await base44.asServiceRole.agents.getConversation(conversationId);
    console.log('📊 Conversa depois:', {
      id: conversaAtualizada.id,
      totalMensagens: conversaAtualizada.messages?.length || 0,
      mensagens: conversaAtualizada.messages
    });

    return Response.json({
      success: true,
      antes: conversation.messages?.length || 0,
      depois: conversaAtualizada.messages?.length || 0,
      mensagens: conversaAtualizada.messages
    });

  } catch (error) {
    console.error('❌ Erro no teste:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});