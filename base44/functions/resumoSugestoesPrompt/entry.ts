import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Buscar todos os contatos (somente leitura)
        let todosContatos = [];
        let skip = 0;
        while (true) {
            const batch = await base44.asServiceRole.entities.Contato.list('-created_date', 100, skip);
            if (!batch || batch.length === 0) break;
            todosContatos = [...todosContatos, ...batch];
            if (batch.length < 100) break;
            skip += 100;
        }

        // Extrair mensagens dos clientes
        let todasPerguntas = [];
        for (const contato of todosContatos) {
            const hist = contato.historico_mensagens;
            if (!hist || !Array.isArray(hist) || hist.length === 0) continue;
            const msgs = hist
                .filter(m => m.role === 'user' && m.content && m.content.trim().length > 2)
                .map(m => m.content.trim());
            todasPerguntas = [...todasPerguntas, ...msgs];
        }

        // Amostrar 500 mensagens
        let amostra = todasPerguntas;
        if (amostra.length > 500) {
            const step = Math.floor(amostra.length / 500);
            amostra = amostra.filter((_, i) => i % step === 0).slice(0, 500);
        }

        const texto = amostra.map((msg, i) => `${i + 1}. ${msg}`).join('\n');

        // PARTE 1: Dúvidas difíceis + Padrões de linguagem + Intenções
        const parte1 = await base44.integrations.Core.InvokeLLM({
            prompt: `Você é analista de atendimento de uma clínica médica (Centro Vida Saúde, Tramandaí/RS). O chatbot se chama Glória.

Analise as ${amostra.length} mensagens de clientes abaixo e responda:

1. **DÚVIDAS QUE O CHATBOT PROVAVELMENTE NÃO SOUBE RESPONDER** - Liste pelo menos 15 perguntas complexas, específicas ou fora do padrão. Inclua exemplos reais.

2. **PADRÕES DE LINGUAGEM** - Como os clientes escrevem? Abreviações, erros comuns, gírias, formas de cumprimentar, etc.

3. **INTENÇÕES IDENTIFICADAS** - Categorize TODAS as intenções (agendar, cancelar, remarcar, preço, localização, horário, especialidade, resultado exame, cartão, etc.) com frequência estimada.

4. **INFORMAÇÕES QUE OS CLIENTES MAIS PEDEM** - Quais dados a clínica deveria ter sempre no prompt.

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

        // PARTE 2: Sugestões detalhadas para o prompt
        const parte2 = await base44.integrations.Core.InvokeLLM({
            prompt: `Você é um especialista em criar prompts para chatbots de clínicas médicas. O chatbot se chama "Glória" e atende pelo WhatsApp a clínica Centro Vida Saúde em Tramandaí/RS.

Baseado nas ${amostra.length} mensagens REAIS dos clientes abaixo, crie SUGESTÕES DETALHADAS E PRÁTICAS para melhorar o prompt da Glória.

Para cada sugestão, inclua:
- O PROBLEMA identificado nas conversas
- A SUGESTÃO de melhoria
- Um EXEMPLO de como a Glória deveria responder

Foque em:
- Perguntas que ela provavelmente não soube responder
- Informações que devem estar no prompt (preços, horários, especialidades, convênios, endereço, etc.)
- Como lidar com áudios, imagens, abreviações
- Como lidar com pacientes que mandam apenas "oi", "bom dia" sem dizer o que querem
- Como lidar com perguntas sobre múltiplos serviços ao mesmo tempo
- Fluxo de agendamento ideal baseado no comportamento real

Seja BEM DETALHADO e PRÁTICO. Mínimo 15 sugestões.

MENSAGENS DOS CLIENTES:
${texto}`,
            response_json_schema: {
                type: "object",
                properties: {
                    sugestoes: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                numero: { type: "number" },
                                problema: { type: "string" },
                                sugestao: { type: "string" },
                                exemplo_resposta: { type: "string" }
                            }
                        }
                    },
                    resumo_executivo: { type: "string" }
                }
            }
        });

        return Response.json({
            success: true,
            total_mensagens: todasPerguntas.length,
            analisadas: amostra.length,
            parte1_analise: parte1,
            parte2_sugestoes: parte2
        });

    } catch (error) {
        console.error('Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});