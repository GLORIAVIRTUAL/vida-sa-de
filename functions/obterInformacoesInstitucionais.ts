import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar configuração do chatbot ativo
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    const config = configs[0];

    if (!config) {
      return Response.json({ 
        informacoes: ''
      });
    }

    return Response.json({ 
      informacoes: config.informacoes_institucionais || ''
    });
  } catch (error) {
    console.error('Erro ao buscar informações institucionais:', error.message);
    return Response.json({ 
      informacoes: ''
    });
  }
});