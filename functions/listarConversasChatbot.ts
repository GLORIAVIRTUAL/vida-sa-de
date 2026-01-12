import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Usar o endpoint interno do agente para listar conversas
    const conversations = await base44.asServiceRole.agents.listConversations({
      agent_name: 'chatbot_agendamentos'
    });

    console.log('📋 Conversas listadas:', conversations);

    return Response.json({
      success: true,
      conversations: conversations || [],
      count: Array.isArray(conversations) ? conversations.length : 0
    });
  } catch (error) {
    console.error('❌ Erro ao listar conversas:', error.message);
    
    return Response.json({
      error: error.message,
      conversations: []
    }, { status: 500 });
  }
});