import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { fileUrl } = await req.json();

        if (!fileUrl) {
            return Response.json({ error: 'fileUrl required' }, { status: 400 });
        }

        // =====================================================================
        // 🔒 CÓDIGO BLOQUEADO/PROTEGIDO A PEDIDO DO USUÁRIO 🔒
        // NÃO ALTERE A LÓGICA DE EXTRAÇÃO DE PDF. ELA FOI HOMOLOGADA E ESTÁ FUNCIONANDO.
        // =====================================================================
        console.log('📄 PDF detectado - Extraindo texto via InvokeLLM...');
        let pdfTextoExtraido = null;
        
        for (let tentativa = 1; tentativa <= 2 && !pdfTextoExtraido; tentativa++) {
          try {
            const llmResult = await Promise.race([
              base44.asServiceRole.integrations.Core.InvokeLLM({
                prompt: `Leia o documento/imagem anexo e extraia a lista exata de exames médicos. Liste um por linha. Se não houver exames, retorne "VAZIO".`,
                file_urls: [fileUrl]
              }),
              new Promise((_, r) => setTimeout(() => r(new Error('Timeout InvokeLLM')), 30000))
            ]);
            
            if (typeof llmResult === 'string' && llmResult.trim().length > 5 && !llmResult.includes('VAZIO')) {
              pdfTextoExtraido = llmResult.trim();
              console.log('✅ Texto extraído do PDF:\n', pdfTextoExtraido);
            }
          } catch (e) {
            console.warn(`⚠️ InvokeLLM tentativa ${tentativa} falhou:`, e.message);
          }
        }

        return Response.json({ text: pdfTextoExtraido });
    } catch (error) {
        console.error('❌ Erro extractPdfText:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});