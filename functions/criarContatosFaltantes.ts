import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // 1. Buscar todos os logs de notificação
        let todosLogs = [];
        let skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.NotificationLog.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosLogs = [...todosLogs, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }
        console.log(`📊 Total de logs de notificação: ${todosLogs.length}`);

        // 2. Buscar todos os contatos existentes
        let todosContatos = [];
        skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.Contato.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosContatos = [...todosContatos, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }
        console.log(`📊 Total de contatos existentes: ${todosContatos.length}`);

        // 3. Criar set de telefones normalizados dos contatos existentes
        const telefonesExistentes = new Set();
        todosContatos.forEach(c => {
            const tel = (c.telefone || '').replace(/\D/g, '');
            if (tel) {
                telefonesExistentes.add(tel);
                // Adicionar variações
                if (tel.startsWith('55')) telefonesExistentes.add(tel.slice(2));
                else telefonesExistentes.add('55' + tel);
            }
        });

        // 4. Agrupar logs por telefone (pegar o mais recente de cada)
        const logsPorTelefone = {};
        todosLogs.forEach(log => {
            const tel = (log.telefone_destino || '').replace(/\D/g, '');
            if (!tel) return;
            
            // Verificar se já existe contato
            const telSem55 = tel.startsWith('55') ? tel.slice(2) : tel;
            const telCom55 = tel.startsWith('55') ? tel : '55' + tel;
            
            if (telefonesExistentes.has(tel) || telefonesExistentes.has(telSem55) || telefonesExistentes.has(telCom55)) {
                return; // Já tem contato
            }
            
            // Guardar o log mais recente para esse telefone
            if (!logsPorTelefone[tel] || new Date(log.timestamp_envio || log.created_date) > new Date(logsPorTelefone[tel].timestamp_envio || logsPorTelefone[tel].created_date)) {
                logsPorTelefone[tel] = log;
            }
        });

        const telefonesParaCriar = Object.keys(logsPorTelefone);
        console.log(`📝 Contatos a criar: ${telefonesParaCriar.length}`);

        // 5. Criar contatos faltantes
        let criados = 0;
        const resultados = [];

        for (const tel of telefonesParaCriar) {
            const log = logsPorTelefone[tel];
            const timestamp = log.timestamp_envio || log.created_date || new Date().toISOString();
            
            // Juntar todas as mensagens desse telefone para o histórico
            const logsDesteTelefone = todosLogs
                .filter(l => (l.telefone_destino || '').replace(/\D/g, '') === tel)
                .sort((a, b) => new Date(a.timestamp_envio || a.created_date) - new Date(b.timestamp_envio || b.created_date));
            
            const historico = logsDesteTelefone.map(l => ({
                role: 'assistant',
                content: `📢 [Notificação]\n${l.mensagem_enviada || ''}`,
                timestamp: l.timestamp_envio || l.created_date || new Date().toISOString(),
                humano: !((l.mensagem_enviada || '').toLowerCase().includes('[lembrete 24h]'))
            }));

            try {
                await base44.asServiceRole.entities.Contato.create({
                    nome: log.paciente_nome?.trim() || 'Cliente',
                    telefone: tel,
                    origem: 'Manual',
                    status: 'Cliente',
                    historico_mensagens: historico,
                    ultima_resposta: log.mensagem_enviada || '',
                    ultima_interacao: timestamp,
                    total_mensagens: historico.length
                });
                criados++;
                resultados.push({ nome: log.paciente_nome, telefone: tel, status: 'criado' });
                console.log(`✅ Contato criado: ${log.paciente_nome} (${tel})`);
            } catch (err) {
                resultados.push({ nome: log.paciente_nome, telefone: tel, status: 'erro', erro: err.message });
                console.error(`❌ Erro ao criar contato ${log.paciente_nome}: ${err.message}`);
            }
        }

        return Response.json({
            success: true,
            totalLogs: todosLogs.length,
            totalContatosExistentes: todosContatos.length,
            contatosCriados: criados,
            resultados
        });

    } catch (error) {
        console.error('❌ Erro geral:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});