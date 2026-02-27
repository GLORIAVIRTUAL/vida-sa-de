// Função auxiliar: detecta e restaura tipo de mídia quando ela foi concatenada no texto (buffer)
// Chamada via base44.functions.invoke('parseMidiaBuffer', { messageText, mediaType, mediaUrl })

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const { messageText, mediaType, mediaUrl } = await req.json();

    let textoAtual = messageText || '';
    let tipoAtual = mediaType || 'text';
    let urlAtual = mediaUrl || null;

    if ((!urlAtual || tipoAtual === 'text') && textoAtual) {
        const urlNoTexto = textoAtual.match(/(https?:\/\/[^\s\n]+)/i);
        const temIndicadorAudio = /\[(?:á|a)udio\s*(?:recebido)?\]/i.test(textoAtual);
        const temIndicadorDoc = /\[Documento[:\s]/i.test(textoAtual);
        const temIndicadorImagem = /\[Imagem\s*recebida?\]/i.test(textoAtual);

        if (urlNoTexto) {
            const url = urlNoTexto[1];

            if (temIndicadorAudio) {
                tipoAtual = 'audio';
                urlAtual = url;
                textoAtual = textoAtual.replace(url, '').replace(/\[(?:á|a)udio\s*(?:recebido)?\]/gi, '').trim();
                if (!textoAtual) textoAtual = '[Áudio recebido]';

            } else if (url.match(/\.ogg/i)) {
                tipoAtual = 'audio';
                urlAtual = url;
                textoAtual = textoAtual.replace(url, '').trim();
                if (!textoAtual) textoAtual = '[Áudio recebido]';

            } else if (temIndicadorDoc) {
                tipoAtual = 'document';
                urlAtual = url;
                const descricaoDoc = textoAtual.match(/\[Documento[:\s]+([^\]]+)\]/i);
                textoAtual = descricaoDoc ? `[Documento: ${descricaoDoc[1]}]` : '[Documento recebido]';

            } else if (url.match(/\.(pdf|doc|docx)/i)) {
                tipoAtual = 'document';
                urlAtual = url;
                textoAtual = textoAtual.replace(url, '').trim();
                if (!textoAtual) textoAtual = '[Documento recebido]';

            } else if (temIndicadorImagem) {
                tipoAtual = 'image';
                urlAtual = url;
                textoAtual = textoAtual.replace(url, '').replace(/\[Imagem\s*recebida?\]/gi, '').trim();
                if (!textoAtual) textoAtual = '[Imagem recebida]';
            }
        }
    }

    return Response.json({ messageText: textoAtual, mediaType: tipoAtual, mediaUrl: urlAtual });
});