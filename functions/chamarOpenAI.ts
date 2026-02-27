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
                // PDF: Extrair texto via AMBOS os métodos em paralelo para velocidade
                let pdfTextoExtraido = null;
                console.log('📄 Extraindo texto do PDF...');
                
                // Executar AMBOS em paralelo — usar o primeiro que retornar
                const [extractResult, llmResult] = await Promise.allSettled([
                    Promise.race([
                        base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
                            file_url: urlFinal,
                            json_schema: {
                                type: "object",
                                properties: {
                                    texto_completo: { type: "string", description: "Todo o texto visível no documento, linha por linha" },
                                    itens_listados: { type: "array", items: { type: "string" }, description: "Lista de cada item/exame/procedimento mencionado" }
                                }
                            }
                        }),
                        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 25000))
                    ]),
                    Promise.race([
                        base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Extraia TODO o conteúdo deste PDF. Liste CADA exame/procedimento um por linha. Retorne APENAS o texto extraído.`,
                            file_urls: [urlFinal]
                        }),
                        new Promise((_, r) => setTimeout(() => r(new Error('Timeout')), 25000))
                    ])
                ]);
                
                // Usar ExtractData se funcionou
                if (extractResult.status === 'fulfilled' && extractResult.value?.status === 'success' && extractResult.value?.output) {
                    const out = extractResult.value.output;
                    let partes = [];
                    if (out.itens_listados?.length > 0) partes.push(`Itens/Exames:\n${out.itens_listados.map((item, i) => `${i+1}. ${item}`).join('\n')}`);
                    if (out.texto_completo) partes.push(`Texto completo:\n${out.texto_completo}`);
                    if (partes.length > 0) { pdfTextoExtraido = partes.join('\n'); console.log('✅ ExtractData OK, length:', pdfTextoExtraido.length); }
                }
                // Fallback: InvokeLLM
                if (!pdfTextoExtraido && llmResult.status === 'fulfilled' && typeof llmResult.value === 'string' && llmResult.value.trim().length > 10) {
                    pdfTextoExtraido = llmResult.value.trim();
                    console.log('✅ InvokeLLM OK, length:', pdfTextoExtraido.length);
                }
                
                if (pdfTextoExtraido) {
                    userContent[0].text += `\n\n📄 CONTEÚDO DO PDF ENVIADO PELO CLIENTE:\n━━━━━━━━━━━━━━━━━━━━\n${pdfTextoExtraido}\n━━━━━━━━━━━━━━━━━━━━\n\n🚨 Use TODOS os itens acima para montar o orçamento. NÃO invente nem omita exames.`;
                } else {
                    console.warn('❌ PDF: nenhum método extraiu texto');
                    userContent[0].text += `\n\n⚠️ O cliente enviou um PDF mas não foi possível extrair o conteúdo. Peça para enviar uma FOTO/IMAGEM da requisição.`;
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