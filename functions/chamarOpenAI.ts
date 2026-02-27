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
                // PDF: GPT-4o NÃO suporta PDF via image_url com data:application/pdf
                // Estratégia: Extrair texto do PDF via Base44 e enviar como texto ao LLM
                let pdfTextoExtraido = null;
                
                // PASSO 1: Tentar extrair texto via ExtractDataFromUploadedFile
                try {
                    console.log('📄 Extraindo texto do PDF via ExtractDataFromUploadedFile...');
                    const extractResult = await Promise.race([
                        base44.asServiceRole.integrations.Core.ExtractDataFromUploadedFile({
                            file_url: urlFinal,
                            json_schema: {
                                type: "object",
                                properties: {
                                    texto_completo: { type: "string", description: "Todo o texto visível no documento, linha por linha" },
                                    itens_listados: { type: "array", items: { type: "string" }, description: "Lista de cada item/exame/procedimento mencionado no documento" },
                                    paciente_nome: { type: "string", description: "Nome do paciente se visível" },
                                    medico_nome: { type: "string", description: "Nome do médico se visível" },
                                    data_documento: { type: "string", description: "Data do documento se visível" }
                                }
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout Extract 20s')), 20000))
                    ]);
                    
                    console.log('📄 ExtractData resultado:', JSON.stringify(extractResult).substring(0, 500));
                    
                    if (extractResult?.status === 'success' && extractResult?.output) {
                        const out = extractResult.output;
                        let partes = [];
                        if (out.paciente_nome) partes.push(`Paciente: ${out.paciente_nome}`);
                        if (out.medico_nome) partes.push(`Médico: ${out.medico_nome}`);
                        if (out.data_documento) partes.push(`Data: ${out.data_documento}`);
                        if (out.itens_listados?.length > 0) {
                            partes.push(`\nItens/Exames listados no documento:\n${out.itens_listados.map((item, i) => `${i+1}. ${item}`).join('\n')}`);
                        }
                        if (out.texto_completo) partes.push(`\nTexto completo do documento:\n${out.texto_completo}`);
                        pdfTextoExtraido = partes.join('\n');
                        console.log('✅ Texto extraído do PDF com sucesso, length:', pdfTextoExtraido.length);
                    }
                } catch (extractErr) {
                    console.warn('⚠️ ExtractData falhou:', extractErr.message);
                }
                
                // PASSO 2: Se ExtractData falhou, tentar InvokeLLM com file_urls (suporta PDF nativamente)
                if (!pdfTextoExtraido) {
                    try {
                        console.log('📄 Fallback: Extraindo texto via InvokeLLM com file_urls...');
                        const llmExtract = await Promise.race([
                            base44.asServiceRole.integrations.Core.InvokeLLM({
                                prompt: `Analise este documento PDF e extraia TODO o conteúdo textual visível. Liste CADA item/exame/procedimento que aparecer, um por linha. Inclua nome do paciente, médico, data se visíveis. Retorne APENAS o texto extraído, sem explicações.`,
                                file_urls: [urlFinal],
                                add_context_from_internet: false
                            }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout InvokeLLM Extract 25s')), 25000))
                        ]);
                        
                        if (llmExtract && typeof llmExtract === 'string' && llmExtract.trim().length > 10) {
                            pdfTextoExtraido = llmExtract.trim();
                            console.log('✅ InvokeLLM extraiu texto do PDF, length:', pdfTextoExtraido.length);
                        }
                    } catch (llmErr) {
                        console.warn('⚠️ InvokeLLM fallback falhou:', llmErr.message);
                    }
                }
                
                // PASSO 3: Adicionar texto extraído ao conteúdo da mensagem
                if (pdfTextoExtraido) {
                    userContent[0].text += `\n\n📄 CONTEÚDO EXTRAÍDO DO DOCUMENTO PDF ENVIADO PELO CLIENTE:\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${pdfTextoExtraido}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n🚨 IMPORTANTE: O conteúdo acima foi extraído do PDF enviado pelo cliente. Use TODOS os itens/exames listados acima para montar o orçamento. NÃO invente exames que não estão listados acima. NÃO omita exames que ESTÃO listados acima.`;
                    console.log('📄 Texto do PDF adicionado ao prompt');
                } else {
                    // Último recurso: informar que não conseguiu ler
                    userContent[0].text += `\n\n⚠️ O cliente enviou um documento PDF mas não foi possível extrair o conteúdo. Peça ao cliente para enviar uma FOTO/IMAGEM da requisição em vez de PDF, pois assim conseguimos ler melhor.`;
                    console.warn('❌ Não foi possível extrair texto do PDF por nenhum método');
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