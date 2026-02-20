import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun !== false;
        const batchSize = body.batchSize || 15; // Processar N grupos por execução

        // Buscar todos os contatos
        const todosContatos = await base44.asServiceRole.entities.Contato.list('-created_date', 5000);

        // Normalizar telefone: remover não-dígitos, garantir prefixo 55
        function normalizarTelefone(tel) {
            if (!tel) return '';
            let num = tel.replace(/\D/g, '');
            let local = num;
            if (local.startsWith('55') && local.length >= 12) {
                local = local.slice(2);
            }
            if (local.length === 10) {
                const primeiroDigito = local.charAt(2);
                if (['6', '7', '8', '9'].includes(primeiroDigito)) {
                    local = local.slice(0, 2) + '9' + local.slice(2);
                }
            }
            return '55' + local;
        }

        function chaveAgrupamento(tel) {
            const num = (tel || '').replace(/\D/g, '');
            return num.slice(-8);
        }

        // Agrupar contatos
        const grupos = {};
        for (const contato of todosContatos) {
            const chave = chaveAgrupamento(contato.telefone);
            if (!chave || chave.length < 8) continue;
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push(contato);
        }

        // Duplicatas
        const duplicatas = {};
        for (const [chave, lista] of Object.entries(grupos)) {
            if (lista.length > 1) duplicatas[chave] = lista;
        }

        const totalGrupos = Object.keys(duplicatas).length;

        if (dryRun) {
            // Também contar telefones que precisam normalização
            let precisamNormalizar = 0;
            for (const contato of todosContatos) {
                const norm = normalizarTelefone(contato.telefone);
                if (norm !== contato.telefone) precisamNormalizar++;
            }

            return Response.json({
                modo: 'simulação',
                total_contatos: todosContatos.length,
                grupos_duplicados: totalGrupos,
                registros_a_remover: Object.values(duplicatas).reduce((s, a) => s + a.length - 1, 0),
                telefones_a_normalizar: precisamNormalizar,
                batch_size: batchSize,
                execucoes_necessarias: Math.ceil(totalGrupos / batchSize)
            });
        }

        // EXECUTAR em lotes com delays
        const chaves = Object.keys(duplicatas);
        const lote = chaves.slice(0, batchSize);
        let mergeados = 0;
        let removidos = 0;
        let erros = [];

        for (const chave of lote) {
            const lista = duplicatas[chave];
            try {
                lista.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
                const principal = lista[0];
                let historicoUnificado = [...(principal.historico_mensagens || [])];
                let melhorNome = principal.nome || '';
                let pacienteId = principal.paciente_id;
                let ultimaInteracao = principal.ultima_interacao;

                for (let i = 1; i < lista.length; i++) {
                    const dup = lista[i];
                    const histDup = dup.historico_mensagens || [];
                    for (const msg of histDup) {
                        const jaExiste = historicoUnificado.some(m =>
                            m.timestamp === msg.timestamp && m.content === msg.content && m.role === msg.role
                        );
                        if (!jaExiste) historicoUnificado.push(msg);
                    }
                    if ((dup.nome || '').length > melhorNome.length) melhorNome = dup.nome;
                    if (!pacienteId && dup.paciente_id) pacienteId = dup.paciente_id;
                    if (dup.ultima_interacao && (!ultimaInteracao || dup.ultima_interacao > ultimaInteracao)) {
                        ultimaInteracao = dup.ultima_interacao;
                    }

                    await base44.asServiceRole.entities.Contato.delete(dup.id);
                    removidos++;
                    await sleep(200);
                }

                historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
                if (historicoUnificado.length > 200) {
                    historicoUnificado = historicoUnificado.slice(-200);
                }

                await base44.asServiceRole.entities.Contato.update(principal.id, {
                    historico_mensagens: historicoUnificado,
                    telefone: normalizarTelefone(principal.telefone),
                    nome: melhorNome,
                    paciente_id: pacienteId || principal.paciente_id,
                    ultima_interacao: ultimaInteracao,
                    mensagens_pendentes: [],
                    ultimo_timestamp_pendente: null
                });
                mergeados++;
                await sleep(300);
            } catch (err) {
                erros.push({ chave, erro: err.message });
                console.error(`Erro grupo ${chave}:`, err.message);
                await sleep(1000); // Esperar mais em caso de erro
            }
        }

        // Normalizar telefones de contatos sem duplicatas (também em lote)
        let normalizados = 0;
        const solos = Object.entries(grupos).filter(([, l]) => l.length === 1).slice(0, 30);
        for (const [, lista] of solos) {
            const contato = lista[0];
            const telNorm = normalizarTelefone(contato.telefone);
            if (telNorm !== contato.telefone) {
                try {
                    await base44.asServiceRole.entities.Contato.update(contato.id, { telefone: telNorm });
                    normalizados++;
                    await sleep(200);
                } catch (e) {
                    // Ignorar erros de normalização individual
                }
            }
        }

        const restantes = totalGrupos - lote.length;

        return Response.json({
            modo: 'execução',
            grupos_mesclados: mergeados,
            registros_removidos: removidos,
            telefones_normalizados: normalizados,
            restantes_duplicatas: restantes > 0 ? restantes : 0,
            erros: erros.length > 0 ? erros : null,
            mensagem: restantes > 0
                ? `${mergeados} grupos mesclados, ${removidos} removidos. Ainda restam ${restantes} grupos - execute novamente.`
                : `Concluído! ${mergeados} grupos mesclados, ${removidos} removidos, ${normalizados} normalizados.`
        });

    } catch (error) {
        console.error('Erro geral:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});