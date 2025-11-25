import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verificar autenticação
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      data_agendamento,
      recorrencia_data_fim,
      recorrencia_tipo,
      ...dadosBase
    } = body;

    console.log('📅 Criando série de agendamentos recorrentes:', {
      data_inicio: data_agendamento,
      data_fim: recorrencia_data_fim,
      tipo: recorrencia_tipo
    });

    // Gerar ID único para a série
    const serieId = crypto.randomUUID();

    // Calcular todas as datas da série
    const datas = [];
    let dataAtual = new Date(data_agendamento + 'T00:00:00');
    const dataFim = new Date(recorrencia_data_fim + 'T00:00:00');
    
    let contador = 0;
    const limiteSeguranca = 365; // Máximo de 365 agendamentos

    while (dataAtual <= dataFim && contador < limiteSeguranca) {
      datas.push(new Date(dataAtual));
      
      switch (recorrencia_tipo) {
        case 'Semanal':
          dataAtual.setDate(dataAtual.getDate() + 7);
          break;
        case 'Quinzenal':
          dataAtual.setDate(dataAtual.getDate() + 15);
          break;
        case 'Mensal':
          dataAtual.setMonth(dataAtual.getMonth() + 1);
          break;
        default:
          dataAtual.setDate(dataAtual.getDate() + 7);
          break;
      }
      contador++;
    }

    console.log(`✅ ${datas.length} agendamentos serão criados`);

    // Criar todos os agendamentos
    const agendamentosCriados = [];
    const erros = [];

    for (const data of datas) {
      try {
        const dataFormatada = data.toISOString().split('T')[0];
        
        const agendamento = await base44.asServiceRole.entities.Agendamento.create({
          ...dadosBase,
          data_agendamento: dataFormatada,
          is_recorrente: true,
          recorrencia_tipo: recorrencia_tipo,
          recorrencia_serie_id: serieId,
          recorrencia_data_fim: recorrencia_data_fim
        });

        agendamentosCriados.push(agendamento);
        console.log(`✅ Agendamento criado para ${dataFormatada}`);
        
      } catch (error) {
        console.error(`❌ Erro ao criar agendamento para ${data}:`, error);
        erros.push({
          data: data.toISOString().split('T')[0],
          erro: error.message
        });
      }
    }

    return Response.json({
      success: true,
      total_criados: agendamentosCriados.length,
      total_erros: erros.length,
      serie_id: serieId,
      agendamentos: agendamentosCriados,
      erros: erros.length > 0 ? erros : undefined
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});