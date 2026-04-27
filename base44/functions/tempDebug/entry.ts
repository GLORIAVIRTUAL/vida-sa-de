import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // IDs dos contatos
    const idPrincipal = "69833f3f277c3972304d527b"; // Sandra Tassinari WhatsApp real
    const idDuplicado = "6985eb19eea13eb2fc051462"; // Sandra Tassinari com número estranho

    // Pegar dados
    const principal = await base44.asServiceRole.entities.Contato.get(idPrincipal);
    const duplicado = await base44.asServiceRole.entities.Contato.get(idDuplicado);

    if (principal && duplicado) {
      // Unir histórico
      let historicoUnificado = [...(principal.historico_mensagens || [])];
      const histDup = duplicado.historico_mensagens || [];
      
      for (const msg of histDup) {
          const jaExiste = historicoUnificado.some(m => 
              m.timestamp === msg.timestamp && m.content === msg.content
          );
          if (!jaExiste) historicoUnificado.push(msg);
      }
      
      historicoUnificado.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

      // Atualizar principal
      await base44.asServiceRole.entities.Contato.update(principal.id, {
          historico_mensagens: historicoUnificado.slice(-200)
      });

      // Deletar duplicado
      await base44.asServiceRole.entities.Contato.delete(duplicado.id);
      
      return Response.json({ message: "Contatos unificados com sucesso!" });
    }

    return Response.json({ message: "Um dos contatos não foi encontrado." });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});