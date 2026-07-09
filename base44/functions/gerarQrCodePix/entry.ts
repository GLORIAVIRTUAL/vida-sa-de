import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Usa hostname DNS (sslip.io resolve para o IP do servidor-ponte) pois o runtime bloqueia fetch direto a IPs
const PROXY_SERVER = 'http://216.238.126.207.sslip.io:3000';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { ordem_servico_id, valor, descricao, devedor, expiracao } = await req.json();

    if (!ordem_servico_id || !valor) {
      return Response.json({ error: 'Missing required fields: ordem_servico_id, valor' }, { status: 400 });
    }

    // Chama o servidor ponte (Vultr com IP fixo + mTLS local) para gerar o Pix
    const proxyResponse = await fetch(`${PROXY_SERVER}/gerar-pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valor: Number(valor).toFixed(2),
        descricao: descricao || `OS ${ordem_servico_id}`,
        devedor: devedor || undefined,
        expiracao: expiracao || 3600,
      }),
    });

    const responseText = await proxyResponse.text();

    if (!proxyResponse.ok) {
      console.error('Proxy/Sicredi error:', responseText);
      return Response.json({
        error: 'Failed to generate Pix charge',
        details: responseText,
        status: proxyResponse.status,
      }, { status: 500 });
    }

    const cobData = JSON.parse(responseText);

    // Salvar o txid na OS para permitir confirmação posterior (webhook ou consulta manual)
    if (cobData.txid) {
      try {
        await base44.asServiceRole.entities.OrdemServico.update(ordem_servico_id, {
          transaction_id: cobData.txid,
        });
      } catch (updateErr) {
        console.error('Falha ao salvar txid na OS:', updateErr.message);
      }
    }

    return Response.json({
      success: true,
      qr_code: cobData.pixCopiaECola,
      location: cobData.location,
      txid: cobData.txid,
      transaction_id: cobData.txid,
      valor: valor,
      chave_pix: cobData.chave,
      ordem_servico_id: ordem_servico_id,
      expiracao: cobData.calendario?.expiracao,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});