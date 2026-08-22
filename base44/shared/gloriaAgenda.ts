// Unificação de agenda: um médico com vários registros (uma por especialidade)
// compartilha disponibilidade via agenda_compartilhada_id. Nunca por nome.
import { ok, erroSeguro, normalizarTexto, listarMedicosAtivos, idsDaAgenda } from './gloriaCore.ts';

function especialidadesDoMedico(m) {
  const lista = Array.isArray(m.especialidades) ? m.especialidades.slice() : [];
  if (m.especialidade) lista.push(m.especialidade);
  const vistos = new Map();
  for (const e of lista) {
    const chave = normalizarTexto(e);
    if (chave && !vistos.has(chave)) vistos.set(chave, String(e).trim());
  }
  return Array.from(vistos.values());
}

// Especialidades atendidas por médicos ativos, em ordem alfabética.
export async function especialidadesDisponiveisCore(sr) {
  const medicos = await listarMedicosAtivos(sr);
  const vistos = new Map();
  for (const m of medicos) {
    for (const e of especialidadesDoMedico(m)) {
      const chave = normalizarTexto(e);
      if (!vistos.has(chave)) vistos.set(chave, e);
    }
  }
  const especialidades = Array.from(vistos.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return ok({ especialidades });
}

// Médicos que atendem a especialidade. Registros da mesma agenda compartilhada
// aparecem uma única vez, já apontando o registro correto da especialidade.
export async function medicosPorEspecialidadeCore(sr, { especialidade }) {
  const alvo = normalizarTexto(especialidade);
  if (!alvo) return erroSeguro('ESPECIALIDADE_OBRIGATORIA', 'Informe a especialidade.');
  const medicos = await listarMedicosAtivos(sr);
  const compativeis = medicos.filter((m) => especialidadesDoMedico(m).some((e) => normalizarTexto(e) === alvo));
  const porAgenda = new Map();
  for (const m of compativeis) {
    const chave = m.agenda_compartilhada_id || 'medico:' + m.id;
    if (!porAgenda.has(chave)) {
      porAgenda.set(chave, {
        id: m.id,
        nome: m.nome,
        especialidade: especialidade,
        agenda_compartilhada_id: m.agenda_compartilhada_id || null,
        tipo_atendimento: m.tipo_atendimento || 'Horários Marcados'
      });
    }
  }
  const lista = Array.from(porAgenda.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return ok({ medicos: lista });
}

// Especialidades ofertadas dentro de uma agenda unificada (sub-filtro).
export async function especialidadesDaAgendaCore(sr, { medico_id }) {
  if (!medico_id) return erroSeguro('MEDICO_OBRIGATORIO', 'medico_id é obrigatório.');
  const medico = await sr.entities.Medico.get(String(medico_id).replace(/[{}]/g, ''));
  if (!medico) return erroSeguro('MEDICO_NAO_ENCONTRADO', 'Médico não encontrado.');
  const ids = await idsDaAgenda(sr, medico);
  const vistos = new Map();
  for (const id of ids) {
    const reg = id === medico.id ? medico : await sr.entities.Medico.get(id);
    if (!reg || reg.status !== 'Ativo') continue;
    for (const e of especialidadesDoMedico(reg)) {
      const chave = normalizarTexto(e);
      if (!vistos.has(chave)) vistos.set(chave, { especialidade: e, medico_id: reg.id });
    }
  }
  const opcoes = Array.from(vistos.values()).sort((a, b) => a.especialidade.localeCompare(b.especialidade, 'pt-BR'));
  return ok({ nome: medico.nome, agenda_compartilhada_id: medico.agenda_compartilhada_id || null, opcoes });
}