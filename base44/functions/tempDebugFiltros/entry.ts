import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  let todosContatos = [];
  let skip = 0;
  const batchSize = 500;
  while (todosContatos.length < 5000) {
    const batch = await base44.asServiceRole.entities.Contato.list('-created_date', batchSize, skip);
    if (!batch || batch.length === 0) break;
    todosContatos = todosContatos.concat(batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  
  const total = todosContatos.length;
  
  const comHistorico = todosContatos.filter(c => 
    (c.historico_mensagens && c.historico_mensagens.length > 0) || c.ultima_mensagem
  );
  const semHistorico = total - comHistorico.length;
  
  const unicosPorTelefone = new Set();
  comHistorico.forEach(c => {
      const telNorm = (c.telefone || '').replace(/\D/g, '');
      const telKey = telNorm.length >= 8 ? telNorm.slice(-8) : telNorm;
      if (telKey) unicosPorTelefone.add(telKey);
      else unicosPorTelefone.add(c.id);
  });
  
  return Response.json({ 
      totalNoBanco: total, 
      comHistorico: comHistorico.length,
      semHistorico: semHistorico,
      unicosPosDesduplicacao: unicosPorTelefone.size
  });
});