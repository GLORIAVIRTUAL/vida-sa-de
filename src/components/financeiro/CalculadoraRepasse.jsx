
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar as CalendarIcon, Calculator, Users, Building, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Lancamento } from "@/entities/all";
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function CalculadoraRepasse({ onUpdate, medicos, ordensServico, procedimentos, exames, categoriasPreco }) {
  const [dataRange, setDataRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [medicoId, setMedicoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  const calcularRepasse = async () => {
    if (!medicoId) {
      alert("Por favor, selecione um médico.");
      return;
    }
    setLoading(true);
    setResultado(null);

    const medicoSelecionado = medicos.find(m => m.id === medicoId);
    if (!medicoSelecionado) {
      setLoading(false);
      return;
    }

    const osNoPeriodo = ordensServico.filter(os => {
      const dataOS = new Date(os.data_execucao + 'T00:00:00');
      return dataOS >= dataRange.from && dataOS <= dataRange.to && os.status_pagamento === 'Pago';
    });

    const repassesMedico = [];
    const repassesLaboratorio = [];

    osNoPeriodo.forEach(os => {
      const isConvenio = os.forma_pagamento === 'Convênio';
      
      if (os.tipo_servico === 'Consulta' && os.medico_id === medicoId) {
        const percentual = isConvenio 
          ? medicoSelecionado.percentual_repasse_convenio 
          : medicoSelecionado.percentual_repasse;
        
        if (percentual > 0) {
          repassesMedico.push({
            os,
            tipo: 'Consulta',
            valorBase: os.valor_final,
            percentual,
            valorRepasse: os.valor_final * (percentual / 100)
          });
        }
      }

      if (os.tipo_servico === 'Procedimento' && os.medico_id === medicoId) {
        const proc = procedimentos.find(p => p.id === os.procedimento_id);
        const percentual = proc?.percentual_repasse_medico;

        if (percentual > 0) {
          repassesMedico.push({
            os,
            tipo: 'Procedimento',
            nome: proc?.nome,
            valorBase: os.valor_final,
            percentual,
            valorRepasse: os.valor_final * (percentual / 100)
          });
        }
      }

      if (os.tipo_servico === 'Exame' && Array.isArray(os.exames_ids)) {
        os.exames_ids.forEach(exameId => {
          const exame = exames.find(e => e.id === exameId);
          if (exame && exame.percentual_repasse_laboratorio > 0) {
            repassesLaboratorio.push({
              os,
              tipo: 'Exame',
              nome: exame.nome,
              valorBase: exame.valor_particular, // A base de cálculo pode variar
              percentual: exame.percentual_repasse_laboratorio,
              valorRepasse: exame.valor_particular * (exame.percentual_repasse_laboratorio / 100)
            });
          }
        });
      }
    });

    const totalMedico = repassesMedico.reduce((sum, item) => sum + item.valorRepasse, 0);
    const totalLaboratorio = repassesLaboratorio.reduce((sum, item) => sum + item.valorRepasse, 0);
    
    setResultado({
      medicoSelecionado,
      repassesMedico,
      totalMedico,
      repassesLaboratorio,
      totalLaboratorio
    });
    setLoading(false);
  };
  
  const gerarDetalhesObservacao = (repasses) => {
    let detalhamento = "Detalhamento dos Atendimentos:\n\n";
    repasses.forEach(repasse => {
      // Find the corresponding OS to get the patient_id, then resolve patient name if available.
      // For now, assuming patient_id is present or can be mapped to a name.
      // In a real application, you'd fetch patient details based on os.paciente_id.
      // Assuming for now that os.paciente_id directly holds the patient's name, or that 
      // there's a global `pacientes` array to look up. Since we don't have `pacientes` prop,
      // we'll keep the N/A placeholder or assume `paciente_id` itself is descriptive enough.
      const osReferenced = ordensServico.find(osItem => osItem.id === repasse.os.id);
      const pacienteNome = osReferenced?.paciente_id || 'N/A'; // Placeholder; ideally map to patient's actual name

      const isConvenio = repasse.os.forma_pagamento === 'Convênio';
      detalhamento += `Paciente: ${pacienteNome}\n`;
      detalhamento += `- Data: ${format(new Date(repasse.os.data_execucao + 'T00:00:00'), 'dd/MM/yyyy')}\n`;
      detalhamento += `- Serviço: ${repasse.tipo} ${repasse.nome ? `(${repasse.nome})` : ''} - ${isConvenio ? 'Convênio' : 'Particular'}\n`;
      detalhamento += `- Valor Bruto: R$ ${repasse.valorBase.toFixed(2)}\n`;
      detalhamento += `- Percentual: ${repasse.percentual}%\n`;
      detalhamento += `= Repasse Líquido: R$ ${repasse.valorRepasse.toFixed(2)}\n\n`;
    });
    return detalhamento;
  };

  const lancarRepasse = async (tipo) => {
    if (!resultado) return;
    
    const { medicoSelecionado, repassesMedico, totalMedico, repassesLaboratorio, totalLaboratorio } = resultado;
    
    let lancamentoData;
    if (tipo === 'medico' && totalMedico > 0) {
      lancamentoData = {
        tipo: "Saída",
        categoria: "Repasse Médico",
        descricao: `Repasse (${repassesMedico.some(r => r.os.forma_pagamento !== 'Convênio') ? 'Particular' : 'Convênios'}) para ${medicoSelecionado.nome}`,
        valor: totalMedico,
        data_lancamento: format(new Date(), "yyyy-MM-dd"),
        status: "Pendente",
        observacoes: gerarDetalhesObservacao(repassesMedico),
        medico_id: medicoSelecionado.id,
      };
    } else if (tipo === 'laboratorio' && totalLaboratorio > 0) {
      // Lógica para laboratório, se necessário (assumindo um nome genérico)
      lancamentoData = {
        tipo: "Saída",
        categoria: "Repasse Laboratório",
        descricao: `Repasse para Laboratório Parceiro`,
        valor: totalLaboratorio,
        data_lancamento: format(new Date(), "yyyy-MM-dd"),
        status: "Pendente",
        observacoes: gerarDetalhesObservacao(repassesLaboratorio),
      };
    }

    if (lancamentoData) {
      try {
        await Lancamento.create(lancamentoData);
        alert(`Lançamento de repasse (${tipo}) no valor de R$ ${lancamentoData.valor.toFixed(2)} gerado com sucesso!`);
        if(onUpdate) onUpdate();
      } catch (error) {
        console.error("Erro ao lançar repasse:", error);
        alert("Erro ao gerar o lançamento de repasse.");
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-blue-600"/>
          Calculadora de Repasses
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Período</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dataRange?.from ? (
                    dataRange.to ? (
                      <>
                        {format(dataRange.from, "LLL dd, y", { locale: ptBR })} -{" "}
                        {format(dataRange.to, "LLL dd, y", { locale: ptBR })}
                      </>
                    ) : (
                      format(dataRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Selecione um período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dataRange?.from}
                  selected={dataRange}
                  onSelect={setDataRange}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Médico</label>
            <Select value={medicoId} onValueChange={setMedicoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um médico" />
              </SelectTrigger>
              <SelectContent>
                {medicos.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="self-end">
            <Button onClick={calcularRepasse} disabled={loading || !medicoId}>
              {loading ? "Calculando..." : "Calcular"}
            </Button>
          </div>
        </div>

        {resultado && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
            <h3 className="font-bold mb-4">Resultado do Cálculo para {resultado.medicoSelecionado.nome}</h3>
            
            {resultado.totalMedico > 0 && (
              <Card className="mb-4">
                <CardHeader className="bg-blue-50">
                  <CardTitle className="text-base flex justify-between items-center">
                    <span className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-700"/> Repasse do Médico</span>
                    <span className="text-blue-800 font-bold text-lg">R$ {resultado.totalMedico.toFixed(2)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <Button onClick={() => lancarRepasse('medico')} size="sm">Lançar Repasse do Médico</Button>
                </CardContent>
              </Card>
            )}

            {resultado.totalLaboratorio > 0 && (
              <Card>
                <CardHeader className="bg-orange-50">
                  <CardTitle className="text-base flex justify-between items-center">
                    <span className="flex items-center gap-2"><Building className="w-5 h-5 text-orange-700"/> Repasse de Laboratório</span>
                    <span className="text-orange-800 font-bold text-lg">R$ {resultado.totalLaboratorio.toFixed(2)}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <Button onClick={() => lancarRepasse('laboratorio')} size="sm" className="bg-orange-600 hover:bg-orange-700">Lançar Repasse do Laboratório</Button>
                </CardContent>
              </Card>
            )}

            {(resultado.totalMedico === 0 && resultado.totalLaboratorio === 0) && (
                 <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Nenhum repasse encontrado para este médico no período selecionado.
                    </AlertDescription>
                </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
