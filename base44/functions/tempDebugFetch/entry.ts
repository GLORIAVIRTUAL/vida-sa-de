import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const appId = Deno.env.get('BASE44_APP_ID');
    const url = `https://base44.app/api/apps/${appId}/functions/processarMensagemAgente`;
    
    console.log('Testando fetch direto...');
    const result = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            phoneNumber: '5551997443800',
            messageText: 'Teste 3',
            senderName: 'Everton',
            pacienteId: null,
            mediaType: 'text',
            mediaUrl: null,
            messageId: 'buffer_teste_789'
        })
    });
    
    if (!result.ok) {
        return Response.json({ error: await result.text() }, { status: result.status });
    }
    
    return Response.json({ 
        resultado: await result.json()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});