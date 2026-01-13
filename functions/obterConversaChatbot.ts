import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { conversationId } = await req.json();

    if (!conversationId) {
      return Response.json({ error: 'conversationId é obrigatório' }, { status: 400 });
    }

    // Buscar conversa usando service role
    const conversation = await base44.asServiceRole.agents.getConversation(conversationId);

    return Response.json({ 
      conversation,
      success: true 
    });

  } catch (error) {
    console.error('Erro ao obter conversa:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});