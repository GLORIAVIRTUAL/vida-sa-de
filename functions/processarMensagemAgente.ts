import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const { phoneNumber, messageText, senderName, pacienteId } = await req.json();
    
    console.log('📨 Processando:', { phoneNumber, messageText });
    
    // Buscar configuração do chatbot
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    const config = configs[0];
    
    if (!config) {
      console.log('❌ ChatbotConfig não encontrado');
      return Response.json({ 
        success: true, 
        resposta: 'Olá! Estou com dificuldades técnicas. Por favor, entre em contato pelo WhatsApp.',
        conversationId: null
      });
    }
    
    console.log('✅ Config encontrada:', config.nome);
    
    // Usar InvokeLLM diretamente para gerar resposta
    console.log('🤖 Chamando LLM...');
    
    const promptCompleto = `${config.prompt_sistema}

---
MENSAGEM DO CLIENTE (${senderName}, telefone ${phoneNumber}):
${messageText}

---
Responda de forma natural e amigável, seguindo as instruções do prompt acima.`;

    const llmResponse = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: promptCompleto,
      add_context_from_internet: false
    });
    
    console.log('✅ LLM respondeu');
    
    // Salvar conversa no histórico (opcional - criar entidade Contato se não existir)
    try {
      const contatos = await base44.asServiceRole.entities.Contato.filter({ telefone: phoneNumber });
      if (contatos.length > 0) {
        // Atualizar último contato
        await base44.asServiceRole.entities.Contato.update(contatos[0].id, {
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse,
          updated_date: new Date().toISOString()
        });
      } else {
        // Criar novo contato
        await base44.asServiceRole.entities.Contato.create({
          nome: senderName,
          telefone: phoneNumber,
          paciente_id: pacienteId,
          ultima_mensagem: messageText,
          ultima_resposta: llmResponse
        });
      }
    } catch (e) {
      console.log('⚠️ Não foi possível salvar histórico:', e.message);
    }
    
    return Response.json({ 
      success: true, 
      resposta: llmResponse,
      conversationId: null
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ 
      error: error.message,
      stack: error.stack 
    }, { status: 500 });
  }
});