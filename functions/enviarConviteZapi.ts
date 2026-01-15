import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { phoneNumber, contatoId, mensagem } = await req.json();

        if (!phoneNumber) {
            return Response.json({ error: 'Número de telefone é obrigatório' }, { status: 400 });
        }

        const instanceId = Deno.env.get("ZAPI_INSTANCE_ID");
        const token = Deno.env.get("ZAPI_TOKEN");
        const clientToken = Deno.env.get("ZAPI_CLIENT_TOKEN");

        if (!instanceId || !token) {
            return Response.json({ error: 'Credenciais do Z-API não configuradas' }, { status: 500 });
        }

        // Formatar número de telefone (remover caracteres não numéricos)
        let formattedPhone = phoneNumber.replace(/\D/g, '');
        // Adicionar código do país se não tiver
        if (!formattedPhone.startsWith('55')) {
            formattedPhone = '55' + formattedPhone;
        }

        // Mensagem padrão de convite
        const mensagemConvite = mensagem || "Olá! 👋 Gostaríamos de convidá-lo(a) para conhecer nossos serviços. Podemos ajudá-lo(a)?";

        const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;
        
        const headers = {
            'Content-Type': 'application/json'
        };
        
        if (clientToken) {
            headers['Client-Token'] = clientToken;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                phone: formattedPhone,
                message: mensagemConvite
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            console.error('Erro Z-API:', data);
            return Response.json({ 
                error: data.error || 'Erro ao enviar mensagem',
                details: data
            }, { status: response.status });
        }

        // Atualizar histórico do contato se contatoId fornecido
        if (contatoId) {
            try {
                const contato = await base44.entities.Contato.get(contatoId);
                const historicoAtual = contato.historico_mensagens || [];
                
                const novaMsg = {
                    role: 'assistant',
                    content: `[📨 Convite enviado]: ${mensagemConvite}`,
                    timestamp: new Date().toISOString(),
                    humano: true
                };
                
                await base44.entities.Contato.update(contatoId, {
                    historico_mensagens: [...historicoAtual, novaMsg],
                    ultima_interacao: new Date().toISOString()
                });
            } catch (updateError) {
                console.error('Erro ao atualizar histórico:', updateError);
            }
        }

        return Response.json({ 
            success: true, 
            messageId: data.messageId || data.zapiMessageId,
            message: 'Convite enviado com sucesso'
        });

    } catch (error) {
        console.error('Erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});