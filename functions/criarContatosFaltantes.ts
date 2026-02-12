import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        let todosLogs = [];
        let skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.NotificationLog.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosLogs = [...todosLogs, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }

        let todosContatos = [];
        skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.Contato.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosContatos = [...todosContatos, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }

        const telefonesExistentes = new Set();
        todosContatos.forEach(c => {
            const tel = (c.telefone || '').replace(/\D/g, '');
            if (tel) {
                telefonesExistentes.add(tel);
                if (tel.startsWith('55')) telefonesExistentes.add(tel.slice(2));
                else telefonesExistentes.add('55' + tel);
            }
        });

        const logsPorTelefone = {};
        const todosLogsPorTel = {};
        
        todosLogs.forEach(log => {
            const tel = (log.telefone_destino || '').replace(/\D/g, '');
            if (!tel) return;
            const telSem55 = tel.startsWith('55') ? tel.slice(2) : tel;
            const telCom55 = tel.startsWith('55') ? tel : '55' + tel;
            if (telefonesExistentes.has(tel) || telefonesExistentes.has(telSem55) || telefonesExistentes.has(telCom55)) return;
            if (!todosLogsPorTel[tel]) todosLogsPorTel[tel] = [];
            todosLogsPorTel[tel].push(log);
            if (!logsPorTelefone[tel]) logsPorTelefone[tel] = log;
        });

        const tels = Object.keys(logsPorTelefone);
        let criados = 0;
        const resultados = [];

        for (const tel of tels) {
            const log = logsPorTelefone[tel];
            const ts = log.timestamp_envio || log.created_date || new Date().toISOString();
            const hist = (todosLogsPorTel[tel] || []).map(l => ({
                role: 'assistant',
                content: l.mensagem_enviada || '',
                timestamp: l.timestamp_envio || l.created_date || new Date().toISOString(),
                humano: !((l.mensagem_enviada || '').includes('[lembrete 24h]'))
            }));
            try {
                await base44.asServiceRole.entities.Contato.create({
                    nome: (log.paciente_nome || 'Cliente').trim(),
                    telefone: tel,
                    origem: 'Manual',
                    status: 'Cliente',
                    historico_mensagens: hist,
                    ultima_resposta: log.mensagem_enviada || '',
                    ultima_interacao: ts,
                    total_mensagens: hist.length
                });
                criados++;
                resultados.push({ nome: log.paciente_nome, tel, ok: true });
            } catch (err) {
                resultados.push({ nome: log.paciente_nome, tel, ok: false, err: err.message });
            }
        }

        return Response.json({ success: true, criados, total: tels.length, resultados });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});