import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        }

        const body = await req.json();
        const { 
            telefone, 
            mensagem, 
            tipo = 'whatsapp',
            agendamento_id,
            paciente_nome
        } = body;

        if (!telefone || !mensagem) {
            return new Response(JSON.stringify({ error: 'Telefone e mensagem são obrigatórios' }), { status: 400 });
        }
        
        const telefoneCompleto = `55${telefone.replace(/\D/g, '')}`;
        if (telefoneCompleto.length < 12) {
             return new Response(JSON.stringify({ error: 'Formato de telefone inválido' }), { status: 400 });
        }

        const timestamp = new Date().toISOString();

        if (tipo === 'whatsapp') {
            // DEBUG: Vamos verificar cada variável individualmente
            const whatsappInstanceId = Deno.env.get("WHATSAPP_INSTANCE_ID");
            const tokenDaInstancia = Deno.env.get("WHATSAPP_API_KEY");
            const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

            console.log('=== DEBUG DAS VARIÁVEIS DE AMBIENTE ===');
            console.log(`WHATSAPP_INSTANCE_ID: ${whatsappInstanceId ? `PRESENTE (${whatsappInstanceId.substring(0, 8)}...)` : 'AUSENTE'}`);
            console.log(`WHATSAPP_API_KEY: ${tokenDaInstancia ? `PRESENTE (${tokenDaInstancia.substring(0, 8)}...)` : 'AUSENTE'}`);
            console.log(`ZAPI_CLIENT_TOKEN: ${clientToken ? `PRESENTE (${clientToken.substring(0, 8)}...)` : 'AUSENTE'}`);

            // Verificação mais detalhada com mensagem específica
            const variaveisAusentes = [];
            if (!whatsappInstanceId) variaveisAusentes.push('WHATSAPP_INSTANCE_ID');
            if (!tokenDaInstancia) variaveisAusentes.push('WHATSAPP_API_KEY');
            if (!clientToken) variaveisAusentes.push('ZAPI_CLIENT_TOKEN');

            if (variaveisAusentes.length > 0) {
                const mensagemErro = `Variáveis ausentes: ${variaveisAusentes.join(', ')}. Por favor, configure-as em Settings → Environment Variables.`;
                console.error('❌ ERRO:', mensagemErro);
                return new Response(JSON.stringify({ error: mensagemErro }), { status: 500 });
            }

            const endpointUrl = `https://api.z-api.io/instances/${whatsappInstanceId}/token/${tokenDaInstancia}/send-text`;

            console.log('=== ENVIANDO PARA Z-API ===');
            console.log('URL:', endpointUrl);

            try {
                const response = await fetch(endpointUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'client-token': clientToken
                    },
                    body: JSON.stringify({
                        phone: telefoneCompleto,
                        message: mensagem
                    })
                });

                const responseText = await response.text();
                console.log(`RESPOSTA DA Z-API (Status: ${response.status}):`, responseText);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${responseText}`);
                }
                
                const resultadoApi = JSON.parse(responseText);

                await base44.asServiceRole.entities.NotificationLog.create({
                    tipo_canal: tipo,
                    api_message_id: resultadoApi.id || resultadoApi.messageId || null,
                    telefone_destino: telefoneCompleto,
                    mensagem_enviada: mensagem,
                    agendamento_id: agendamento_id || null,
                    paciente_nome: paciente_nome || '',
                    status_entrega: 'pendente',
                    timestamp_envio: timestamp,
                    resposta_api: JSON.stringify(resultadoApi)
                });
                
                return new Response(JSON.stringify({
                    sucesso: true,
                    messageId: resultadoApi.id || resultadoApi.messageId,
                }));

            } catch (error) {
                console.error(`❌ Erro ao comunicar com Z-API:`, error);
                return new Response(JSON.stringify({ 
                    error: `Erro ao enviar mensagem: ${error.message}` 
                }), { status: 500 });
            }
        }
    } catch (error) {
        console.error('Erro geral na função:', error);
        return new Response(JSON.stringify({ error: `Erro interno: ${error.message}` }), { status: 500 });
    }
});