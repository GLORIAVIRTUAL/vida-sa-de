import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const dryRun = body.dryRun !== false; // default: true (apenas simula)

        // Buscar todos os contatos
        const todosContatos = await base44.asServiceRole.entities.Contato.list('-created_date', 5000);
        console.log(`Total de contatos: ${todosContatos.length}`);

        // Normalizar telefone: remover não-dígitos, garantir prefixo 55, e padronizar 13 dígitos para celular BR
        function normalizarTelefone(tel) {
            if (!tel) return '';
            let num = tel.replace(/\D/g, '');
            // Remover prefixo 55 se presente para trabalhar com número local
            let local = num;
            if (local.startsWith('55') && local.length >= 12) {
                local = local.slice(2);
            }
            // Se tem 10 dígitos (DDD + 8 dígitos fixo/celular antigo), adicionar 9 se for celular
            // Celulares BR começam com 9 após DDD, fixos começam com 2-5
            if (local.length === 10) {
                const ddd = local.slice(0, 2);
                const primeiroDigito = local.charAt(2);
                // Se começa com 6,7,8,9 após DDD, provavelmente é celular sem o 9
                if (['6', '7', '8', '9'].includes(primeiroDigito)) {
                    local = ddd + '9' + local.slice(2);
                }
            }
            // Garantir prefixo 55
            return '55' + local;
        }

        // Chave de agrupamento: últimos 8 dígitos (ignora variações de 9 e código de país)
        function chaveAgrupamento(tel) {
            const num = tel.replace(/\D/g, '');
            return num.slice(-8);
        }

        // Agrupar contatos por chave
        const grupos = {};
        for (const contato of todosContatos) {
            const chave = chaveAgrupamento(contato.telefone || '');
            if (!chave || chave.length < 8) continue;
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push(contato);
        }

        // Encontrar duplicatas
        const duplicatas = {};
        for (const [chave, lista] of Object.entries(grupos)) {
            if (lista.length > 1) {
                duplicatas[chave] = lista;
            }
        }

        const totalGruposDuplicados = Object.keys(duplicatas).length;
        const totalRegistrosDuplicados = Object.values(duplicatas).reduce((sum, arr) => sum + arr.length, 0);

        console.log(`Grupos duplicados: ${totalGruposDuplicados}, Registros envolvidos: ${totalRegistrosDuplicados}`);

        if (dryRun) {
            // Apenas retornar relatório
            const relatorio = Object.entries(duplicatas).map(([chave, lista]) => ({
                chave,
                contatos: lista.map(c => ({
                    id: c.id,
                    nome: c.nome,
                    telefone: c.telefone,
                    telefone_normalizado: normalizarTelefone(c.telefone),
                    historico_count: (c.historico_mensagens || []).length,
                    ultima_interacao: c.ultima_interacao,
                    created_date: c.created_date
                }))
            }));

            return Response.json({
                modo: 'simulação',
                total_contatos: todosContatos.length,
                grupos_duplicados: totalGruposDuplicados,
                registros_envolvidos: totalRegistrosDuplicados,
                registros_a_remover: totalRegistrosDuplicados - totalGruposDuplicados,
                primeiros_10: relatorio.slice(0, 10)
            });
        }

        // EXECUTAR MERGE
        let mergeados = 0;
        let removidos = 0;
        let erros = [];

        for (const [chave, lista] of Object.entries(duplicatas)) {
            try {
                // Ordenar: manter o mais antigo como principal
                lista.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
                const principal = lista[0];

                // Mesclar históricos de TODOS os contatos
                let historicoUnificado = [...(principal.historico_mensagens || [])];

                // Dados para mesclar: manter o nome mais completo, paciente_id se existir, etc.
                let melhorNome = principal.nome || '';
                let pacienteId = principal.paciente_id;
                let ultimaInteracao = principal.ultima_interacao;

                for (let i = 1; i < lista.length; i++) {
                    const dup = lista[i];

                    // Mesclar histórico (evitar duplicatas por timestamp+content)
                    const histDup = dup.historico_mensagens || [];
                    for (const msg of histDup) {
                        const jaExiste = historicoUnificado.some(m =>
                            m.timestamp === msg.timestamp && m.content === msg.content && m.role === msg.role
                        );
                        if (!jaExiste) {
                            historicoUnificado.push(msg);
                        }
                    }

                    // Manter nome mais longo (provavelmente mais completo)
                    if ((dup.nome || '').length > melhorNome.length) {
                        melhorNome = dup.nome;
                    }

                    // Manter paciente_id se o principal não tem
                    if (!pacienteId && dup.paciente_id) {
                        pacienteId = dup.paciente_id;
                    }

                    // Manter última interação mais recente
                    if (dup.ultima_interacao && (!ultimaInteracao || dup.ultima_interacao > ultimaInteracao)) {
                        ultimaInteracao = dup.ultima_interacao;
                    }

                    // Deletar duplicado
                    await base44.asServiceRole.entities.Contato.delete(dup.id);
                    removidos++;
                }

                // Ordenar histórico por timestamp
                historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

                // Limitar a 200 mensagens mais recentes
                if (historicoUnificado.length > 200) {
                    historicoUnificado = historicoUnificado.slice(-200);
                }

                // Atualizar principal com dados mesclados e telefone normalizado
                const telefoneNormalizado = normalizarTelefone(principal.telefone);
                await base44.asServiceRole.entities.Contato.update(principal.id, {
                    historico_mensagens: historicoUnificado,
                    telefone: telefoneNormalizado,
                    nome: melhorNome,
                    paciente_id: pacienteId || principal.paciente_id,
                    ultima_interacao: ultimaInteracao,
                    mensagens_pendentes: [],
                    ultimo_timestamp_pendente: null
                });

                mergeados++;
            } catch (err) {
                erros.push({ chave, erro: err.message });
                console.error(`Erro ao mesclar grupo ${chave}:`, err.message);
            }
        }

        // TAMBÉM normalizar telefones de contatos NÃO duplicados
        let normalizados = 0;
        for (const [chave, lista] of Object.entries(grupos)) {
            if (lista.length === 1) {
                const contato = lista[0];
                const telNorm = normalizarTelefone(contato.telefone);
                if (telNorm !== contato.telefone) {
                    await base44.asServiceRole.entities.Contato.update(contato.id, {
                        telefone: telNorm
                    });
                    normalizados++;
                }
            }
        }

        return Response.json({
            modo: 'execução',
            total_contatos: todosContatos.length,
            grupos_mesclados: mergeados,
            registros_removidos: removidos,
            telefones_normalizados: normalizados,
            erros: erros.length > 0 ? erros : null,
            mensagem: `${mergeados} grupos mesclados, ${removidos} duplicatas removidas, ${normalizados} telefones normalizados.`
        });

    } catch (error) {
        console.error('Erro geral:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});