// Porta única de entrada para as operações determinísticas da Glória.
// Toda escrita de agenda passa por aqui; nada é decidido por IA.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  autorizarInternoOuAdmin, erroSeguro,
  getAvailableSlotsCore, proximosHorariosCore,
  createAppointmentCore, cancelAppointmentCore, rescheduleAppointmentCore, confirmAppointmentCore,
  precoConsultaCore, orcamentoCore, listarMedicosAtivos,
  garantirContato, buscarPacientesPorTelefone, buscarPacientePorCpf, criarPacienteSeguro
} from '../../shared/gloriaCore.ts';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { acao, token_interno } = body || {};

    const autorizacao = await autorizarInternoOuAdmin(
      base44,
      token_interno,
      Deno.env.get('GLORIA_INTERNAL_TOKEN')
    );
    if (!autorizacao.ok) return Response.json(autorizacao, { status: 403 });

    const sr = base44.asServiceRole;
    let resultado;

    switch (acao) {
      case 'medicos': {
        const medicos = await listarMedicosAtivos(sr);
        resultado = {
          ok: true,
          medicos: medicos.map((m) => ({
            id: m.id,
            nome: m.nome,
            especialidade: m.especialidade,
            especialidades: m.especialidades || [],
            agenda_compartilhada_id: m.agenda_compartilhada_id || null,
            tipo_atendimento: m.tipo_atendimento || 'Horários Marcados'
          }))
        };
        break;
      }
      case 'slots':
        resultado = await getAvailableSlotsCore(sr, body);
        break;
      case 'proximos_horarios':
        resultado = await proximosHorariosCore(sr, body);
        break;
      case 'agendar':
        resultado = await createAppointmentCore(sr, body);
        break;
      case 'cancelar':
        resultado = await cancelAppointmentCore(sr, body);
        break;
      case 'remarcar':
        resultado = await rescheduleAppointmentCore(sr, body);
        break;
      case 'confirmar':
        resultado = await confirmAppointmentCore(sr, body);
        break;
      case 'preco_consulta':
        resultado = await precoConsultaCore(sr, body);
        break;
      case 'orcamento':
        resultado = await orcamentoCore(sr, body);
        break;
      case 'garantir_contato':
        resultado = await garantirContato(sr, body.telefone, body.nome);
        break;
      case 'pacientes_por_telefone': {
        const pacientes = await buscarPacientesPorTelefone(sr, body.telefone);
        resultado = { ok: true, pacientes: pacientes.map((p) => ({ id: p.id, nome: p.nome })) };
        break;
      }
      case 'paciente_por_cpf': {
        const paciente = await buscarPacientePorCpf(sr, body.cpf);
        resultado = { ok: true, paciente: paciente ? { id: paciente.id, nome: paciente.nome } : null };
        break;
      }
      case 'criar_paciente':
        resultado = await criarPacienteSeguro(sr, body);
        break;
      default:
        resultado = erroSeguro('ACAO_INVALIDA', 'Ação não reconhecida.');
    }

    return Response.json(resultado, { status: resultado.ok ? 200 : 400 });
  } catch (erro) {
    console.error('gloriaOperacoes: erro inesperado', erro && erro.message);
    return Response.json({ ok: false, codigo: 'ERRO_INTERNO', mensagem: 'Erro interno.' }, { status: 500 });
  }
}