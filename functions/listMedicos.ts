import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

// Helper to handle CORS preflight requests
const handleOptions = (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
};

Deno.serve(async (req) => {
    console.log(`>>> [listMedicos] Função PÚBLICA foi chamada! Método: ${req.method}`);

    const optionsResponse = handleOptions(req);
    if (optionsResponse) return optionsResponse;

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    try {
        const base44 = createClientFromRequest(req);

        // REMOVIDA A AUTENTICAÇÃO - Esta função agora é pública.
        console.log('>>> [listMedicos] Acessando como função pública, buscando médicos...');

        const medicos = await base44.asServiceRole.entities.Medico.filter({ status: 'Ativo' });

        console.log(`>>> [listMedicos] Encontrados ${medicos.length} médicos ativos`);

        const medicosFormatados = medicos.map((medico) => ({
            id: medico.id,
            nome: medico.nome,
            especialidade: medico.especialidade,
            foto_url: medico.foto_url || null,
            valor_consulta: medico.valor_consulta || 0
        }));

        console.log('>>> [listMedicos] Resposta formatada com sucesso');

        return new Response(JSON.stringify(medicosFormatados), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('>>> [listMedicos] Erro na função:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});