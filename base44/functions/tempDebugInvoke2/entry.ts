import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const result = await base44.functions.invoke('processarMensagemAgente', {
        phoneNumber: '5551997443800',
        messageText: 'Teste 2',
        senderName: 'Everton',
        pacienteId: null,
        mediaType: 'text',
        mediaUrl: null,
        messageId: 'buffer_teste_456'
    });
    
    return Response.json({ 
        resultado_invoke: result.data
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});