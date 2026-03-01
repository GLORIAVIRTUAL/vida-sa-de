import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Acesso negado' }, { status: 403 });
    }

    // Buscar os últimos 500 contatos com histórico de mensagens
    const contatos = await base44.asServiceRole.entities.Contato.list('-updated_date', 500);

    // Extrair apenas as mensagens dos CLIENTES (role: user) de cada conversa
    let todasMensagensClientes = [];
    let totalConversas = 0;
    let totalMensagens = 0;

    for (const contato of contatos) {
      const historico = contato.historico_mensagens || [];
      if (historico.length === 0) continue;

      totalConversas++;
      const mensagensUser = historico
        .filter(m => m.role === 'user' && m.content && m.content.trim().length > 2)
        .map(m => m.content.trim());

      if (mensagensUser.length > 0) {
        totalMensagens += mensagensUser.length;
        // Limitar a 10 mensagens por contato para não exceder tokens
        const amostra = mensagensUser.slice(0, 10);
        todasMensagensClientes.push({
          nome: contato.nome || 'Desconhecido',
          mensagens: amostra
        });
      }
    }

    // Montar um bloco de texto com todas as mensagens para a IA analisar
    // Limitar o tamanho total para caber no contexto da OpenAI
    let blocoTexto = '';
    let charCount = 0;
    const MAX_CHARS = 80000; // ~80k chars para ficar dentro dos limites

    for (const c of todasMensagensClientes) {
      const bloco = `[${c.nome}]: ${c.mensagens.join(' | ')}\n`;
      if (charCount + bloco.length > MAX_CHARS) break;
      blocoTexto += bloco;
      charCount += bloco.length;
    }

    console.log(`Analisando ${totalConversas} conversas com ${totalMensagens} mensagens de clientes`);

    // Enviar para a OpenAI analisar
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Você é um analista de atendimento ao cliente de uma clínica médica chamada Centro Vida Saúde. 
Sua tarefa é analisar as mensagens enviadas por clientes via WhatsApp e gerar um relatório detalhado e prático.

O relatório deve conter:

## 1. PRINCIPAIS ASSUNTOS PROCURADOS
Liste os assuntos mais frequentes em ordem de frequência (do mais para o menos procurado), com:
- Nome do assunto
- Frequência estimada (% aproximado)
- Exemplos reais de como os clientes pedem

## 2. ESPECIALIDADES MAIS PROCURADAS
Liste as especialidades médicas mais mencionadas pelos clientes, com frequência relativa.

## 3. COMO OS CLIENTES SE COMUNICAM
Analise o padrão de comunicação:
- Linguagem formal vs informal
- Uso de abreviações
- Perguntas diretas vs indiretas
- Saudações mais comuns
- Padrões de horário/urgência nas mensagens

## 4. FRUSTRAÇÕES E PROBLEMAS IDENTIFICADOS
Identifique sinais de frustração, reclamações ou problemas recorrentes que os clientes mencionam.

## 5. SUGESTÕES PARA O PROMPT DO CHATBOT
Com base nos padrões identificados, sugira adaptações específicas para o prompt do chatbot:
- Palavras-chave que o chatbot deve reconhecer
- Respostas que devem ser priorizadas
- Fluxos de conversa que devem ser otimizados
- Formas de linguagem que o chatbot deve usar para se adequar ao público

Seja detalhado, prático e use exemplos reais das mensagens.`
        },
        {
          role: "user",
          content: `Aqui estão as mensagens de ${totalConversas} conversas de clientes (${totalMensagens} mensagens no total):\n\n${blocoTexto}`
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    const relatorio = response.choices[0].message.content;

    return Response.json({
      success: true,
      total_conversas_analisadas: totalConversas,
      total_mensagens_analisadas: totalMensagens,
      relatorio: relatorio
    });

  } catch (error) {
    console.error('Erro na análise:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});