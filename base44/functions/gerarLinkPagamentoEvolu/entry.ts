import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Não autorizado' }, { status: 401 });
        }

        const {
            value,
            clientName,
            paymentBrand = 'VISA_CREDITO',
            installments = 1,
            callbackUrl
        } = await req.json();

        if (!value || !clientName) {
            return Response.json({ error: 'Informe value e clientName' }, { status: 400 });
        }

        // Etapa 1: obter o Bearer token via Basic Auth (usuário:senha)
        const evoluUser = 'gloria';
        const evoluPass = Deno.env.get('EVOLUSERVICES_TOKEN');
        const basicAuth = btoa(`${evoluUser}:${evoluPass}`);
        const merchantId = 'bcc1614f-431e-43cd-bf28-69020191c4dc';

        const tokenResp = await fetch('https://sandbox.evoluservices.com/remote/token', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${basicAuth}`
            }
        });

        const tokenText = await tokenResp.text();
        console.log('EvoluServices token response:', tokenResp.status, tokenText);

        if (!tokenResp.ok) {
            return Response.json(
                { error: 'Falha ao obter token EvoluServices', status: tokenResp.status, details: tokenText },
                { status: 502 }
            );
        }

        let bearerToken;
        try {
            const tokenJson = JSON.parse(tokenText);
            bearerToken = tokenJson.Bearer || tokenJson.bearer || tokenJson.token || tokenJson.access_token;
        } catch {
            bearerToken = null;
        }

        if (!bearerToken) {
            return Response.json(
                { error: 'Token não encontrado na resposta', details: tokenText },
                { status: 502 }
            );
        }

        // Etapa 2: usar o Bearer token para gerar o link de pagamento
        const payload = {
            transaction: {
                merchantId,
                value: Number(value).toFixed(2),
                installments: Number(installments) || 1,
                clientName,
                paymentBrand,
                callbackUrl: callbackUrl || 'http://api.owcloud.com.br/api/v1/Webhooks/evoluservicecallback'
            }
        };

        const resp = await fetch('https://sandbox.evoluservices.com/remote/transaction', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${bearerToken}`
            },
            body: JSON.stringify(payload)
        });

        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        console.log('EvoluServices transaction response:', resp.status, text);

        if (!resp.ok) {
            return Response.json(
                { error: 'Falha na EvoluServices', status: resp.status, details: data },
                { status: 502 }
            );
        }

        return Response.json({ success: true, data });
    } catch (error) {
        console.error('Erro gerarLinkPagamentoEvolu:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});