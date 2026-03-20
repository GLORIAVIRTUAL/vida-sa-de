import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);

    try {
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        console.log('📊 Buscando todos os contatos com histórico...');

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

        console.log(`📋 Total de contatos encontrados: ${todosContatos.length}`);

        // Extrair apenas mensagens dos CLIENTES (role: user)
        let todasPerguntasClientes = [];
        let conversasComHistorico = 0;

        for (const contato of todosContatos) {
            const hist = contato.historico_mensagens;
            if (!hist || !Array.isArray(hist) || hist.length === 0) continue;
            
            conversasComHistorico++;
            const msgsCliente = hist
                .filter(m => m.role === 'user' && m.content && m.content.trim().length > 2)
                .map(m => m.content.trim());
            
            todasPerguntasClientes = [...todasPerguntasClientes, ...msgsCliente];
        }

        console.log(`💬 Conversas com histórico: ${conversasComHistorico}`);
        console.log(`❓ Total de mensagens de clientes: ${todasPerguntasClientes.length}`);

        if (todasPerguntasClientes.length === 0) {
            return Response.json({
                success: true,
                conversas_analisadas: conversasComHistorico,
                total_mensagens_clientes: 0,
                resumo: 'Nenhuma mensagem de cliente encontrada no histórico.'
            });
        }

        // Limitar para não estourar o contexto do LLM (~600 mensagens amostradas)
        let amostra = todasPerguntasClientes;
        if (amostra.length > 600) {
            // Pegar mensagens distribuídas uniformemente
            const step = Math.floor(amostra.length / 600);
            amostra = amostra.filter((_, i) => i % step === 0).slice(0, 600);
        }

        const textoMensagens = amostra.map((msg, i) => `${i + 1}. ${msg}`).join('\n');

        console.log(`🤖 Enviando ${amostra.length} mensagens para análise via LLM...`);

        // Chamar LLM para analisar (somente leitura, não altera nada)
        const resultado = await base44.integrations.Core.InvokeLLM({
            prompt: `Você é um analista de atendimento ao cliente de uma CLÍNICA MÉDICA chamada Centro Vida Saúde (antes Glória Clínica), localizada em Tramandaí/RS.

Abaixo estão ${amostra.length} mensagens reais enviadas por clientes via WhatsApp ao chatbot da clínica (chamado "Glória").

Sua tarefa é analisar TODAS as mensagens e gerar um relatório detalhado com:

1. **TOP 20 PERGUNTAS/ASSUNTOS MAIS FREQUENTES** - Liste os 20 tópicos mais perguntados, com a quantidade estimada de vezes que apareceram e exemplos reais de como os clientes perguntam.

2. **DÚVIDAS QUE O CHATBOT PROVAVELMENTE NÃO SOUBE RESPONDER** - Identifique perguntas complexas, específicas ou fora do padrão que o chatbot pode ter dificuldade.

3. **PADRÕES DE LINGUAGEM DOS CLIENTES** - Como eles escrevem? Usam abreviações? Áudios? Emojis? Erros de digitação comuns?

4. **INTENÇÕES IDENTIFICADAS** - Categorize as intenções (agendar consulta, cancelar, remarcar, perguntar preço, localização, horário, especialidade, etc.)

5. **SUGESTÕES PARA O PROMPT DO CHATBOT** - Baseado nas perguntas reais, sugira melhorias específicas e detalhadas para o prompt da Glória responder melhor.

6. **INFORMAÇÕES QUE OS CLIENTES MAIS PEDEM** - Quais dados a clínica deveria ter sempre disponível no prompt (preços, endereço, horários, especialidades, etc.)

MENSAGENS DOS CLIENTES:
${textoMensagens}`,
            response_json_schema: {
                type: "object",
                properties: {
                    top_20_perguntas: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                ranking: { type: "number" },
                                assunto: { type: "string" },
                                frequencia_estimada: { type: "string" },
                                exemplos_reais: { type: "array", items: { type: "string" } }
                            }
                        }
                    },
                    duvidas_dificeis: {
                        type: "array",
                        items: { type: "string" }
                    },
                    padroes_linguagem: {
                        type: "array",
                        items: { type: "string" }
                    },
                    intencoes_identificadas: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                intencao: { type: "string" },
                                frequencia: { type: "string" }
                            }
                        }
                    },
                    sugestoes_prompt: {
                        type: "array",
                        items: { type: "string" }
                    },
                    informacoes_mais_pedidas: {
                        type: "array",
                        items: { type: "string" }
                    },
                    resumo_geral: { type: "string" }
                }
            }
        });

        console.log('✅ Análise concluída com sucesso!');

        return Response.json({
            success: true,
            total_contatos: todosContatos.length,
            conversas_com_historico: conversasComHistorico,
            total_mensagens_clientes: todasPerguntasClientes.length,
            mensagens_analisadas: amostra.length,
            analise: resultado
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});