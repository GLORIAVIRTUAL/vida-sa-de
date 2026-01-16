import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ message: "Método não permitido. Use POST." }), { status: 405 });
    }

    try {
        const payload = await req.json();
        console.log('🔔 Webhook Z-API recebido:', JSON.stringify(payload));

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

        console.log('⚠️ Payload não reconhecido, ignorando.');
        return new Response(JSON.stringify({ message: "OK" }), { status: 200 });

    } catch (error) {
        console.error('❌ Erro ao processar webhook Z-API:', error);
        return new Response(JSON.stringify({ error: 'Erro interno' }), { status: 500 });
    }
});

// Processa mensagens recebidas dos pacientes (confirmações)
async function processarMensagemRecebida(base44, payload) {
    const telefone = payload.phone; // Número do remetente
    const mensagem = payload.text?.message?.toLowerCase().trim() || '';
    
    console.log(`📩 Mensagem recebida de ${telefone}: "${mensagem}"`);

    // Palavras-chave para confirmação
    const palavrasConfirmacao = ['sim', 'confirmo', 'confirmar', 'confirmado', 'ok', 'vou', 'estarei', 'irei', 's', '1', 'yes'];
    const ehConfirmacao = palavrasConfirmacao.some(p => mensagem === p || mensagem.startsWith(p + ' '));

    if (!ehConfirmacao) {
        console.log('📝 Mensagem não é uma confirmação, ignorando.');
        return new Response(JSON.stringify({ message: "Mensagem não é confirmação" }), { status: 200 });
    }

    // Buscar agendamentos pendentes deste telefone
    const telefoneNormalizado = normalizarTelefone(telefone);
    const ultimos9Digitos = telefoneNormalizado.slice(-9); // Últimos 9 dígitos (DDD + número)
    const ultimos8Digitos = telefoneNormalizado.slice(-8); // Últimos 8 dígitos
    
    console.log(`🔍 Buscando paciente para telefone: ${telefoneNormalizado}`);
    console.log(`   Últimos 9 dígitos: ${ultimos9Digitos}`);
    console.log(`   Últimos 8 dígitos: ${ultimos8Digitos}`);

    // Buscar todos os pacientes e filtrar manualmente (mais confiável)
    const todosPacientes = await base44.asServiceRole.entities.Paciente.list('-created_date', 1000);
    
    console.log(`📋 Total de pacientes encontrados: ${todosPacientes.length}`);
    
    // Filtrar pacientes com correspondência de telefone
    const pacientesEncontrados = todosPacientes.filter(p => {
        if (!p.telefone) return false;
        const telPaciente = normalizarTelefone(p.telefone);
        
        // Verificar se o telefone tem pelo menos 8 dígitos (número válido)
        if (telPaciente.length < 8) return false;
        
        // Comparar últimos 8 ou 9 dígitos para maior precisão
        const match = telPaciente.endsWith(ultimos8Digitos) || 
               telPaciente.endsWith(ultimos9Digitos) ||
               telefoneNormalizado.endsWith(telPaciente.slice(-8)) ||
               telefoneNormalizado.endsWith(telPaciente.slice(-9));
        
        if (match) {
            console.log(`   🔗 Match encontrado: ${p.nome} - Tel cadastrado: ${p.telefone} -> Normalizado: ${telPaciente}`);
        }
        
        return match;
    });

    if (!pacientesEncontrados || pacientesEncontrados.length === 0) {
        console.log('❌ Paciente não encontrado para este telefone');
        return new Response(JSON.stringify({ message: "Paciente não encontrado" }), { status: 200 });
    }

    const paciente = pacientesEncontrados[0];
    console.log(`✅ Paciente encontrado: ${paciente.nome} (ID: ${paciente.id}, Tel: ${paciente.telefone})`);

    // Buscar agendamentos futuros deste paciente com status "Agendado"
    const hoje = new Date().toISOString().split('T')[0];
    console.log(`🔍 Buscando agendamentos para paciente_id: ${paciente.id}, data >= ${hoje}`);
    
    // Buscar agendamentos do paciente
    const todosAgendamentos = await base44.asServiceRole.entities.Agendamento.list('-data_agendamento', 200);
    
    const agendamentos = todosAgendamentos.filter(a => 
        a.paciente_id === paciente.id && 
        a.status === 'Agendado' && 
        a.data_agendamento >= hoje
    );
    
    console.log(`📋 Encontrados ${agendamentos.length} agendamentos pendentes`);

    if (!agendamentos || agendamentos.length === 0) {
        console.log('❌ Nenhum agendamento pendente encontrado para confirmação');
        return new Response(JSON.stringify({ message: "Nenhum agendamento pendente" }), { status: 200 });
    }

    // Confirmar o agendamento mais próximo
    const agendamentoMaisProximo = agendamentos.sort((a, b) => 
        new Date(a.data_agendamento) - new Date(b.data_agendamento)
    )[0];

    console.log(`📅 Confirmando agendamento: ${agendamentoMaisProximo.id} - ${agendamentoMaisProximo.data_agendamento}`);

    await base44.asServiceRole.entities.Agendamento.update(agendamentoMaisProximo.id, {
        status: 'Confirmado'
    });

    // Criar notificação para a equipe
    try {
        await base44.asServiceRole.entities.Notification.create({
            type: 'confirmacao_recebida',
            message: `✅ ${paciente.nome} confirmou presença para ${agendamentoMaisProximo.data_agendamento} às ${agendamentoMaisProximo.horario} via WhatsApp`,
            data: { 
                agendamentoId: agendamentoMaisProximo.id,
                pacienteNome: paciente.nome,
                telefone: telefone
            }
        });
    } catch (e) {
        console.log('Erro ao criar notificação:', e.message);
    }

    // Enviar mensagem de confirmação de volta
    try {
        await enviarMensagemZapi(telefone, 
            `✅ Perfeito, ${paciente.nome.split(' ')[0]}! Sua presença está confirmada para o dia ${formatarData(agendamentoMaisProximo.data_agendamento)} às ${agendamentoMaisProximo.horario}.\n\nLembre-se de chegar com 10 minutos de antecedência. Até lá! 😊\n\n*Centro Vida Saúde*`
        );
    } catch (e) {
        console.log('Erro ao enviar confirmação:', e.message);
    }

    console.log(`🎉 Agendamento ${agendamentoMaisProximo.id} confirmado com sucesso!`);
    return new Response(JSON.stringify({ 
        message: "Confirmação processada",
        agendamentoId: agendamentoMaisProximo.id 
    }), { status: 200 });
}

// Processa atualizações de status de mensagens enviadas
async function processarStatusMensagem(base44, messageId, status) {
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
            console.log(`Status "${status}" não mapeado.`);
            return new Response(JSON.stringify({ message: "OK" }), { status: 200 });
    }
    
    const notificationLogs = await base44.asServiceRole.entities.NotificationLog.filter({
        api_message_id: messageId
    });
    
    if (notificationLogs && notificationLogs.length > 0) {
        const log = notificationLogs[0];
        console.log(`🔄 Atualizando log ${log.id} para: ${nossoStatus}`);
        await base44.asServiceRole.entities.NotificationLog.update(log.id, {
            status_entrega: nossoStatus
        });
    }

    return new Response(JSON.stringify({ message: "Status atualizado" }), { status: 200 });
}

// Funções auxiliares
function normalizarTelefone(telefone) {
    return telefone.replace(/\D/g, '');
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