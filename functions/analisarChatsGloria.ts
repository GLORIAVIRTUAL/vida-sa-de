import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        let todosContatos = [];
        let skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.Contato.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosContatos = [...todosContatos, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }

        let todasPerguntas = [];
        for (const contato of todosContatos) {
            const hist = contato.historico_mensagens;
            if (!hist || !Array.isArray(hist) || hist.length === 0) continue;
            const msgs = hist
                .filter(m => m.role === 'user' && m.content && m.content.trim().length > 2)
                .map(m => m.content.trim());
            todasPerguntas = [...todasPerguntas, ...msgs];
        }

        let amostra = todasPerguntas;
        if (amostra.length > 500) {
            const step = Math.floor(amostra.length / 500);
            amostra = amostra.filter((_, i) => i % step === 0).slice(0, 500);
        }

        const texto = amostra.map((msg, i) => `${i + 1}. ${msg}`).join('\n');

        const parte1 = await base44.integrations.Core.InvokeLLM({
            prompt: `Analise ${amostra.length} mensagens de clientes via WhatsApp do chatbot "Glória" da clínica Centro Vida Saúde (Tramandaí/RS).

Responda:
1. DÚVIDAS DIFÍCEIS - 15+ perguntas que o chatbot provavelmente não soube responder, com exemplos reais.
2. PADRÕES DE LINGUAGEM - Como clientes escrevem (abreviações, erros, gírias, etc).
3. INTENÇÕES - Categorize TODAS as intenções com frequência e exemplos.
4. INFORMAÇÕES MAIS PEDIDAS - Dados que devem estar no prompt.

MENSAGENS:
${texto}`,
            response_json_schema: {
                type: "object",
                properties: {
                    duvidas_dificeis: { type: "array", items: { type: "string" } },
                    padroes_linguagem: { type: "array", items: { type: "string" } },
                    intencoes: { type: "array", items: { type: "object", properties: { intencao: { type: "string" }, frequencia: { type: "string" }, exemplos: { type: "array", items: { type: "string" } } } } },
                    informacoes_mais_pedidas: { type: "array", items: { type: "string" } }
                }
            }
        });

        const parte2 = await base44.integrations.Core.InvokeLLM({
            prompt: `Você é especialista em prompts para chatbots de clínicas médicas. O chatbot "Glória" atende pelo WhatsApp a clínica Centro Vida Saúde (Tramandaí/RS).

Baseado nas ${amostra.length} mensagens REAIS abaixo, crie 15+ SUGESTÕES DETALHADAS para melhorar o prompt.

Para cada: PROBLEMA identificado, SUGESTÃO de melhoria, EXEMPLO de resposta ideal.

Foque em: perguntas sem resposta, preços/horários/especialidades/convênios/endereço, áudios/imagens, saudações vagas ("oi"), múltiplos serviços, fluxo de agendamento.

MENSAGENS:
${texto}`,
            response_json_schema: {
                type: "object",
                properties: {
                    sugestoes: { type: "array", items: { type: "object", properties: { numero: { type: "number" }, problema: { type: "string" }, sugestao: { type: "string" }, exemplo_resposta: { type: "string" } } } },
                    resumo_executivo: { type: "string" }
                }
            }
        });

        return Response.json({
            success: true,
            total_mensagens: todasPerguntas.length,
            analisadas: amostra.length,
            analise: parte1,
            sugestoes: parte2
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});