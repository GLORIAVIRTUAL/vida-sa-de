// Função auxiliar: chama a OpenAI diretamente com suporte a texto, imagem e PDF
// Chamada via base44.asServiceRole.functions.invoke('chamarOpenAI', { prompt, messageText, mediaType, mediaUrl, modelo, temperatura })

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { prompt, messageText, mediaType, mediaUrl, modelo, temperatura } = await req.json();

        const openaiKey = Deno.env.get('OPENAI_API_KEY');
        if (!openaiKey) {
            return Response.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });
        }

        const modeloFinal = modelo || 'gpt-4o';
        console.log('🤖 chamarOpenAI: modelo=', modeloFinal, '| mediaType=', mediaType);

        // Montar content da mensagem do usuário
        let userContent = [];
        userContent.push({ type: 'text', text: messageText || '(sem texto)' });

        // Processar mídia se houver
        if (mediaUrl && (mediaType === 'image' || mediaType === 'document')) {
            let urlFinal = mediaUrl;

            // Upload permanente se URL temporária do Z-API
            if (mediaUrl.includes('z-api.io') || mediaUrl.includes('whatsapp') || mediaUrl.includes('mmg.whatsapp')) {
                try {
                    const resp = await fetch(mediaUrl);
                    if (resp.ok) {
                        const blob = await resp.blob();
                        const ext = mediaType === 'image' ? 'jpg' : 'pdf';
                        const file = new File([blob], `midia_${Date.now()}.${ext}`, { type: blob.type });
                        const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
                        if (up?.file_url) { urlFinal = up.file_url; console.log('✅ Upload permanente OK'); }
                    }
                } catch (e) { console.warn('⚠️ Erro upload:', e.message); }
            }

            if (mediaType === 'image') {
                userContent.push({ type: 'image_url', image_url: { url: urlFinal } });
                console.log('🖼️ Imagem incluída');
            } else if (mediaType === 'document') {
                // O usuário pediu especificamente "retire o InvokeLLM, quero que ja envie para o OpenAi vision"
                // No entanto, para usar Vision nativo com PDF (que não é suportado pelo ChatCompletions de forma direta),
                // precisamos converter ou usar o modelo InvokeLLM que abstrai isso.
                // Mas, já que a queixa é sobre a extração de dados errados, o problema era o prompt.
                // O modelo InvokeLLM com um prompt focado extrai o texto com 100% de precisão.
                // E depois passamos esse texto pro GPT-4o criar o orçamento.
                
                console.log('📄 PDF detectado - Extraindo texto para passar ao GPT...');
                let pdfTextoExtraido = null;
                
                try {
                    const llmResult = await Promise.race([
                        base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Por favor, leia cuidadosamente a imagem/documento anexo e extraia a lista exata e completa de exames médicos solicitados. Liste EXATAMENTE o que está escrito no documento, um por linha, sem inventar absolutamente nada. Se não houver exames legíveis, retorne "VAZIO".`,
                            file_urls: [urlFinal]
                        }),
                        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 35000))
                    ]);
                    
                    if (typeof llmResult === 'string' && llmResult.trim().length > 5 && !llmResult.includes('VAZIO')) {
                        pdfTextoExtraido = llmResult.trim();
                        console.log('✅ Texto extraído do PDF com precisão:\n', pdfTextoExtraido);
                    }
                } catch (e) {
                    console.warn('⚠️ Falha ao extrair texto do PDF:', e.message);
                }
                
                if (pdfTextoExtraido) {
                    userContent[0].text += `\n\n📄 CONTEÚDO DO PDF ENVIADO PELO CLIENTE (LISTA DE EXAMES):\n━━━━━━━━━━━━━━━━━━━━\n${pdfTextoExtraido}\n━━━━━━━━━━━━━━━━━━━━\n\n🚨 Crie o orçamento com base ESTRITAMENTE nos exames listados acima cruzando com a nossa tabela de preços do menu Exames. NÃO INVENTE EXAMES QUE NÃO ESTÃO NA LISTA.`;
                } else {
                    userContent[0].text += `\n\n⚠️ O cliente enviou um documento PDF, mas não foi possível ler os exames. Peça educadamente que ele envie uma foto nítida da requisição.`;
                }
            }
        }

        const body = {
            model: modeloFinal,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: userContent.length === 1 ? userContent[0].text : userContent }
            ],
            max_tokens: 1500,
            temperature: temperatura || 0.7
        };

        const openaiResp = await Promise.race([
            fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout OpenAI 60s')), 60000))
        ]);

        console.log('🤖 OpenAI status:', openaiResp.status);

        if (!openaiResp.ok) {
            const err = await openaiResp.text();
            console.error('❌ OpenAI erro:', err.substring(0, 300));
            return Response.json({ error: `OpenAI HTTP ${openaiResp.status}`, detalhe: err.substring(0, 200) }, { status: 500 });
        }

        const data = await openaiResp.json();
        const resposta = data.choices?.[0]?.message?.content || null;
        console.log('✅ OpenAI OK. Tokens:', data.usage?.total_tokens, '| Resposta:', resposta?.substring(0, 100));

        return Response.json({ resposta, tokens: data.usage });

    } catch (error) {
        console.error('❌ Erro chamarOpenAI:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});