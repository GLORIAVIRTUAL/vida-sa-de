import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Lista de cadastros que NÃO são médicos reais (são entidades operacionais)
const NAO_MEDICOS = [
  'CARTÃO MAIS VIDA',
  'ELETROCARDIO CLINICA',
  'Eletrocardiograma',
  'Sala',
  'Procedimento',
  'Exame',
  'Laboratório'
];

function isNaoMedico(nome) {
  if (!nome) return false;
  const nomeUpper = nome.toUpperCase();
  return NAO_MEDICOS.some(termo => nomeUpper.includes(termo.toUpperCase()));
}

function temRepasseConfigurado(medico) {
  // Verifica se há ALGUM valor de repasse configurado
  const valoresRaiz = [
    medico.valor_repasse_fixo,
    medico.valor_repasse_fixo_convenio,
    medico.valor_repasse_fixo_procedimento,
    medico.valor_repasse_fixo_procedimento_convenio,
    medico.percentual_repasse,
    medico.percentual_repasse_convenio,
    medico.percentual_repasse_procedimento,
    medico.percentual_repasse_procedimento_convenio
  ];

  const algumNaRaiz = valoresRaiz.some(v => (v || 0) > 0);

  const algumNaCategoria = (medico.repasses_por_categoria || []).some(r => 
    (r.valor || 0) > 0 || (r.valor_procedimento || 0) > 0
  );

  return algumNaRaiz || algumNaCategoria;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const todosMedicos = await base44.asServiceRole.entities.Medico.list('-updated_date', 500);
    
    const ativos = todosMedicos.filter(m => m.status === 'Ativo' || !m.status);

    const zerados = [];
    const comRepasse = [];
    const naoMedicos = [];

    for (const medico of ativos) {
      const info = {
        id: medico.id,
        nome: medico.nome,
        especialidade: medico.especialidade,
        tipo_repasse: medico.tipo_repasse,
        updated_date: medico.updated_date,
        created_date: medico.created_date,
        created_by: medico.created_by,
        repasses_categoria_count: (medico.repasses_por_categoria || []).length,
        valor_repasse_fixo: medico.valor_repasse_fixo || 0,
        valor_repasse_fixo_convenio: medico.valor_repasse_fixo_convenio || 0,
        percentual_repasse: medico.percentual_repasse || 0,
        percentual_repasse_convenio: medico.percentual_repasse_convenio || 0
      };

      if (isNaoMedico(medico.nome)) {
        naoMedicos.push(info);
      } else if (!temRepasseConfigurado(medico)) {
        zerados.push(info);
      } else {
        comRepasse.push(info);
      }
    }

    return Response.json({
      total_medicos_ativos: ativos.length,
      zerados_count: zerados.length,
      com_repasse_count: comRepasse.length,
      nao_medicos_count: naoMedicos.length,
      medicos_zerados: zerados,
      nao_medicos: naoMedicos
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});