// Busca na Z-API a foto de perfil dos contatos que ainda não têm foto salva.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.0';
import { buscarFotoPerfil } from '../../shared/gloriaZapi.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limite = Math.min(Number(body.limite) || 60, 300);

  const sr = base44.asServiceRole;
  // Contatos ainda não verificados, priorizando quem tem conversa mais recente.
  const pendentes = (await sr.entities.Contato.filter(
    { foto_verificada: { $ne: true } },
    '-ultima_interacao',
    limite
  )).filter((c) => c.telefone && !c.foto_url);

  let atualizados = 0;
  for (const contato of pendentes) {
    const foto = await buscarFotoPerfil(contato.telefone_normalizado || contato.telefone);
    await sr.entities.Contato.update(contato.id, {
      foto_verificada: true,
      ...(foto ? { foto_url: foto } : {})
    });
    if (foto) atualizados++;
  }

  const restantes = (await sr.entities.Contato.filter({ foto_verificada: { $ne: true } }, '-ultima_interacao', 1)).length;
  return Response.json({ verificados: pendentes.length, atualizados, ainda_pendentes: restantes > 0 });
});