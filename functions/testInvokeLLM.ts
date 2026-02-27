import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    
    const pdfUrl = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/696256b5ef59ea2bed1bd7ea/dd3ce134c_Requisicao_1.pdf';
    
    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `Por favor, leia a imagem/documento anexo e extraia a lista exata de exames médicos solicitados. Liste exatamente o que está escrito no documento, sem inventar exames.`,
        file_urls: [pdfUrl]
    });
    
    return Response.json({ result: res });
});