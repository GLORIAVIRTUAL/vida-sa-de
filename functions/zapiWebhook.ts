import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ message: "Método não permitido. Use POST." }), { status: 405 });
    }

    try {
        const payload = await req.json();

        // Verificar se é uma mensagem RECEBIDA (do paciente)
        if (payload.isGroup === false && payload.fromMe === false && payload.text?.message) {
            return await processarMensagemRecebida(base44, payload);
        }

        // Caso seja atualização de STATUS de mensagem enviada
        const messageId = payload.id;
        const status = payload.status;

        if (messageId && status) {
            return await processarStatusMensagem(base44, messageId, status);
        }

        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });

    } catch (error) {
        return new Response(JSON.stringify({ error: 'Erro interno', details: error.message }), { status: 500 });
    }
});

// Processa mensagens recebidas dos pacientes (confirmações)
async function processarMensagemRecebida(base44, payload) {
    const telefone = payload.phone;
    const mensagem = payload.text?.message?.toLowerCase().trim() || '';

    // Palavras-chave para confirmação
    const palavrasConfirmacao = ['sim', 'confirmo', 'confirmar', 'confirmado', 'ok', 'vou', 'estarei', 'irei', 's', '1', 'yes'];
    const ehConfirmacao = palavrasConfirmacao.some(p => mensagem === p || mensagem.startsWith(p + ' '));

    if (!ehConfirmacao) {
        return new Response(JSON.stringify({ message: "Mensagem não é confirmação" }), { status: 200 });
    }

    // Normalizar telefone
    const telefoneNormalizado = telefone.replace(/\D/g, '');
    const ultimos8Digitos = telefoneNormalizado.slice(-8);
    const ultimos9Digitos = telefoneNormalizado.slice(-9);
    const ultimos11Digitos = telefoneNormalizado.slice(-11);

    // Buscar todos os pacientes
    const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 1000);
    
    // Encontrar TODOS os pacientes que correspondem ao telefone
    const pacientesEncontrados = [];
    for (const p of todosPacientes) {
        if (!p.telefone) continue;
        const telPaciente = p.telefone.replace(/\D/g, '');
        if (telPaciente.length < 8) continue;
        
        if (telPaciente.endsWith(ultimos8Digitos) || 
            telPaciente.endsWith(ultimos9Digitos) ||
            telefoneNormalizado.endsWith(telPaciente.slice(-8)) ||
            telefoneNormalizado.endsWith(telPaciente.slice(-9)) ||
            telPaciente === ultimos11Digitos) {
            pacientesEncontrados.push(p);
        }
    }
    
    // Pegar IDs de todos os pacientes encontrados
    const pacienteIds = pacientesEncontrados.map(p => p.id);

    if (!pacienteEncontrado) {
        return new Response(JSON.stringify({ 
            message: "Paciente não encontrado",
            telefone: telefoneNormalizado,
            totalPacientes: todosPacientes.length
        }), { status: 200 });
    }

    // Buscar agendamentos futuros deste paciente com status "Agendado"
    const hoje = new Date().toISOString().split('T')[0];
    const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.list('-data_agendamento', 500);
    
    const agendamentos = todosAgendamentos.filter(a => 
        a.paciente_id === pacienteEncontrado.id && 
        a.status === 'Agendado' && 
        a.data_agendamento >= hoje
    );

    if (agendamentos.length === 0) {
        return new Response(JSON.stringify({ 
            message: "Nenhum agendamento pendente",
            paciente: pacienteEncontrado.nome,
            pacienteId: pacienteEncontrado.id,
            totalAgendamentosEncontrados: todosAgendamentos.length
        }), { status: 200 });
    }

    // Confirmar o agendamento mais próximo
    const agendamentoMaisProximo = agendamentos.sort((a, b) => 
        new Date(a.data_agendamento) - new Date(b.data_agendamento)
    )[0];

    await base44.asServiceRole.entities.Agendamento.update(agendamentoMaisProximo.id, {
        status: 'Confirmado'
    });

    // Criar notificação para a equipe
    try {
        await base44.asServiceRole.entities.Notification.create({
            type: 'confirmacao_recebida',
            message: `✅ ${pacienteEncontrado.nome} confirmou presença para ${agendamentoMaisProximo.data_agendamento} às ${agendamentoMaisProximo.horario} via WhatsApp`,
            data: { 
                agendamentoId: agendamentoMaisProximo.id,
                pacienteNome: pacienteEncontrado.nome,
                telefone: telefone
            }
        });
    } catch (e) {
        // Ignora erro de notificação
    }

    // Enviar mensagem de confirmação de volta
    try {
        await enviarMensagemZapi(telefone, 
            `✅ Perfeito, ${pacienteEncontrado.nome.split(' ')[0]}! Sua presença está confirmada para o dia ${formatarData(agendamentoMaisProximo.data_agendamento)} às ${agendamentoMaisProximo.horario}.\n\nLembre-se de chegar com 10 minutos de antecedência. Até lá! 😊\n\n*Centro Vida Saúde*`
        );
    } catch (e) {
        // Ignora erro de envio
    }

    return new Response(JSON.stringify({ 
        message: "Confirmação processada",
        agendamentoId: agendamentoMaisProximo.id,
        paciente: pacienteEncontrado.nome
    }), { status: 200 });
}

// Processa atualizações de status de mensagens enviadas
async function processarStatusMensagem(base44, messageId, status) {
    let nossoStatus;
    switch (status) {
        case 'SENT': nossoStatus = 'enviado'; break;
        case 'DELIVERED': nossoStatus = 'entregue'; break;
        case 'READ': nossoStatus = 'lido'; break;
        case 'FAIL':
        case 'NOT_SENT': nossoStatus = 'falhou'; break;
        default: return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }
    
    const notificationLogs = await base44.asServiceRole.entities.NotificationLog.filter({
        api_message_id: messageId
    });
    
    if (notificationLogs && notificationLogs.length > 0) {
        await base44.asServiceRole.entities.NotificationLog.update(notificationLogs[0].id, {
            status_entrega: nossoStatus
        });
    }

    return new Response(JSON.stringify({ message: "Status atualizado" }), { status: 200 });
}

function formatarData(dataStr) {
    try {
        const d = new Date(dataStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
        return dataStr;
    }
}

async function enviarMensagemZapi(telefone, mensagem) {
    const instanceId = Deno.env.get('ZAPI_INSTANCE_ID');
    const token = Deno.env.get('ZAPI_TOKEN');
    const clientToken = Deno.env.get('ZAPI_CLIENT_TOKEN');

    const telefoneFormatado = telefone.replace(/\D/g, '');
    
    const response = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Client-Token': clientToken
        },
        body: JSON.stringify({
            phone: telefoneFormatado,
            message: mensagem
        })
    });

    return response.json();
}