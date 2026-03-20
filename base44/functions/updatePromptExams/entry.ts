import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 1. Fetch current config
    const configs = await base44.asServiceRole.entities.ChatbotConfig.filter({ ativo: true });
    if (configs.length === 0) {
      return Response.json({ error: 'No active config found' });
    }
    const config = configs[0];
    
    // 2. Parse prompt
    let promptObj;
    try {
      promptObj = JSON.parse(config.prompt_sistema);
    } catch (e) {
      return Response.json({ error: 'Invalid JSON prompt', details: e.message });
    }

    // 3. Define the new intention for exam quotes
    const orcamentoExamesIntention = {
      "id": "orcamento_exames",
      "gatilhos": [
        "orçamento de exames",
        "quanto custa exame",
        "valor de exames",
        "preço de exame",
        "cotação exames",
        "fazer orçamento",
        "valores exames",
        "lista de preços",
        "tabela de exames"
      ],
      "fluxo_ordenado": [
        {
          "passo": 1,
          "acao": "Verificar se o paciente já enviou a lista de exames ou foto do pedido",
          "condicao": "Sempre"
        },
        {
          "passo": 2,
          "acao": "Pedir a foto do pedido médico ou a lista escrita dos exames",
          "condicao": "Se a lista ainda NÃO foi enviada na conversa"
        },
        {
          "passo": 3,
          "acao": "Identificar cada exame na lista enviada",
          "condicao": "Após receber a lista/foto"
        },
        {
          "passo": 4,
          "acao": "Consultar a tabela de preços para CADA exame identificado",
          "condicao": "Somente para exames que a clínica realiza"
        },
        {
          "passo": 5,
          "acao": "Listar os exames encontrados com seus preços individuais e somar o total",
          "condicao": "Final"
        },
        {
          "passo": 6,
          "acao": "Listar separadamente os exames que a clínica NÃO realiza",
          "condicao": "Se houver algum não encontrado"
        },
        {
          "passo": 7,
          "acao": "Perguntar se deseja agendar a coleta ou realizar os exames",
          "condicao": "Após apresentar o orçamento"
        }
      ],
      "regras": [
        "CRÍTICO: NUNCA, JAMAIS invente uma lista de exames. Se o paciente disser apenas 'quero orçamento', você DEVE PERGUNTAR 'Certo, por favor me envie a foto ou PDF do pedido médico ou escreva a lista dos exames que você precisa'.",
        "CRÍTICO: NÃO assuma quais exames o paciente quer (não chute 'hemograma', 'glicose', etc). Espere ele dizer.",
        "CRÍTICO: Se o paciente enviou um arquivo PDF ou uma imagem/foto do pedido, leia atentamente a lista de exames no documento. Não confunda exames de sangue (ex: Hemograma, Ureia) com exames de imagem (ex: Ecografia).",
        "Se o documento ou foto estiver ilegível, peça para o paciente escrever os nomes dos exames.",
        "Se o paciente perguntar o preço de UM exame específico (ex: 'quanto é o hemograma?'), pode responder direto o valor desse único exame.",
        "Para orçamentos de lista (vários exames), sempre some o valor total no final.",
        "Use a formatação de lista com check (✅) para exames atendidos e X (❌) para não atendidos."
      ]
    };

    // 4. Update or Add the intention
    if (!promptObj.intencoes) {
      promptObj.intencoes = [];
    }

    const index = promptObj.intencoes.findIndex(i => i.id === 'orcamento_exames');
    if (index !== -1) {
      promptObj.intencoes[index] = orcamentoExamesIntention; // Update existing
    } else {
      promptObj.intencoes.push(orcamentoExamesIntention); // Add new
    }

    // 5. Also add a global "regra de ouro" to be safe
    if (!promptObj.regras_ouro) promptObj.regras_ouro = [];
    promptObj.regras_ouro.push("NUNCA invente uma lista de exames para orçamento. Se o paciente não disse quais exames quer, PERGUNTE antes de dar qualquer preço.");

    // 6. Save back
    await base44.asServiceRole.entities.ChatbotConfig.update(config.id, {
      prompt_sistema: JSON.stringify(promptObj, null, 2)
    });

    return Response.json({ ok: true, message: 'Prompt updated with exam budget rules' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});