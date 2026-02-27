import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    // Download sample PDF
    const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const pdfResp = await fetch(pdfUrl);
    const pdfBlob = await pdfResp.blob();
    
    const formData = new FormData();
    formData.append('file', new File([pdfBlob], 'dummy.pdf', { type: 'application/pdf' }));
    formData.append('purpose', 'vision');
    
    const uploadResp = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}` },
        body: formData
    });
    
    return Response.json(await uploadResp.json());
});