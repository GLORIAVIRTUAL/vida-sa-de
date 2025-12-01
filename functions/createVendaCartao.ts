import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Autenticação
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        
        // 2. Validação básica dos dados obrigatórios
        const {
            tipo_plano,
            titular,
            dependentes = [],
            forma_pagamento,
            valor_total,
            observacoes
        } = body;

        if (!tipo_plano || !titular || !titular.nome || !titular.cpf || !forma_pagamento) {
            return Response.json({ 
                error: 'Campos obrigatórios faltando: tipo_plano, titular (nome, cpf), forma_pagamento.' 
            }, { status: 400 });
        }

        // 3. Buscar categoria "Cartão Mais Vida" para associar aos pacientes
        const categorias = await base44.asServiceRole.entities.CategoriaPreco.list();
        const categoriaCartao = categorias.find(c => 
            c.nome.toLowerCase().includes('cartão') && 
            c.nome.toLowerCase().includes('mais') &&
            c.nome.toLowerCase().includes('vida')
        ) || categorias.find(c => c.nome.toLowerCase().includes('cartão'));

        const nomeConvenio = categoriaCartao ? categoriaCartao.nome : 'Cartão Mais Vida';

        // 4. Criar Paciente Titular
        console.log('👤 Criando paciente titular:', titular.nome);
        const pacienteTitular = await base44.asServiceRole.entities.Paciente.create({
            nome: titular.nome,
            cpf: titular.cpf,
            rg: titular.rg || '',
            data_nascimento: titular.data_nascimento || null,
            telefone: titular.telefone || '',
            email: titular.email || '',
            endereco: titular.endereco || {},
            convenio: nomeConvenio,
            observacoes: `Cliente do Cartão Mais Vida - ${tipo_plano}`
        });

        // 5. Criar Pacientes Dependentes
        const dependentesIds = [];
        if (dependentes.length > 0) {
            console.log(`👨‍👩‍👧‍👦 Criando ${dependentes.length} dependentes...`);
            for (const dep of dependentes) {
                const pacienteDep = await base44.asServiceRole.entities.Paciente.create({
                    nome: dep.nome,
                    cpf: dep.cpf || '',
                    rg: dep.rg || '',
                    data_nascimento: dep.data_nascimento || null,
                    telefone: titular.telefone || '', // Usa telefone do titular
                    endereco: titular.endereco || {}, // Usa endereço do titular
                    convenio: nomeConvenio,
                    observacoes: `Dependente de ${titular.nome} - Cartão Mais Vida ${tipo_plano}`
                });
                dependentesIds.push(pacienteDep.id);
            }
        }

        // 6. Calcular dados da venda
        const numeroVenda = `CMV-${Date.now()}`;
        
        // Datas (usa dados fornecidos ou defaults)
        const dataVenda = body.data_venda || new Date().toISOString().split('T')[0];
        
        let validadeCartao = body.validade_cartao;
        if (!validadeCartao) {
            const data = new Date();
            data.setFullYear(data.getFullYear() + 1);
            validadeCartao = data.toISOString().split('T')[0];
        }

        // Valores e Parcelas
        const quantidade_cartoes = body.quantidade_cartoes || (1 + dependentes.length);
        const valor_cartoes = body.valor_cartoes || (quantidade_cartoes * 5);
        const valor_plano = body.valor_plano || ((valor_total || 0) - valor_cartoes);
        const numero_parcelas = body.numero_parcelas || 1;
        const valor_parcela = body.valor_parcela || ((valor_total || 0) / numero_parcelas);

        // 7. Criar registro da VendaCartao
        console.log('💾 Registrando venda...');
        const novaVenda = await base44.asServiceRole.entities.VendaCartao.create({
            numero_venda: numeroVenda,
            tipo_plano: tipo_plano,
            titular: titular,
            dependentes: dependentes,
            paciente_titular_id: pacienteTitular.id,
            pacientes_dependentes_ids: dependentesIds,
            quantidade_cartoes: quantidade_cartoes,
            valor_cartoes: valor_cartoes,
            valor_plano: valor_plano,
            valor_total: parseFloat(valor_total),
            forma_pagamento: forma_pagamento,
            numero_parcelas: parseInt(numero_parcelas),
            valor_parcela: parseFloat(valor_parcela),
            data_venda: dataVenda,
            validade_cartao: validadeCartao,
            status: 'Ativo',
            observacoes: observacoes || ''
        });

        console.log('✅ Venda criada com sucesso:', novaVenda.id);

        return Response.json({
            success: true,
            message: 'Venda realizada com sucesso',
            venda: novaVenda,
            paciente_titular: pacienteTitular
        });

    } catch (error) {
        console.error('❌ Erro ao criar venda:', error);
        return Response.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
});