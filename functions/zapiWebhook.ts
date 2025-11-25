import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

// Este é o endpoint que o Z-API irá chamar para nos notificar
// sobre o status das mensagens.

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Este endpoint é público e deve ser chamado apenas pelo Z-API
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ message: "Método não permitido. Use POST." }), { status: 405 });
    }

    try {
        const payload = await req.json();
        console.log('🔔 Webhook Z-API recebido:', payload);

        // Extrair os dados importantes do payload do Z-API
        const messageId = payload.id;
        const eventType = payload.event;
        const status = payload.status; // ex: SENT, DELIVERED, READ, FAIL

        if (!messageId || !status) {
            console.log('⚠️ Payload do webhook inválido (sem ID ou status)');
            return new Response(JSON.stringify({ message: "Payload inválido." }), { status: 400 });
        }

        // Mapear status do Z-API para o nosso sistema
        let nossoStatus;
        switch (status) {
            case 'SENT':
                nossoStatus = 'enviado';
                break;
            case 'DELIVERED':
                nossoStatus = 'entregue';
                break;
            case 'READ':
                nossoStatus = 'lido';
                break;
            case 'FAIL':
            case 'NOT_SENT':
                nossoStatus = 'falhou';
                break;
            default:
                console.log(`Status Z-API "${status}" não mapeado. Ignorando.`);
                return new Response(JSON.stringify({ message: "Status não mapeado" }), { status: 200 });
        }
        
        // Encontrar o log da notificação usando o ID da mensagem da API
        const notificationLogs = await base44.asServiceRole.entities.NotificationLog.filter({
            api_message_id: messageId
        });
        
        if (notificationLogs && notificationLogs.length > 0) {
            const logParaAtualizar = notificationLogs[0];
            console.log(`🔄 Atualizando log ${logParaAtualizar.id} para status: ${nossoStatus}`);
            
            await base44.asServiceRole.entities.NotificationLog.update(logParaAtualizar.id, {
                status_entrega: nossoStatus
            });
            
            console.log(`✅ Log ${logParaAtualizar.id} atualizado com sucesso.`);
        } else {
            console.log(`⚠️ Nenhum log de notificação encontrado para messageId: ${messageId}`);
        }

        // Responder rapidamente para o Z-API com status 200 para confirmar o recebimento
        return new Response(JSON.stringify({ message: "Webhook recebido com sucesso!" }), { status: 200 });

    } catch (error) {
        console.error('❌ Erro ao processar webhook Z-API:', error);
        return new Response(JSON.stringify({ error: 'Erro interno ao processar webhook' }), { status: 500 });
    }
});