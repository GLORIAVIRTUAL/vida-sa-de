// Consulta de dias/horários de atendimento de um profissional, para responder
// perguntas como "que dia o Dr. X atende?". Somente leitura, sem IA.
import { ok, erroSeguro, normalizarTexto, listarMedicosAtivos, idsDaAgenda } from './gloriaCore.ts';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TRATAMENTOS = ['dr', 'dra', 'doutor', 'doutora', 'sr', 'sra'];

// Busca profissionais ativos cujo nome contenha todos os termos informados.
export async function medicoPorNomeCore(sr, { nome }) {
  const termos = normalizarTexto(nome).split(/\s+/)
    .filter((t) => t.length >= 3 && !TRATAMENTOS.includes(t));
  if (termos.length === 0) return erroSeguro('NOME_OBRIGATORIO', 'Informe o nome do profissional.');

  const medicos = await listarMedicosAtivos(sr);
  const achados = medicos.filter((m) => {
    const n = normalizarTexto(m.nome);
    return termos.every((t) => n.includes(t));
  });

  const porAgenda = new Map();
  for (const m of achados) {
    const chave = m.agenda_compartilhada_id || 'medico:' + m.id;
    if (!porAgenda.has(chave)) porAgenda.set(chave, { id: m.id, nome: m.nome });
  }
  return ok({ medicos: Array.from(porAgenda.values()) });
}

// Dias da semana em que o profissional atende, considerando a agenda unificada.
export async function diasAtendimentoCore(sr, { medico_id }) {
  if (!medico_id) return erroSeguro('MEDICO_OBRIGATORIO', 'medico_id é obrigatório.');
  const medico = await sr.entities.Medico.get(String(medico_id).replace(/[{}]/g, ''));
  if (!medico) return erroSeguro('MEDICO_NAO_ENCONTRADO', 'Profissional não encontrado.');

  const ids = await idsDaAgenda(sr, medico);
  const porDia = new Map();
  for (const id of ids) {
    const reg = id === medico.id ? medico : await sr.entities.Medico.get(id);
    if (!reg || reg.status !== 'Ativo') continue;
    for (const h of reg.horarios_atendimento || []) {
      if (h.bloqueado === true) continue;
      if (h.recorrencia === 'Apenas uma vez') continue;
      const dia = Number(h.dia_semana);
      if (!Number.isInteger(dia) || dia < 0 || dia > 6) continue;
      if (!porDia.has(dia)) porDia.set(dia, new Map());
      const faixa = (h.horario_inicio || '') + ' às ' + (h.horario_fim || '');
      const rotulo = h.recorrencia && h.recorrencia !== 'Toda Semana'
        ? faixa + ' (' + h.recorrencia + ')'
        : faixa;
      porDia.get(dia).set(rotulo, true);
    }
  }

  const dias = Array.from(porDia.keys()).sort((a, b) => a - b).map((d) => ({
    dia: DIAS[d],
    horarios: Array.from(porDia.get(d).keys()).sort()
  }));
  return ok({ nome: medico.nome, dias });
}