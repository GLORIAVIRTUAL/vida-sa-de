import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || (user.role !== 'admin' && user._app_role !== 'admin')) {
            return Response.json({ error: 'Acesso não autorizado' }, { status: 401 });
        }

        console.log('🔄 Iniciando sincronização MELHORADA de preços dos médicos...');

        // Buscar todos os dados necessários
        const [medicos, procedimentos, tabelaPrecos, categorias] = await Promise.all([
            base44.asServiceRole.entities.Medico.list(),
            base44.asServiceRole.entities.Procedimento.list(),
            base44.asServiceRole.entities.TabelaPreco.list(),
            base44.asServiceRole.entities.CategoriaPreco.list()
        ]);

        console.log(`📊 Encontrados: ${medicos.length} médicos, ${procedimentos.length} procedimentos, ${tabelaPrecos.length} preços, ${categorias.length} categorias`);

        let medicosAtualizados = 0;
        let medicosComProblema = [];
        let procedimentosCriados = 0;

        // Buscar categoria PARTICULAR para valor padrão
        const categoriaParticular = categorias.find(c => 
            c.nome.toUpperCase().includes('PARTICULAR')
        );

        for (const medico of medicos) {
            try {
                console.log(`\n👨‍⚕️ Processando: ${medico.nome} (${medico.especialidade})`);
                
                // Normalizar especialidade para comparação
                const especialidadeNorm = medico.especialidade
                    .toUpperCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "");
                
                console.log(`   🔍 Especialidade normalizada: "${especialidadeNorm}"`);
                
                // BUSCA MELHORADA: Procurar procedimentos de CONSULTA
                let procedimentosConsulta = procedimentos.filter(p => {
                    const nomeNorm = p.nome
                        .toUpperCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "");
                    
                    const temConsulta = nomeNorm.includes('CONSULTA');
                    const temEspecialidade = nomeNorm.includes(especialidadeNorm);
                    const especialidadeMatch = p.especialidade === medico.especialidade;
                    
                    return temConsulta && (temEspecialidade || especialidadeMatch);
                });

                // SE NÃO ENCONTROU, CRIAR PROCEDIMENTO AUTOMATICAMENTE
                if (procedimentosConsulta.length === 0) {
                    console.log(`   ⚠️  Procedimento não encontrado. CRIANDO automaticamente...`);
                    
                    const nomeProcedimento = `Consulta ${medico.especialidade}`;
                    
                    // Criar o procedimento
                    const novoProcedimento = await base44.asServiceRole.entities.Procedimento.create({
                        nome: nomeProcedimento,
                        especialidade: medico.especialidade,
                        duracao_minutos: 30,
                        status: 'Ativo',
                        descricao: `Consulta médica de ${medico.especialidade} - Criado automaticamente`
                    });
                    
                    console.log(`   ✅ Procedimento criado: ${novoProcedimento.nome} (ID: ${novoProcedimento.id})`);
                    procedimentosCriados++;
                    
                    // Criar preços para este procedimento em todas as categorias ativas
                    for (const categoria of categorias.filter(c => c.status === 'Ativo')) {
                        let valorPadrao = 120; // Valor padrão
                        
                        // Se for Particular e o médico já tem valor antigo, usar
                        if (categoria.id === categoriaParticular?.id && medico.valor_consulta) {
                            valorPadrao = medico.valor_consulta;
                        }
                        
                        await base44.asServiceRole.entities.TabelaPreco.create({
                            procedimento_id: novoProcedimento.id,
                            categoria_id: categoria.id,
                            valor: valorPadrao
                        });
                        
                        console.log(`   💰 Preço criado para ${categoria.nome}: R$ ${valorPadrao}`);
                    }
                    
                    // Adicionar à lista de procedimentos
                    procedimentosConsulta = [novoProcedimento];
                    procedimentos.push(novoProcedimento);
                }

                console.log(`   ✅ Usando ${procedimentosConsulta.length} procedimento(s) de consulta`);

                // Pegar o primeiro procedimento de consulta
                const procedimentoConsulta = procedimentosConsulta[0];
                console.log(`   📋 Procedimento: ${procedimentoConsulta.nome}`);

                // Buscar todos os preços deste procedimento na tabela de preços
                const precosConsulta = [];
                
                for (const categoria of categorias.filter(c => c.status === 'Ativo')) {
                    // Buscar preço na tabela (recarregar se necessário)
                    const tabelaPrecosAtualizada = await base44.asServiceRole.entities.TabelaPreco.filter({
                        procedimento_id: procedimentoConsulta.id,
                        categoria_id: categoria.id
                    });
                    
                    const preco = tabelaPrecosAtualizada[0];
                    
                    if (preco && preco.valor > 0) {
                        precosConsulta.push({
                            categoria_preco_id: categoria.id,
                            valor: preco.valor
                        });
                        console.log(`   💰 ${categoria.nome}: R$ ${preco.valor.toFixed(2)}`);
                    } else {
                        console.log(`   ⚠️  Preço zerado ou não encontrado para: ${categoria.nome}`);
                        precosConsulta.push({
                            categoria_preco_id: categoria.id,
                            valor: 0
                        });
                    }
                }

                if (precosConsulta.length === 0) {
                    throw new Error('Nenhum preço configurado na tabela');
                }

                // Atualizar o médico
                await base44.asServiceRole.entities.Medico.update(medico.id, {
                    precos_consulta: precosConsulta
                });

                console.log(`   ✅ Médico atualizado com ${precosConsulta.length} preço(s)!`);
                medicosAtualizados++;

            } catch (error) {
                console.error(`   ❌ Erro ao processar ${medico.nome}:`, error.message);
                medicosComProblema.push({
                    medico: medico.nome,
                    especialidade: medico.especialidade,
                    erro: error.message
                });
            }
        }

        const resultado = {
            success: true,
            message: 'Sincronização concluída!',
            medicosAtualizados,
            totalMedicos: medicos.length,
            procedimentosCriados,
            medicosComProblema: medicosComProblema.length,
            erros: medicosComProblema.length > 0 ? medicosComProblema : undefined
        };

        console.log('\n📊 RESULTADO FINAL:', resultado);

        return Response.json(resultado);

    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        return Response.json({ 
            success: false,
            error: 'Erro interno no servidor', 
            details: error.message 
        }, { status: 500 });
    }
});