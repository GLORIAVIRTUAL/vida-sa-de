import { createClientFromRequest } from 'npm:@base44/sdk@0.8.0';
import { extrairIntencao } from '../../shared/gloriaLlm.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { texto, vezes } = await req.json();
  const out = [];
  for (let i = 0; i < (vezes || 3); i++) {
    out.push(await extrairIntencao(base44.asServiceRole, {
      texto, historico: [], estado: 'OCIOSO', opcoes_oferecidas: null, dataHoje: '2026-08-23'
    }));
  }
  return Response.json(out);
});