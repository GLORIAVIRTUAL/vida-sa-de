// Busca na Z-API a foto de perfil dos contatos que ainda não têm foto salva.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.0';
import { buscarFotoPerfil } from '../../shared/gloriaZapi.ts';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me().catch(() => null);
  if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const limite = Math.min(Number(body.limite) || 60, 200);

  const sr = base44.asServiceRole;
  const contatos = await sr.entities.Contato.list('-ultima_interacao', 400);
  const pendentes = contatos.filter((c) => !c.foto_url && c.telefone).slice(0, limite);

  let atualizados = 0;
  for (const contato of pendentes) {
    const foto = await buscarFotoPerfil(contato.telefone_normalizado || contato.telefone);
    if (foto) {
      await sr.entities.Contato.update(contato.id, { foto_url: foto });
      atualizados++;
    }
  }

  return Response.json({ verificados: pendentes.length, atualizados });
});