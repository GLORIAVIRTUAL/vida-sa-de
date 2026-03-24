import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { dry_run = true } = await req.json();

    // Preços padrão dos planos do Cartão Mais Vida
    // Baseado nos registros manuais corretos já existentes no sistema
    const PRECO_CARTAO_FISICO = 5.00;
    
    const PRECOS_PLANO = {
      'Individual à Vista': 298.80,
      'Individual Parcelado': 298.80,
      'Familiar à Vista': 438.90,     // Base para 2 pessoas, adicionar R$10/pessoa extra
      'Familiar Parcelado': 478.80,
      'Grupo à Vista': 438.90,
      'Grupo Parcelado': 478.80,
    };

    // Para familiar, o preço varia conforme quantidade de dependentes
    // Referências do sistema:
    // Familiar 2 pessoas (titular + 1 dep): R$ 438.90
    // Familiar 5 pessoas (titular + 4 dep): R$ 498.80
    // Diferença por pessoa extra: (498.80 - 438.90) / 3 ≈ R$ 19.97 ≈ R$ 20.00
    const PRECO_PESSOA_EXTRA_FAMILIAR = 20.00;
    const BASE_FAMILIAR_PESSOAS = 2; // O preço base de 438.90 inclui 2 pessoas

    // Buscar todas as vendas importadas com valores suspeitos
    const todasVendas = await base44.asServiceRole.entities.VendaCartao.filter({});
    
    const vendasParaCorrigir = todasVendas.filter(v => {
      // Vendas importadas (CMV-IMP) com valores absurdamente altos
      const isImportada = (v.numero_venda || '').includes('CMV-IMP');
      const valorAlto = (v.valor_total || 0) > 5000 || (v.valor_plano || 0) > 5000;
      // Também corrigir vendas da 1ª importação com valores intermediários estranhos
      const valorEstranho = isImportada && (v.valor_total || 0) > 1000;
      return isImportada && (valorAlto || valorEstranho);
    });

    console.log(`📊 Total de vendas no sistema: ${todasVendas.length}`);
    console.log(`🔧 Vendas para corrigir: ${vendasParaCorrigir.length}`);

    const resultados = [];

    for (const venda of vendasParaCorrigir) {
      const tipoPlano = venda.tipo_plano || 'Individual à Vista';
      const numDependentes = (venda.dependentes || []).length;
      const numCartoes = venda.quantidade_cartoes || 1;
      const totalPessoas = 1 + numDependentes; // titular + dependentes

      // Calcular valor do plano baseado no tipo
      let valorPlanoCorreto;
      
      if (tipoPlano.includes('Individual')) {
        valorPlanoCorreto = PRECOS_PLANO[tipoPlano] || 298.80;
      } else if (tipoPlano.includes('Familiar') || tipoPlano.includes('Grupo')) {
        const precoBase = tipoPlano.includes('Parcelado') ? 478.80 : 438.90;
        const pessoasExtras = Math.max(0, totalPessoas - BASE_FAMILIAR_PESSOAS);
        valorPlanoCorreto = precoBase + (pessoasExtras * PRECO_PESSOA_EXTRA_FAMILIAR);
      } else {
        valorPlanoCorreto = 298.80; // fallback
      }

      const valorCartoesCorreto = numCartoes * PRECO_CARTAO_FISICO;
      const valorTotalCorreto = valorPlanoCorreto + valorCartoesCorreto;
      const valorParcelaCorreto = (venda.numero_parcelas || 1) > 1 
        ? parseFloat((valorTotalCorreto / (venda.numero_parcelas || 1)).toFixed(2))
        : valorTotalCorreto;

      const registro = {
        id: venda.id,
        numero_venda: venda.numero_venda,
        titular: venda.titular?.nome,
        tipo_plano: tipoPlano,
        dependentes: numDependentes,
        cartoes: numCartoes,
        antes: {
          valor_total: venda.valor_total,
          valor_plano: venda.valor_plano,
          valor_parcela: venda.valor_parcela,
          valor_cartoes: venda.valor_cartoes,
        },
        depois: {
          valor_total: valorTotalCorreto,
          valor_plano: valorPlanoCorreto,
          valor_parcela: valorParcelaCorreto,
          valor_cartoes: valorCartoesCorreto,
        }
      };

      resultados.push(registro);

      if (!dry_run) {
        await base44.asServiceRole.entities.VendaCartao.update(venda.id, {
          valor_total: valorTotalCorreto,
          valor_plano: valorPlanoCorreto,
          valor_parcela: valorParcelaCorreto,
          valor_cartoes: valorCartoesCorreto,
        });
        console.log(`✅ Corrigido: ${venda.numero_venda} | ${venda.titular?.nome} | R$ ${venda.valor_total} → R$ ${valorTotalCorreto}`);
      }
    }

    return Response.json({
      success: true,
      dry_run,
      total_vendas: todasVendas.length,
      vendas_corrigidas: resultados.length,
      detalhes: resultados,
      mensagem: dry_run 
        ? 'Simulação concluída. Execute com dry_run=false para aplicar as correções.' 
        : `${resultados.length} vendas corrigidas com sucesso!`
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});