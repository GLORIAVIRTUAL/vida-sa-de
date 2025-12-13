import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Helper para CORS
function handleCors(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });
  }
  return null;
}

Deno.serve(async (req) => {
  try {
    // Handle CORS preflight
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    // Headers CORS
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    };

    // Criar cliente Base44
    const base44 = createClientFromRequest(req);

    // Buscar todos os procedimentos ativos
    const procedimentos = await base44.asServiceRole.entities.Procedimento.filter(
      { status: "Ativo" },
      "nome"
    );

    // Buscar todas as categorias de preço
    const categorias = await base44.asServiceRole.entities.CategoriaPreco.filter({});
    
    // Buscar tabela de preços
    const tabelaPrecos = await base44.asServiceRole.entities.TabelaPreco.filter({});

    // Formatar resposta com preços por categoria
    const procedimentosFormatados = procedimentos.map(proc => {
      // Buscar preços específicos para este procedimento
      const precosPorCategoria = {};
      
      categorias.forEach(cat => {
        const precoEncontrado = tabelaPrecos.find(
          tp => tp.procedimento_id === proc.id && tp.categoria_id === cat.id
        );
        
        if (precoEncontrado) {
          precosPorCategoria[cat.nome] = precoEncontrado.valor;
        }
      });

      return {
        id: proc.id,
        nome: proc.nome,
        codigo: proc.codigo || null,
        especialidade: proc.especialidade || null,
        duracao_minutos: proc.duracao_minutos || null,
        descricao: proc.descricao || null,
        valor_repasse_medico: proc.valor_repasse_medico || null,
        precos: precosPorCategoria,
        status: proc.status
      };
    });

    return Response.json(
      {
        success: true,
        total: procedimentosFormatados.length,
        procedimentos: procedimentosFormatados
      },
      { status: 200, headers }
    );

  } catch (error) {
    console.error("Erro ao buscar procedimentos:", error);
    return Response.json(
      { 
        success: false,
        error: "Erro ao buscar procedimentos",
        details: error.message 
      },
      { 
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
});