import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const { action, phoneNumber, templateName, templateLanguage, components } = await req.json();

        const accessToken = Deno.env.get("META_ACCESS_TOKEN");
        const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
        const businessAccountId = Deno.env.get("META_BUSINESS_ACCOUNT_ID");

        if (!accessToken || !phoneNumberId || !businessAccountId) {
            return Response.json({ error: 'Credenciais da Meta não configuradas' }, { status: 500 });
        }

        // Ação: Listar templates aprovados
        if (action === 'listarTemplates') {
            const url = `https://graph.facebook.com/v18.0/${businessAccountId}/message_templates?status=APPROVED&limit=100`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Erro Meta API:', data);
                return Response.json({ error: data.error?.message || 'Erro ao buscar templates' }, { status: response.status });
            }

            // Filtrar apenas templates aprovados e formatar
            const templates = (data.data || []).map(template => ({
                id: template.id,
                name: template.name,
                language: template.language,
                category: template.category,
                status: template.status,
                components: template.components
            }));

            return Response.json({ templates });
        }

        // Ação: Enviar template
        if (action === 'enviarTemplate') {
            if (!phoneNumber || !templateName) {
                return Response.json({ error: 'Telefone e nome do template são obrigatórios' }, { status: 400 });
            }

            // Formatar número de telefone (remover caracteres não numéricos)
            let formattedPhone = phoneNumber.replace(/\D/g, '');
            // Adicionar código do país se não tiver
            if (!formattedPhone.startsWith('55')) {
                formattedPhone = '55' + formattedPhone;
            }

            const messagePayload = {
                messaging_product: "whatsapp",
                to: formattedPhone,
                type: "template",
                template: {
                    name: templateName,
                    language: {
                        code: templateLanguage || "pt_BR"
                    }
                }
            };

            // Adicionar components se fornecidos (para templates com variáveis)
            if (components && components.length > 0) {
                messagePayload.template.components = components;
            }

            const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messagePayload)
            });

            const data = await response.json();
            
            if (!response.ok) {
                console.error('Erro ao enviar template:', data);
                return Response.json({ 
                    error: data.error?.message || 'Erro ao enviar template',
                    details: data.error
                }, { status: response.status });
            }

            return Response.json({ 
                success: true, 
                messageId: data.messages?.[0]?.id,
                message: 'Template enviado com sucesso'
            });
        }

        return Response.json({ error: 'Ação inválida' }, { status: 400 });

    } catch (error) {
        console.error('Erro:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});