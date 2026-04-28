import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await base44.asServiceRole.functions.invoke('processarMensagemAgente', {
        phoneNumber: '5551997443800',
        messageText: 'Mensagem de teste de diagnostico',
        senderName: 'Everton',
        pacienteId: null,
        mediaType: 'text',
        mediaUrl: null,
        messageId: 'buffer_teste_123'
    });
    
    const contato = await base44.asServiceRole.entities.Contato.get('69d7b943bac0536158ede052');
    
    return Response.json({ 
        resultado_invoke: result.data,
        historico: contato.historico_mensagens.slice(-2)
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});