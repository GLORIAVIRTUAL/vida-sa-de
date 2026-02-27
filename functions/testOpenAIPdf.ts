import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    const urlFinal = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'; // Sample PDF
    
    const body = {
        model: 'gpt-4o',
        messages: [
            { role: 'user', content: [
                { type: 'text', text: 'Describe this document' },
                { type: 'image_url', image_url: { url: urlFinal } }
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