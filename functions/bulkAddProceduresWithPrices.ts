import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Helper to normalize names for comparison - versão melhorada
const normalizeName = (name) => {
  return name.trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')              // Múltiplos espaços vira um só
    .replace(/[àáâãäå]/g, 'A')         // Acentos
    .replace(/[èéêë]/g, 'E')
    .replace(/[ìíîï]/g, 'I')
    .replace(/[òóôõö]/g, 'O')
    .replace(/[ùúûü]/g, 'U')
    .replace(/[ç]/g, 'C')
    .replace(/[^A-Z0-9\s\/\-\(\)]/g, '') // Remove caracteres especiais, mantém parênteses e barras
    .trim();
};

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acesso não autorizado.' }), { status: 401 });
    }

    const { items, categoryName } = await req.json();
    console.log(`🚀 Iniciando importação de ${items?.length || 0} itens para categoria: ${categoryName}`);
    
    if (!items || !categoryName) {
      return new Response(JSON.stringify({ error: 'Dados de importação inválidos.' }), { status: 400 });
    }

    // 1. Find or Create the Category
    let categories = await base44.asServiceRole.entities.CategoriaPreco.filter({ nome: categoryName });
    let categoryId;
    
    if (categories.length === 0) {
      console.log(`⚠️  Categoria "${categoryName}" não encontrada. Criando...`);
      const newCategory = await base44.asServiceRole.entities.CategoriaPreco.create({
        nome: categoryName,
        descricao: `Categoria ${categoryName}`,
        status: 'Ativo'
      });
      categoryId = newCategory.id;
      console.log(`✅ Categoria "${categoryName}" criada com ID: ${categoryId}`);
    } else {
      categoryId = categories[0].id;
      console.log(`✅ Categoria "${categoryName}" encontrada com ID: ${categoryId}`);
    }
    
    let createdProcedures = 0;
    let createdPrices = 0;
    let skippedProcedures = 0;
    let skippedPrices = 0;
    const errors = [];
    const successLog = [];

    // Fetch all existing procedures and prices for this category once to optimize
    const allProcedures = await base44.asServiceRole.entities.Procedimento.list();
    const existingPrices = await base44.asServiceRole.entities.TabelaPreco.filter({ categoria_id: categoryId });

    console.log(`📋 Encontrados ${allProcedures.length} procedimentos existentes e ${existingPrices.length} preços para esta categoria`);

    // MELHORADO: Criar um mapa mais robusto para detectar procedimentos existentes
    const procedureMap = new Map();
    const procedureDebugMap = new Map(); // Para debug
    
    allProcedures.forEach(p => {
      const normalizedName = normalizeName(p.nome);
      procedureMap.set(normalizedName, p.id);
      procedureDebugMap.set(normalizedName, p.nome); // Para mostrar qual nome original corresponde
    });

    console.log(`🗂️  Mapa de procedimentos criado com ${procedureMap.size} entradas`);

    const priceMap = new Set(existingPrices.map(p => p.procedimento_id));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const normalizedProcName = normalizeName(item.name);
      console.log(`\n📝 Processando item ${i + 1}/${items.length}:`);
      console.log(`   📄 Nome original: "${item.name}"`);
      console.log(`   🔤 Nome normalizado: "${normalizedProcName}"`);
      console.log(`   💰 Preço: R$ ${item.price}`);
      
      try {
        let procedureId;

        // 2. CORRIGIDO: Busca mais precisa por procedimentos existentes
        if (procedureMap.has(normalizedProcName)) {
          procedureId = procedureMap.get(normalizedProcName);
          const nomeOriginalExistente = procedureDebugMap.get(normalizedProcName);
          console.log(`   ✅ PROCEDIMENTO ENCONTRADO!`);
          console.log(`   📋 Nome no banco: "${nomeOriginalExistente}"`);
          console.log(`   🆔 ID: ${procedureId}`);
          skippedProcedures++;
        } else {
          console.log(`   ❌ Procedimento NÃO encontrado. Criando novo...`);
          const newProcedure = await base44.asServiceRole.entities.Procedimento.create({
            nome: item.name,
            especialidade: item.specialty || 'Geral',
            status: 'Ativo'
          });
          procedureId = newProcedure.id;
          
          // Adicionar ao mapa para esta execução
          procedureMap.set(normalizedProcName, procedureId);
          procedureDebugMap.set(normalizedProcName, item.name);
          
          console.log(`   ✅ Novo procedimento criado com ID: ${procedureId}`);
          createdProcedures++;
        }

        // 3. Verificar/Criar preço para esta categoria
        if (procedureId) {
          if (!priceMap.has(procedureId)) {
            const newPrice = await base44.asServiceRole.entities.TabelaPreco.create({
              procedimento_id: procedureId,
              categoria_id: categoryId,
              valor: item.price
            });
            priceMap.add(procedureId); // Adicionar ao set para esta execução
            console.log(`   💰 PREÇO CRIADO: R$ ${item.price} (ID: ${newPrice.id}) para categoria "${categoryName}"`);
            createdPrices++;
            successLog.push(`${item.name} - R$ ${item.price.toFixed(2)}`);
          } else {
            console.log(`   ⏭️  Preço já existe para este procedimento na categoria "${categoryName}"`);
            skippedPrices++;
          }
        }
      } catch(e) {
        const errorMsg = `Erro ao processar "${item.name}": ${e.message}`;
        console.error(`   ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const summary = {
      message: "Importação concluída!",
      createdProcedures,
      skippedProcedures,
      createdPrices,
      skippedPrices,
      errors,
      successLog: successLog.slice(0, 10), // Only show first 10 for brevity
      totalProcessed: items.length
    };

    console.log('📊 Resumo da importação:', summary);

    return new Response(JSON.stringify(summary), { 
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      } 
    });

  } catch (error) {
    console.error('💥 Erro geral na importação:', error);
    return new Response(JSON.stringify({ 
      error: 'Erro interno no servidor.', 
      details: error.message 
    }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
});