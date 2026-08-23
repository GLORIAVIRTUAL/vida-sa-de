import { createClientFromRequest } from 'npm:@base44/sdk@0.8.0';
import { processarTurno } from '../../shared/gloriaDialogo.ts';

// Simula conversas em memória (não grava nada no contato). Só confirma se o
// teste enviar "SIM" — os testes de leitura param antes disso.
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const sr = base44.asServiceRole;
  const { conversas, telefone } = await req.json();
  const saida = [];

  for (const mensagens of conversas) {
    let estado = 'OCIOSO';
    let dados = {};
    const turnos = [];
    for (const texto of mensagens) {
      const contato = {
        telefone: telefone || '5551999990000',
        telefone_normalizado: telefone || '5551999990000',
        gloria_estado: estado,
        gloria_estado_dados: dados,
        historico_mensagens: []
      };
      const r = await processarTurno(sr, { contato, texto, mediaUrl: null });
      if (!r) {
        turnos.push({ cliente: texto, gloria: '(sem resposta - atendimento humano)' });
        break;
      }
      estado = r.estado;
      dados = r.dados;
      turnos.push({ cliente: texto, gloria: r.texto, estado });
    }
    saida.push(turnos);
  }

  return Response.json({ saida });
});