import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const parte = body.parte || 'sugestoes';

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
        for (const c of todosContatos) {
            const hist = c.historico_mensagens;
            if (!hist || !Array.isArray(hist)) continue;
            hist.filter(m => m.role === 'user' && m.content && m.content.trim().length > 2)
                .forEach(m => todasPerguntas.push(m.content.trim()));
        }

        let amostra = todasPerguntas;
        if (amostra.length > 500) {
            const step = Math.floor(amostra.length / 500);
            amostra = amostra.filter((_, i) => i % step === 0).slice(0, 500);
        }

        const texto = amostra.map((m, i) => `${i + 1}. ${m}`).join('\n');

        if (parte === 'analise') {
            const res = await base44.integrations.Core.InvokeLLM({
                prompt: `Analise ${amostra.length} mensagens reais de clientes via WhatsApp do chatbot "Glória" (Centro Vida Saúde, Tramandaí/RS).

1. DÚVIDAS DIFÍCEIS (15+) - perguntas que o chatbot provavelmente não soube responder.
2. PADRÕES DE LINGUAGEM - como clientes escrevem.
3. INTENÇÕES IDENTIFICADAS - todas, com frequência e exemplos.
4. INFORMAÇÕES MAIS PEDIDAS.

MENSAGENS:\n${texto}`,
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
            return Response.json({ success: true, total: todasPerguntas.length, analisadas: amostra.length, resultado: res });
        }

        // Parte sugestões (padrão)
        const res = await base44.integrations.Core.InvokeLLM({
            prompt: `Você é especialista em prompts para chatbots de clínicas. O chatbot "Glória" atende via WhatsApp a clínica Centro Vida Saúde (Tramandaí/RS).

Baseado em ${amostra.length} mensagens REAIS, crie 15+ SUGESTÕES DETALHADAS para melhorar o prompt.

Cada sugestão deve ter: PROBLEMA, SUGESTÃO, EXEMPLO DE RESPOSTA IDEAL.

Foque em: perguntas sem resposta, preços/horários/especialidades/convênios/endereço, áudios/imagens, saudações vagas, múltiplos serviços, fluxo de agendamento.

MENSAGENS:\n${texto}`,
            response_json_schema: {
                type: "object",
                properties: {
                    sugestoes: { type: "array", items: { type: "object", properties: { numero: { type: "number" }, problema: { type: "string" }, sugestao: { type: "string" }, exemplo_resposta: { type: "string" } } } },
                    resumo_executivo: { type: "string" }
                }
            }
        });
        return Response.json({ success: true, total: todasPerguntas.length, analisadas: amostra.length, resultado: res });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});