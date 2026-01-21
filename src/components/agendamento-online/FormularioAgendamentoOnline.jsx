import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Calendar, Clock, User, Phone, Mail } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, // Keeping Select import as it might be used elsewhere or could be repurposed, but not for date/time anymore
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from 'date-fns/locale'; // Import ptBR locale for date formatting

export default function FormularioAgendamentoOnline({ onSucesso }) {
  const [apiKey, setApiKey] = useState(null);
  const [medicos, setMedicos] = useState([]);
  const [medicoSelecionado, setMedicoSelecionado] = useState(null);
  const [especialidadesMedico, setEspecialidadesMedico] = useState([]);
  const [especialidadeSelecionada, setEspecialidadeSelecionada] = useState(null);
  const [datasDisponiveis, setDatasDisponiveis] = useState([]);
  const [dataSelecionada, setDataSelecionada] = useState('');
  const [horariosDisponiveis, setHorariosDisponiveis] = useState([]);
  const [horarioSelecionado, setHorarioSelecionado] = useState('');

  const [nomePaciente, setNomePaciente] = useState('');
  const [cpfPaciente, setCpfPaciente] = useState('');
  const [telefonePaciente, setTelefonePaciente] = useState('');
  const [emailPaciente, setEmailPaciente] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');

  const [loadingMedicos, setLoadingMedicos] = useState(true);
  const [loadingDatas, setLoadingDatas] = useState(false);
  const [loadingHorarios, setLoadingHorarios] = useState(false); 
  const [enviando, setEnviando] = useState(false);

  const [etapa, setEtapa] = useState(1); // 1: Medico, 2: Data/Hora, 3: Dados Pessoais
  const [erro, setErro] = useState('');

  const carregarMedicos = useCallback(async () => {
    // Verificar cache local primeiro
    const cacheKey = 'medicos_cache';
    const cacheTimeKey = 'medicos_cache_time';
    const cached = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);
    
    // Cache válido por 5 minutos
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 5 * 60 * 1000) {
      console.log('📦 Usando médicos do cache local');
      setMedicos(JSON.parse(cached));
      setLoadingMedicos(false);
      return;
    }

    setLoadingMedicos(true);
    setErro('');
    try {
      console.log('🔍 Tentando carregar médicos (função pública)...');
      
      const response = await fetch('/functions/listMedicos', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (response.status === 429) {
        // Rate limit - tentar usar cache mesmo expirado
        if (cached) {
          console.log('⚠️ Rate limit - usando cache expirado');
          setMedicos(JSON.parse(cached));
          setErro('');
          return;
        }
        throw new Error('Muitas requisições. Por favor, aguarde alguns segundos e tente novamente.');
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Resposta de erro:', errorText);
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Médicos carregados:', data.length);
      
      // Salvar no cache
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(cacheTimeKey, Date.now().toString());
      
      setMedicos(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("❌ Erro ao carregar médicos:", err);
      // Tentar usar cache em caso de erro
      if (cached) {
        console.log('⚠️ Erro na API - usando cache como fallback');
        setMedicos(JSON.parse(cached));
        setErro('');
      } else {
        setErro(`Erro ao Carregar: ${err.message}`);
      }
    } finally {
      setLoadingMedicos(false);
    }
  }, []); 

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('apiKey');
    if (key) {
      setApiKey(key);
    } else {
      console.warn('Chave de API não encontrada. A visualização é permitida, mas o agendamento final irá falhar.');
    }
    carregarMedicos();
  }, [carregarMedicos]); 

  const handleSelectMedico = (medicoId) => {
    console.log('🏥 Médico selecionado:', medicoId);
    const medico = medicos.find(m => m.id === medicoId);
    
    // Verificar se há múltiplas especialidades para o mesmo médico (mesmo CRM ou nome similar)
    const especialidadesDoMedico = medicos.filter(m => 
      m.crm === medico.crm || 
      m.nome.toLowerCase().trim() === medico.nome.toLowerCase().trim()
    );
    
    if (especialidadesDoMedico.length > 1) {
      // Médico com múltiplas especialidades - mostrar seleção
      setEspecialidadesMedico(especialidadesDoMedico);
      setMedicoSelecionado(medico);
      setEspecialidadeSelecionada(null);
    } else {
      // Médico com apenas uma especialidade - selecionar direto
      setEspecialidadesMedico([]);
      setMedicoSelecionado(medico);
      setEspecialidadeSelecionada(medico);
    }
    
    setDataSelecionada('');
    setHorarioSelecionado('');
    setDatasDisponiveis([]);
    setHorariosDisponiveis([]);
    setErro('');
  };
  
  const handleSelectEspecialidade = (especialidade) => {
    console.log('🎯 Especialidade selecionada:', especialidade.especialidade);
    setEspecialidadeSelecionada(especialidade);
  };

  const buscarDisponibilidade = useCallback(async () => {
    if (!especialidadeSelecionada) return;
    
    // Verificar cache de disponibilidade
    const cacheKey = `disponibilidade_${especialidadeSelecionada.id}`;
    const cacheTimeKey = `disponibilidade_time_${especialidadeSelecionada.id}`;
    const cached = localStorage.getItem(cacheKey);
    const cachedTime = localStorage.getItem(cacheTimeKey);
    
    // Cache válido por 2 minutos para disponibilidade
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < 2 * 60 * 1000) {
      console.log('📦 Usando disponibilidade do cache');
      const data = JSON.parse(cached);
      setDatasDisponiveis(data.disponibilidades || []);
      setEtapa(2);
      return;
    }
    
    setLoadingDatas(true);
    setErro('');
    console.log('📅 Buscando disponibilidade para médico:', especialidadeSelecionada.nome, '- Especialidade:', especialidadeSelecionada.especialidade);
    
    try {
      const response = await fetch(`/functions/getavailableslotsrange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          medico_id: especialidadeSelecionada.id,
          dias_afrente: 30
        })
      });

      if (response.status === 429) {
        if (cached) {
          console.log('⚠️ Rate limit - usando cache de disponibilidade');
          const data = JSON.parse(cached);
          setDatasDisponiveis(data.disponibilidades || []);
          setEtapa(2);
          return;
        }
        throw new Error('Muitas requisições. Por favor, aguarde alguns segundos.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Disponibilidade carregada:', data);
      
      // Salvar no cache
      localStorage.setItem(cacheKey, JSON.stringify(data));
      localStorage.setItem(cacheTimeKey, Date.now().toString());
      
      setDatasDisponiveis(data.disponibilidades || []);
      setEtapa(2); 
    } catch (err) {
      console.error("❌ Erro ao buscar datas:", err);
      if (cached) {
        console.log('⚠️ Erro - usando cache como fallback');
        const data = JSON.parse(cached);
        setDatasDisponiveis(data.disponibilidades || []);
        setEtapa(2);
      } else {
        setErro(err.message || "Não foi possível buscar as datas disponíveis para este profissional.");
      }
    } finally {
      setLoadingDatas(false);
    }
  }, [especialidadeSelecionada]); 

  useEffect(() => {
    if (especialidadeSelecionada) {
      buscarDisponibilidade();
    }
  }, [especialidadeSelecionada, buscarDisponibilidade]);
  
  const handleSelectData = (data) => {
    console.log('📅 Data selecionada:', data);
    setDataSelecionada(data);
    setHorarioSelecionado('');
    
    const dataObj = datasDisponiveis.find(d => d.data === data);
    setHorariosDisponiveis(dataObj ? dataObj.horarios_disponiveis : []);
  };
  
  const handleAgendar = async (e) => {
    e.preventDefault();
    
    if (!apiKey) {
      setErro('Chave de API não configurada. Não é possível finalizar o agendamento.');
      return;
    }

    if (!nomePaciente || !cpfPaciente || !telefonePaciente || !dataSelecionada || !horarioSelecionado) {
      setErro('Todos os campos obrigatórios devem ser preenchidos.');
      return;
    }

    setEnviando(true);
    setErro('');

    try {
      const response = await fetch('/functions/createappointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          medico_id: especialidadeSelecionada.id,
          data_agendamento: dataSelecionada,
          horario: horarioSelecionado,
          paciente_novo: {
            nomepaciente: nomePaciente,
            cpfpaciente: cpfPaciente,
            telefonepaciente: telefonePaciente,
            emailpaciente: emailPaciente,
            data_nascimento: dataNascimento
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao criar agendamento');
      }

      const agendamento = await response.json();
      
      onSucesso({
        agendamento,
        medico: medicoSelecionado,
        paciente: {
          nome: nomePaciente,
          telefone: telefonePaciente,
          email: emailPaciente
        }
      });

    } catch (err) {
      console.error("❌ Erro ao agendar:", err);
      setErro(err.message || "Não foi possível finalizar o agendamento. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto shadow-lg">
      <CardContent className="p-6">
        {erro && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Ocorreu um Erro</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {/* Etapa 1: Selecionar Médico */}
        {etapa === 1 && (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-center">1. Escolha o Profissional</h3>
            {loadingMedicos ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {medicos.map((medico) => (
                  <Card 
                    key={medico.id} 
                    className="flex flex-col text-center p-4 transition-all hover:shadow-xl hover:border-blue-300 cursor-pointer group"
                  >
                    <div className="flex flex-col items-center space-y-3">
                      {medico.foto_url ? (
                        <img 
                          src={medico.foto_url} 
                          alt={medico.nome}
                          className="w-20 h-20 rounded-full object-cover border-4 border-gray-200 group-hover:border-blue-300 transition-colors"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                          {medico.nome.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-semibold text-lg text-gray-900">Dr(a). {medico.nome}</h4>
                        <p className="text-blue-600 font-medium">{medico.especialidade}</p>
                        {medico.valor_consulta > 0 && (
                          <p className="text-green-600 font-semibold mt-1">
                            R$ {medico.valor_consulta.toFixed(2).replace('.', ',')}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button
                      className="mt-4 bg-blue-600 hover:bg-blue-700 text-white group-hover:bg-blue-700"
                      onClick={() => handleSelectMedico(medico.id)}
                      disabled={loadingDatas && medicoSelecionado?.id === medico.id}
                    >
                      {loadingDatas && medicoSelecionado?.id === medico.id ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          <Calendar className="w-4 h-4 mr-2" />
                          Ver Horários
                        </>
                      )}
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Divisor */}
        {etapa >= 2 && <hr className="my-6" />}

        {/* Etapa 2: Selecionar Data e Horário */}
        {etapa === 2 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">2. Escolha Data e Horário</h3>
              <Button 
                variant="outline" 
                onClick={() => setEtapa(1)}
                className="text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                ← Voltar aos Profissionais
              </Button>
            </div>
            
            {medicoSelecionado && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  {medicoSelecionado.foto_url ? (
                    <img 
                      src={medicoSelecionado.foto_url} 
                      alt={medicoSelecionado.nome}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      {medicoSelecionado.nome.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h4 className="font-semibold text-gray-900">Dr(a). {medicoSelecionado.nome}</h4>
                    <p className="text-blue-600">{medicoSelecionado.especialidade}</p>
                  </div>
                </div>
              </div>
            )}

            {loadingDatas ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : datasDisponiveis.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Nenhuma data disponível</AlertTitle>
                <AlertDescription>
                  Este profissional não possui horários disponíveis no momento. Tente outro profissional ou entre em contato diretamente.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-6">
                {/* Seleção de Data com Botões */}
                <div>
                  <h4 className="font-semibold mb-3 text-gray-800">Escolha uma data:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {datasDisponiveis.map((dataDisponivel) => (
                      <Button
                        key={dataDisponivel.data}
                        variant={dataSelecionada === dataDisponivel.data ? "default" : "outline"}
                        className={`p-4 h-auto flex flex-col items-center text-center ${
                          dataSelecionada === dataDisponivel.data 
                            ? "bg-blue-600 hover:bg-blue-700 text-white" 
                            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                        }`}
                        onClick={() => handleSelectData(dataDisponivel.data)}
                      >
                        <Calendar className="w-5 h-5 mb-1" />
                        <div className="text-sm font-semibold">
                          {dataDisponivel.data ? format(new Date(dataDisponivel.data + 'T12:00:00'), 'dd/MM') : '--/--'}
                        </div>
                        <div className="text-xs opacity-80">
                          {dataDisponivel.dia_semana_nome.substring(0, 3)}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                          {dataDisponivel.total_slots} slots
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Seleção de Horário com Botões */}
                {dataSelecionada && horariosDisponiveis.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3 text-gray-800">Escolha um horário:</h4>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {horariosDisponiveis.map((horario) => (
                        <Button
                          key={horario}
                          variant={horarioSelecionado === horario ? "default" : "outline"}
                          className={`p-3 h-auto flex items-center justify-center ${
                            horarioSelecionado === horario 
                              ? "bg-green-600 hover:bg-green-700 text-white" 
                              : "border-gray-300 hover:border-green-400 hover:bg-green-50"
                          }`}
                          onClick={() => setHorarioSelecionado(horario)}
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          <span className="font-semibold">{horario}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botão para Próxima Etapa */}
                {dataSelecionada && horarioSelecionado && (
                  <div className="flex justify-center pt-6">
                    <Button
                      onClick={() => setEtapa(3)}
                      size="lg"
                      className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
                    >
                      Continuar para Dados Pessoais →
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Divisor */}
        {etapa >= 3 && <hr className="my-6" />}

        {/* Etapa 3: Dados Pessoais */}
        {etapa === 3 && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold">3. Seus Dados Pessoais</h3>
              <Button 
                variant="outline" 
                onClick={() => setEtapa(2)}
                className="text-blue-600 border-blue-300 hover:bg-blue-50"
              >
                ← Voltar para Data/Horário
              </Button>
            </div>

            {/* Resumo da Seleção */}
            <div className="mb-6 p-4 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-semibold text-green-800 mb-2">Resumo do Agendamento:</h4>
              <div className="text-sm text-green-700 space-y-1">
                <p><strong>Profissional:</strong> Dr(a). {medicoSelecionado?.nome} - {medicoSelecionado?.especialidade}</p>
                <p><strong>Data:</strong> {dataSelecionada && format(new Date(dataSelecionada + 'T12:00:00'), 'dd/MM/yyyy (EEEE)', { locale: ptBR })}</p>
                <p><strong>Horário:</strong> {horarioSelecionado}</p>
              </div>
            </div>

            <form onSubmit={handleAgendar} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="nome">Nome Completo <span className="text-red-500">*</span></Label>
                  <Input
                    id="nome"
                    type="text"
                    placeholder="Seu nome completo"
                    value={nomePaciente}
                    onChange={(e) => setNomePaciente(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="cpf">CPF <span className="text-red-500">*</span></Label>
                  <Input
                    id="cpf"
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpfPaciente}
                    onChange={(e) => setCpfPaciente(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="telefone">Telefone/WhatsApp <span className="text-red-500">*</span></Label>
                  <Input
                    id="telefone"
                    type="tel"
                    placeholder="(DD) 9XXXX-XXXX"
                    value={telefonePaciente}
                    onChange={(e) => setTelefonePaciente(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={emailPaciente}
                    onChange={(e) => setEmailPaciente(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="nascimento">Data de Nascimento</Label>
                <Input
                  id="nascimento"
                  type="date"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                />
              </div>

              <div className="flex justify-center pt-6">
                <Button
                  type="submit"
                  disabled={enviando}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-12 py-4"
                >
                  {enviando ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    <>
                      <Calendar className="w-5 h-5 mr-2" />
                      Confirmar Agendamento
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}