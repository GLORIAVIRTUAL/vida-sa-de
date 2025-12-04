import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';
import { format, subDays, parseISO, isSameDay, isAfter, isBefore } from 'npm:date-fns@3.6.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Autenticação básica (pode ser chamada pelo frontend ou cron)
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Buscar agendamentos com lembrete ativo e não notificados
    // Nota: O filtro do Base44 SDK é exato para booleanos e strings
    const agendamentos = await base44.entities.Agendamento.filter({
      lembrete_equipe: true,
      lembrete_equipe_notificado: false,
      status: 'Agendado' // Apenas agendados ativos
    }, '-data_agendamento', 100); // Limite de 100 para processar por vez

    const hoje = new Date();
    const notificacoesCriadas = [];

    for (const agendamento of agendamentos) {
      if (!agendamento.data_agendamento) continue;

      const dataConsulta = parseISO(agendamento.data_agendamento);
      const diasAntes = agendamento.lembrete_dias_antes || 0;
      
      // Calcular a data que o aviso deve aparecer
      const dataAviso = subDays(dataConsulta, diasAntes);
      
      // Se HOJE é o dia do aviso OU se já passou da data do aviso (caso o sistema não tenha rodado)
      // E se a consulta ainda não aconteceu (ou é hoje)
      const deveAvisar = (isSameDay(hoje, dataAviso) || isAfter(hoje, dataAviso));
      const consultaAindaValida = (isSameDay(hoje, dataConsulta) || isBefore(hoje, dataConsulta));

      if (deveAvisar && consultaAindaValida) {
        // Buscar nomes para a mensagem
        let nomePaciente = agendamento.paciente_nome || 'Paciente';
        let detalheServico = '';
        let nomeMedico = 'N/A'; // Usado para o log de dados

        // Lógica detalhada de serviço
        if (agendamento.tipo_servico === 'Procedimento' && agendamento.procedimento_id) {
             try {
                const proc = await base44.entities.Procedimento.get(agendamento.procedimento_id);
                detalheServico = `o procedimento ${proc ? proc.nome : 'não identificado'}`;
             } catch (e) {
                detalheServico = 'o procedimento';
             }
        } else if (agendamento.tipo_servico === 'Exame') {
             if (agendamento.exames_ids && agendamento.exames_ids.length > 1) {
                 detalheServico = 'vários exames';
             } else if (agendamento.exames_ids && agendamento.exames_ids.length === 1) {
                 try {
                    const exame = await base44.entities.Exame.get(agendamento.exames_ids[0]);
                    detalheServico = `o exame ${exame ? exame.nome : 'não identificado'}`;
                 } catch (e) {
                    detalheServico = 'o exame';
                 }
             } else {
                 detalheServico = 'exame';
             }
        } else if (agendamento.tipo_servico === 'Consulta' || agendamento.tipo_servico === 'Retorno') {
             let especialidade = '';
             if (agendamento.medico_id) {
                try {
                    const medico = await base44.entities.Medico.get(agendamento.medico_id);
                    if (medico) {
                        nomeMedico = medico.nome;
                        especialidade = medico.especialidade;
                    }
                } catch (e) {
                    console.error('Erro ao buscar medico', e);
                }
             }
             detalheServico = `${agendamento.tipo_servico === 'Retorno' ? 'o retorno' : 'a consulta'} com Dr(a). ${nomeMedico} (${especialidade || 'Geral'})`;
        } else if (agendamento.tipo_servico === 'Múltiplos Serviços') {
             detalheServico = 'múltiplos serviços';
        } else {
             detalheServico = 'o atendimento';
        }

        // Formatar data para exibição amigável
        // Usando split para evitar timezone issues com toLocaleDateString no servidor
        const [ano, mes, dia] = agendamento.data_agendamento.split('-');
        const dataFormatada = `${dia}/${mes}/${ano}`;

        const mensagem = `Atenção! ${diasAntes === 0 ? 'É HOJE' : `Falta ${diasAntes} dia(s)`} para ${detalheServico} de ${nomePaciente} (${dataFormatada} às ${agendamento.horario}). Favor lembrar o paciente.`;

        // Criar Notificação
        await base44.entities.Notification.create({
          type: 'lembrete_equipe',
          message: mensagem,
          data: {
            agendamentoId: agendamento.id,
            paciente_nome: nomePaciente,
            medico_nome: nomeMedico,
            data_agendamento: agendamento.data_agendamento,
            horario: agendamento.horario
          },
          is_read: false
        });

        // Marcar agendamento como notificado
        await base44.entities.Agendamento.update(agendamento.id, {
          lembrete_equipe_notificado: true
        });

        notificacoesCriadas.push({
          id: agendamento.id,
          mensagem
        });
      }
    }

    return Response.json({ 
      success: true, 
      processed: agendamentos.length,
      notifications_created: notificacoesCriadas.length,
      details: notificacoesCriadas
    });

  } catch (error) {
    console.error("Error processing reminders:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});