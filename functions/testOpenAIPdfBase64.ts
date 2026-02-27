import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    
    // Download sample PDF
    const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    const pdfResp = await fetch(pdfUrl);
    const pdfBytes = await pdfResp.arrayBuffer();
    
    // Encode to base64
    const base64Pdf = btoa(String.fromCharCode(...new Uint8Array(pdfBytes)));
    
    const body = {
        model: 'gpt-4o',
        messages: [
            { role: 'user', content: [
                { type: 'text', text: 'Describe this document' },
                { type: 'file', file: { data: base64Pdf, mime_type: 'application/pdf' } }
            ]}
        ]
    };
    
    const openaiResp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    const data = await openaiResp.json();
    return Response.json(data);
});