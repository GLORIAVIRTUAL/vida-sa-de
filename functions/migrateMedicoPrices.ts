import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Acesso não autorizado' }, { status: 401 });
        }

        console.log('🚀 Iniciando migração de preços dos médicos...');

        // Buscar todos os médicos e categorias
        const [medicos, categorias] = await Promise.all([
            base44.asServiceRole.entities.Medico.list(),
            base44.asServiceRole.entities.CategoriaPreco.list()
        ]);

        console.log(`📋 Encontrados ${medicos.length} médicos e ${categorias.length} categorias`);

        const particularCategory = categorias.find(c => 
            c.nome.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 'PARTICULAR'
        );

        if (!particularCategory) {
            // Criar categoria PARTICULAR se não existir
            const newParticular = await base44.asServiceRole.entities.CategoriaPreco.create({
                nome: 'PARTICULAR',
                descricao: 'Categoria para pacientes particulares',
                status: 'Ativo'
            });
            console.log('✅ Categoria PARTICULAR criada:', newParticular.id);
            categorias.push(newParticular);
        }

        let medicosAtualizados = 0;
        let medicosJaConfigurrados = 0;

        for (const medico of medicos) {
            console.log(`\n👨‍⚕️ Processando médico: ${medico.nome}`);
            
            // Verificar se já tem precos_consulta configurados
            if (medico.precos_consulta && Array.isArray(medico.precos_consulta) && medico.precos_consulta.length > 0) {
                console.log('✅ Já tem preços configurados');
                medicosJaConfigurrados++;
                continue;
            }

            // Criar preços padrão para todas as categorias
            const precosConsulta = [];
            
            for (const categoria of categorias) {
                let valorPadrao = 0;
                
                // Tentar usar o valor antigo se existir
                if (medico.valor_consulta && categoria.nome.toUpperCase().includes('PARTICULAR')) {
                    valorPadrao = medico.valor_consulta;
                } else {
                    // Valor padrão baseado na especialidade
                    valorPadrao = medico.especialidade === 'Clínico Geral' ? 100 : 120;
                }

                precosConsulta.push({
                    categoria_preco_id: categoria.id,
                    valor: valorPadrao
                });

                console.log(`💰 ${categoria.nome}: R$ ${valorPadrao}`);
            }

            // Atualizar o médico
            await base44.asServiceRole.entities.Medico.update(medico.id, {
                precos_consulta: precosConsulta
            });

            console.log('✅ Médico atualizado com preços de consulta');
            medicosAtualizados++;
        }

        const resultado = {
            message: 'Migração de preços concluída!',
            medicosAtualizados,
            medicosJaConfigurrados,
            totalMedicos: medicos.length,
            totalCategorias: categorias.length,
            categorias: categorias.map(c => ({ id: c.id, nome: c.nome }))
        };

        console.log('📊 Resultado:', resultado);

        return Response.json(resultado);

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        return Response.json({ 
            error: 'Erro interno no servidor', 
            details: error.message 
        }, { status: 500 });
    }
});