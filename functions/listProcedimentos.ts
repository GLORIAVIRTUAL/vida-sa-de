import { createClient } from 'npm:@base44/sdk@0.8.4';

// Helper para CORS
function handleCors(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
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
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type"
    };

    // Validar autenticação via API Key
    const authHeader = req.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Token ")) {
      return Response.json(
        { error: "Autenticação necessária. Use: Authorization: Token <sua-api-key>" },
        { status: 401, headers }
      );
    }

    const apiKey = authHeader.replace("Token ", "");

    // Criar cliente Base44 com service role
    const base44 = createClient(
      Deno.env.get("BASE44_APP_ID"),
      Deno.env.get("BASE44_SERVICE_ROLE_KEY")
    );

    // Validar API Key no banco de dados
    const apiKeys = await base44.entities.ApiKey.filter({ status: "Ativo" });
    const validKey = apiKeys.find(k => k.key === apiKey);

    if (!validKey) {
      return Response.json(
        { error: "API Key inválida" },
        { status: 403, headers }
      );
    }

    // Buscar todos os procedimentos ativos
    const procedimentos = await base44.entities.Procedimento.filter(
      { status: "Ativo" },
      "nome"
    );

    // Buscar todas as categorias de preço
    const categorias = await base44.entities.CategoriaPreco.filter({});
    
    // Buscar tabela de preços
    const tabelaPrecos = await base44.entities.TabelaPreco.filter({});

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