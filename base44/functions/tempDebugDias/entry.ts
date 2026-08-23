import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { extrairIntencao } from '../../shared/gloriaLlm.ts';
import { medicoPorNomeCore, diasAtendimentoCore } from '../../shared/gloriaHorariosMedico.ts';

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const sr = base44.asServiceRole;
  const { texto } = await req.json().catch(() => ({ texto: '' }));

  const extraido = await extrairIntencao(sr, { texto, historico: [], estado: 'OCIOSO', dataHoje: '2026-08-23' });
  const busca = await medicoPorNomeCore(sr, { nome: extraido.medico || texto });
  let dias = null;
  if (busca.ok && busca.medicos.length === 1) {
    dias = await diasAtendimentoCore(sr, { medico_id: busca.medicos[0].id });
  }
  return Response.json({ extraido, busca, dias });
}