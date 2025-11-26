import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Verificar se é admin
    if (user.role !== 'admin' && user.app_role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem importar' }, { status: 403 });
    }

    const { vendas } = await req.json();

    if (!vendas || !Array.isArray(vendas) || vendas.length === 0) {
      return Response.json({ error: 'Nenhuma venda para importar' }, { status: 400 });
    }

    console.log(`📊 Iniciando importação de ${vendas.length} vendas...`);

    // Buscar categoria "Cartão Mais Vida"
    const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({});
    const categoriaCartao = categorias.find(c => 
      c.nome.toLowerCase().includes('cartão') && 
      c.nome.toLowerCase().includes('mais') &&
      c.nome.toLowerCase().includes('vida')
    ) || categorias.find(c => c.nome.toLowerCase().includes('cartão'));

    if (!categoriaCartao) {
      return Response.json({ 
        error: 'Categoria "Cartão Mais Vida" não encontrada. Crie-a primeiro na página de Procedimentos.' 
      }, { status: 400 });
    }

    const resultado = {
      total: vendas.length,
      sucesso: 0,
      erros: [],
      detalhes: []
    };

    // Processar vendas em lotes menores para evitar rate limit
    const BATCH_SIZE = 3;
    
    for (let i = 0; i < vendas.length; i += BATCH_SIZE) {
      const lote = vendas.slice(i, i + BATCH_SIZE);
      console.log(`📦 Processando lote ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(vendas.length/BATCH_SIZE)}`);

      // Processar cada venda do lote SEQUENCIALMENTE para evitar rate limit
      for (let loteIndex = 0; loteIndex < lote.length; loteIndex++) {
        const venda = lote[loteIndex];
        const index = i + loteIndex;
        
        try {
          // 1. Criar paciente titular
          const pacienteTitular = await base44.asServiceRole.entities.Paciente.create({
            nome: venda.titular.nome,
            cpf: venda.titular.cpf || '',
            rg: venda.titular.rg || '',
            data_nascimento: venda.titular.data_nascimento || null,
            telefone: venda.titular.telefone || '',
            email: venda.titular.email || '',
            endereco: venda.titular.endereco || {},
            convenio: categoriaCartao.nome,
            observacoes: `Importado - Cliente do Cartão Mais Vida - ${venda.tipo_plano}`
          });

          // 2. Criar pacientes dependentes
          const dependentesIds = [];
          if (venda.dependentes && venda.dependentes.length > 0) {
            for (const dep of venda.dependentes) {
              const pacienteDep = await base44.asServiceRole.entities.Paciente.create({
                nome: dep.nome,
                cpf: dep.cpf || '',
                rg: dep.rg || '',
                data_nascimento: dep.data_nascimento || null,
                telefone: venda.titular.telefone || '',
                endereco: venda.titular.endereco || {},
                convenio: categoriaCartao.nome,
                observacoes: `Importado - Dependente de ${venda.titular.nome}`
              });
              dependentesIds.push(pacienteDep.id);
            }
          }

          // 3. Criar venda do cartão
          const numeroVenda = `CMV-IMP-${Date.now()}-${index}`;
          const dataAtual = new Date().toISOString().split('T')[0];
          const dataValidade = new Date();
          dataValidade.setFullYear(dataValidade.getFullYear() + 1);
          
          await base44.asServiceRole.entities.VendaCartao.create({
            numero_venda: numeroVenda,
            tipo_plano: venda.tipo_plano,
            titular: venda.titular,
            dependentes: venda.dependentes || [],
            paciente_titular_id: pacienteTitular.id,
            pacientes_dependentes_ids: dependentesIds,
            quantidade_cartoes: venda.quantidade_cartoes || 1,
            valor_cartoes: venda.valor_cartoes || 5,
            valor_plano: (venda.valor_total || 0) - (venda.valor_cartoes || 5),
            valor_total: venda.valor_total || 0,
            forma_pagamento: venda.forma_pagamento || 'Dinheiro',
            numero_parcelas: venda.numero_parcelas || 1,
            valor_parcela: venda.valor_total || 0,
            data_venda: venda.data_venda || dataAtual,
            validade_cartao: venda.validade_cartao || dataValidade.toISOString().split('T')[0],
            status: venda.status || 'Ativo',
            observacoes: `Importado em ${new Date().toLocaleString('pt-BR')} | Plano original: ${venda.plano_original || 'N/A'}`
          });

          return {
            index,
            nome: venda.titular.nome,
            status: 'sucesso',
            dependentes: (venda.dependentes || []).length
          };

          // Pequena pausa entre cada venda para evitar rate limit
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          console.error(`❌ Erro na venda ${index}: ${venda.titular.nome}:`, error.message);
          resultado.detalhes.push({
            index,
            nome: venda.titular.nome,
            status: 'erro',
            erro: error.message
          });
          resultado.erros.push({ nome: venda.titular.nome, erro: error.message });
        }
      }

      // Pausa maior entre lotes
      if (i + BATCH_SIZE < vendas.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`✅ Importação concluída: ${resultado.sucesso}/${resultado.total} sucesso`);

    return Response.json(resultado);

  } catch (error) {
    console.error('❌ Erro geral na importação:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});