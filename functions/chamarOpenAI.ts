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
                // PDF: Converte PDF para imagens PNG e envia como image_url para o OpenAI Vision
                console.log('🔄 Convertendo PDF em imagens para OpenAI Vision...');
                try {
                    // Usar parseMidiaBuffer para converter PDF → Imagens PNG
                    const parsedResult = await base44.asServiceRole.functions.invoke('parseMidiaBuffer', {
                        mediaUrl: urlFinal,
                        mediaType: 'document',
                        converterPdfParaImagens: true
                    });
                    
                    if (parsedResult?.data?.imagens && parsedResult.data.imagens.length > 0) {
                        console.log(`✅ PDF convertido em ${parsedResult.data.imagens.length} imagens PNG`);
                        
                        // Adicionar TODAS as imagens do PDF ao userContent para o OpenAI ler
                        for (const imgUrl of parsedResult.data.imagens) {
                            userContent.push({ type: 'image_url', image_url: { url: imgUrl } });
                        }
                        
                        userContent[0].text = `📄 O cliente enviou um PDF de requisição médica. Analise as imagens abaixo (páginas do PDF convertidas) e extraia TODOS os exames solicitados. Monte o orçamento com base na lista de procedimentos/exames disponíveis.\n\n${userContent[0].text}`;
                    } else {
                        console.warn('❌ Falha ao converter PDF em imagens');
                        userContent[0].text += `\n\n⚠️ Não foi possível processar o PDF. Peça ao cliente para enviar uma FOTO da requisição.`;
                    }
                } catch (convError) {
                    console.error('❌ Erro ao converter PDF:', convError.message);
                    userContent[0].text += `\n\n⚠️ Não foi possível processar o PDF. Peça ao cliente para enviar uma FOTO da requisição.`;
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