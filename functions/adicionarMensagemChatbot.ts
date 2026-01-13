import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId, message } = await req.json();

    if (!conversationId || !message) {
      return Response.json({ error: 'conversationId e message são obrigatórios' }, { status: 400 });
    }

    console.log('📤 Enviando mensagem para conversa:', conversationId);
    console.log('💬 Mensagem:', message);

    // Buscar conversa usando service role
    const conversation = await base44.asServiceRole.agents.getConversation(conversationId);

    // Adicionar mensagem do usuário
    await base44.asServiceRole.agents.addMessage(conversation, {
      role: 'user',
      content: message
    });

    console.log('✅ Mensagem adicionada com sucesso');

    return Response.json({ 
      success: true,
      conversationId 
    });

  } catch (error) {
    console.error('❌ Erro ao adicionar mensagem:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});