import { createClientFromRequest } from 'npm:@base44/sdk@0.7.0';

// Esta função é o "robô" que processa a fila
// Ela deve ser chamada por um serviço de CRON externo

// Pega a função de envio para reutilizar a lógica
const sendNotificationLogic = async (notificationData) => {
    const { tipo, telefone_destino, mensagem } = notificationData;

    if (tipo === 'whatsapp') {
        const apiUrl = Deno.env.get("WHATSAPP_API_URL");
        const apiKey = Deno.env.get("WHATSAPP_API_KEY");
        const instanceId = Deno.env.get("WHATSAPP_INSTANCE_ID");

        if (!apiUrl || !apiKey || !instanceId) {
            throw new Error('WhatsApp não está configurado completamente');
        }

        const response = await fetch(`${apiUrl}/message/sendText/${instanceId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey
            },
            body: JSON.stringify({
                number: telefone_destino,
                text: mensagem
            })
        });

        const resultado = await response.json();
        if (!response.ok) {
            throw new Error(resultado.message || resultado.error?.message || 'Erro da API do WhatsApp');
        }
        return resultado;
    }
    // Adicionar lógica para SMS aqui se necessário
    throw new Error(`Tipo de canal "${tipo}" não suportado pelo processador de fila.`);
};

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    // Medida de segurança para garantir que só o CRON chame esta função
    const cronSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("Authorization");

    if (!cronSecret || `Bearer ${cronSecret}` !== authHeader) {
        return new Response(JSON.stringify({ error: 'Unauthorized: CRON Secret inválido ou ausente' }), { status: 401 });
    }

    try {
        const now = new Date().toISOString();
        
        // Busca notificações pendentes que já deveriam ter sido enviadas
        const notificationsToSend = await base44.asServiceRole.entities.ScheduledNotification.filter({
            status: 'pending',
            send_at: { $lte: now }
        }, '-created_date', 50); // Processa até 50 por vez

        if (notificationsToSend.length === 0) {
            return new Response(JSON.stringify({ message: 'Nenhuma notificação para processar', processed: 0, errors: 0 }));
        }

        let processedCount = 0;
        let errorCount = 0;

        for (const notification of notificationsToSend) {
            try {
                // Tenta enviar a notificação
                await sendNotificationLogic({
                    tipo: notification.tipo_canal,
                    telefone_destino: notification.telefone_destino,
                    mensagem: notification.mensagem,
                });

                // Se teve sucesso, atualiza o status
                await base44.asServiceRole.entities.ScheduledNotification.update(notification.id, {
                    status: 'sent',
                    sent_at: new Date().toISOString()
                });

                processedCount++;

            } catch (error) {
                // Se deu erro, registra o erro
                await base44.asServiceRole.entities.ScheduledNotification.update(notification.id, {
                    status: 'error',
                    processing_log: error.message
                });
                errorCount++;
            }
        }

        return new Response(JSON.stringify({ 
            message: `Fila processada.`,
            processed: processedCount,
            errors: errorCount 
        }));

    } catch (error) {
        console.error('Erro no processador de fila:', error);
        return new Response(JSON.stringify({ error: 'Erro fatal no processador de fila', details: error.message }), { status: 500 });
    }
});