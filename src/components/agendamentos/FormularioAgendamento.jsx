import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Search, Clock, X, Plus, User, Stethoscope, Save, FileScan, Printer, Repeat, AlertCircle, Trash2, Layers } from "lucide-react";
import { Agendamento, Paciente, Notification } from "@/entities/all";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";
import { UploadFile, ExtractDataFromUploadedFile } from "@/integrations/Core";
import { base44 } from "@/api/base44Client";
import { safeApiCall } from "@/components/shared/apiThrottle";

const normalizeString = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// Função para comprimir imagens
const compressImage = (file, maxWidth = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(resolve, file.type, quality);
    };
    
    img.src = URL.createObjectURL(file);
  });
};

// Função para fazer upload com retry
const uploadWithRetry = async (file, maxRetries = 3, delay = 2000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Tentativa ${attempt}/${maxRetries} de upload...`);
      const result = await UploadFile({ file });
      console.log(`✅ Upload bem-sucedido na tentativa ${attempt}`);
      return result;
    } catch (error) {
      console.error(`❌ Tentativa ${attempt} falhou:`, error);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Aguardar antes da próxima tentativa
      console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa.`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Aumentar o delay para a próxima tentativa
      delay *= 1.5;
    }
  }
};

export default function FormularioAgendamento({ agendamento, todosAgendamentos, medicos, pacientes: pacientesProps, procedimentos, exames, categorias, tabelaPrecos, onSave, onClose }) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    id: null,
    paciente_id: '',
    medico_id: '',
    data_agendamento: format(new Date(), 'yyyy-MM-dd'), 
    horario: '',
    tipo_servico: 'Consulta',
    itens_servico: [], // NOVO: Lista de serviços múltiplos
    is_encaixe: false,
    is_recorrente: false,
    recorrencia_tipo: '',
    recorrencia_data_fim: '',
    procedimento_id: '',
    exames_ids: [],
    categoria_preco_id: '',
    valor_total: '0',
    forma_pagamento: 'Dinheiro',
    status: 'Agendado',
    observacoes: '',
    lembrete_equipe: false,
    lembrete_dias_antes: 1
  });

  // NOVO: Estado para controlar modo de múltiplos serviços
  const [modoMultiplosServicos, setModoMultiplosServicos] = useState(false);
  const [salvando, setSalvando] = useState(false); // Renamed from 'loading'
  const [horariosDisponiveis, setHorariosDisponiveis] = useState([]);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  
  // NOVO: Estados para verificar disponibilidade do horário selecionado
  const [horarioDisponivel, setHorarioDisponivel] = useState(true);
  const [mensagemDisponibilidade, setMensagemDisponibilidade] = useState('');

  // NOVO: Estados simplificados para busca de pacientes
  const [pacientesEncontrados, setPacientesEncontrados] = useState([]);
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [buscandoPaciente, setBuscandoPaciente] = useState(false);

  // Estados para análise de exames com IA melhorados
  const [pedidoExameFile, setPedidoExameFile] = useState(null);
  const [analisando, setAnalisando] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(''); // Para mostrar status detalhado

  // Estado para controlar altura da lista de exames
  const [alturaListaExames, setAlturaListaExames] = useState(200); // altura inicial em pixels
  const [redimensionandoExames, setRedimensionandoExames] = useState(false);

  // NOVO: Estado para busca de procedimentos
  const [buscaProcedimento, setBuscaProcedimento] = useState('');

  // NOVO: Estados para múltiplas formas de pagamento
  const [pagamento1, setPagamento1] = useState({ forma: '', valor: '' });
  const [pagamento2, setPagamento2] = useState({ forma: '', valor: '' });

  // NOVO: Estado para cadastro rápido de paciente
  const [cadastroRapidoAberto, setCadastroRapidoAberto] = useState(false);
  const [novoPacienteRapido, setNovoPacienteRapido] = useState({
    nome: '',
    telefone: '',
    convenio: 'Particular'
  });
  const [salvandoPacienteRapido, setSalvandoPacienteRapido] = useState(false);

  // Estados para seleção de serviços adicionais em múltiplos serviços
  const [servicoParaAdicionar, setServicoParaAdicionar] = useState({ tipo: '', id: '', medicoId: '' });
  
  // NOVO: Estado para horários disponíveis do médico selecionado em múltiplos serviços
  const [horariosMultiplosServicos, setHorariosMultiplosServicos] = useState([]);
  const [loadingHorariosMultiplos, setLoadingHorariosMultiplos] = useState(false);

  // Função para buscar preço da consulta baseado no médico e categoria
  const buscarPrecoConsulta = useCallback((medicoId, categoriaId) => {
    if (!medicoId || !categoriaId) return 0;

    const medico = medicos.find(m => m.id === medicoId);
    if (!medico) return 0;

    console.log(`🔍 Buscando preço para: ${medico.especialidade} - Categoria ID: ${categoriaId}`);

    // Normalizar especialidade (Safe)
    const especialidadeNorm = normalizeString(medico.especialidade);

    // Buscar procedimento de consulta da especialidade
    const procedimentoConsulta = procedimentos.find(p => {
      const nomeNorm = normalizeString(p.nome);
      
      const temConsulta = nomeNorm.includes('CONSULTA');
      const temEspecialidade = nomeNorm.includes(especialidadeNorm);
      
      // Check for direct match on specialty if the procedure has a specialty field
      const especialidadeMatch = p.especialidade && normalizeString(p.especialidade) === especialidadeNorm;
      
      return temConsulta && (temEspecialidade || especialidadeMatch);
    });

    if (!procedimentoConsulta) {
      console.warn(`⚠️ Procedimento de consulta não encontrado para ${medico.especialidade}`);
      return 0;
    }

    console.log(`✅ Procedimento encontrado: ${procedimentoConsulta.nome} (ID: ${procedimentoConsulta.id})`);

    // Buscar preço na tabela de preços
    const preco = tabelaPrecos.find(tp => 
      tp.procedimento_id === procedimentoConsulta.id && 
      tp.categoria_id === categoriaId
    );

    if (!preco) {
      console.warn(`⚠️ Preço não encontrado na tabela para categoria ${categoriaId} para o procedimento ${procedimentoConsulta.nome}.`);
      return 0;
    }

    console.log(`💰 Preço encontrado: R$ ${preco.valor.toFixed(2)}`);
    return preco.valor;
  }, [medicos, procedimentos, tabelaPrecos]);

  // Função de busca otimizada via servidor
  const buscarPacientesPorNome = async () => {
    if (!buscaPaciente || buscaPaciente.trim().length < 2) {
      toast({
        title: "Digite pelo menos 2 caracteres",
        description: "Precisamos de pelo menos 2 caracteres para buscar.",
        variant: "destructive"
      });
      return;
    }

    setBuscandoPaciente(true);
    try {
      const termo = buscaPaciente.trim();
      console.log(`🔍 [DIRECT] Buscando pacientes: "${termo}"`);

      // CHAMADA DIRETA - Removido safeApiCall para debug e performance
      const response = await base44.functions.invoke('searchPatients', { termo, limit: 500 });

      if (response?.data?.error) {
         console.error("❌ Erro Backend:", response.data.error);
         toast({ title: "Erro", description: "Falha na busca de pacientes.", variant: "destructive" });
         setPacientesEncontrados([]);
         return;
      }

      const resultados = Array.isArray(response?.data) ? response.data : [];
      console.log(`✅ ${resultados.length} encontrados`);

      setPacientesEncontrados(resultados);

      if (resultados.length > 0) {
        toast({
          title: "Pacientes encontrados!",
          description: `${resultados.length} paciente(s) encontrado(s). Selecione um abaixo.`
        });
      } else {
        toast({
          title: "Nenhum resultado",
          description: `Nenhum paciente encontrado com "${termo}".`,
          variant: "destructive"
        });
      }
      
    } catch (error) {
      console.error("Erro ao buscar pacientes:", error);
      toast({
        title: "Erro na busca",
        description: "Não foi possível buscar pacientes. Tente novamente.",
        variant: "destructive"
      });
      setPacientesEncontrados([]);
    } finally {
      setBuscandoPaciente(false);
    }
  };

  // MELHORADA: Função para criar paciente rápido
  const handleCriarPacienteRapido = async () => {
    if (!novoPacienteRapido.nome || !novoPacienteRapido.telefone) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha nome e telefone",
        variant: "destructive"
      });
      return;
    }

    setSalvandoPacienteRapido(true);
    try {
      console.log('🆕 Criando paciente rápido:', novoPacienteRapido);
      
      const novoPaciente = await Paciente.create({
        nome: novoPacienteRapido.nome,
        telefone: novoPacienteRapido.telefone,
        cpf: '', // CPF vazio por padrão
        convenio: novoPacienteRapido.convenio || 'Particular' // Use the state value
      });

      console.log('✅ Paciente criado:', novoPaciente);

      toast({
        title: "Sucesso!",
        description: `Paciente ${novoPaciente.nome} cadastrado com sucesso! Complete os dados depois na página de Pacientes.`
      });

      // Adicionar à lista e selecionar automaticamente
      setPacientesEncontrados([novoPaciente]);
      setBuscaPaciente(novoPaciente.nome);
      handleChange('paciente_id', novoPaciente.id);

      // Limpar e fechar
      setNovoPacienteRapido({ nome: '', telefone: '', convenio: 'Particular' });
      setCadastroRapidoAberto(false);

      // Forçar uma nova busca após 500ms para garantir que o paciente recém-criado esteja na lista para futuras buscas
      setTimeout(() => {
        console.log('🔄 Recarregando lista de pacientes para incluir o novo...');
        buscarPacientesPorNome();
      }, 500);


    } catch (error) {
      console.error('❌ Erro ao criar paciente:', error);
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar paciente",
        variant: "destructive"
      });
    } finally {
      setSalvandoPacienteRapido(false);
    }
  };

  // Helper para verificar semana do mês
  const getWeekOfMonth = (date) => {
    const adjustedDayOfMonth = date.getDate();
    const dayOfWeekOfFirstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    return Math.ceil((adjustedDayOfMonth + dayOfWeekOfFirstDay) / 7);
  };

  // Função para verificar se médico atende em uma data específica
  const medicoAtendeNaDataCalendario = useCallback((date, medicoSelecionado) => {
    if (!medicoSelecionado?.horarios_atendimento) return false;
    
    const dataFormatada = format(date, 'yyyy-MM-dd');
    const diaSemana = date.getDay();
    
    // 1. Verificar se há horário com data específica para esta data
    const temDataEspecifica = medicoSelecionado.horarios_atendimento.some(h => 
      h.data_especifica === dataFormatada
    );
    
    if (temDataEspecifica) return true;
    
    // 2. Verificar horários recorrentes (sem data específica)
    const horariosRecorrentes = medicoSelecionado.horarios_atendimento.filter(h => 
      h.dia_semana === diaSemana && !h.data_especifica
    );
    
    if (horariosRecorrentes.length === 0) return false;
    
    // 3. Verificar recorrência
    return horariosRecorrentes.some(h => {
      const recorrencia = h.recorrencia || 'Toda Semana';
      
      if (recorrencia === 'Toda Semana') return true;
      if (recorrencia === 'Apenas uma vez') return false;
      
      const weekOfMonth = getWeekOfMonth(date);
      
      switch (recorrencia) {
        case '1ª e 3ª Semana do Mês': return weekOfMonth === 1 || weekOfMonth === 3;
        case '2ª e 4ª Semana do Mês': return weekOfMonth === 2 || weekOfMonth === 4;
        case 'Apenas 1ª Semana do Mês': return weekOfMonth === 1;
        case 'Apenas 2ª Semana do Mês': return weekOfMonth === 2;
        case 'Apenas 3ª Semana do Mês': return weekOfMonth === 3;
        case 'Apenas 4ª Semana do Mês': return weekOfMonth === 4;
        default: return true;
      }
    });
  }, []);

  // NOVO: Filtrar procedimentos baseado na busca
  const procedimentosFiltrados = useMemo(() => {
    if (!buscaProcedimento || buscaProcedimento.trim() === '') {
      return procedimentos;
    }
    
    const termo = buscaProcedimento.toLowerCase().trim();
    return procedimentos.filter(p => 
      p.nome?.toLowerCase().includes(termo) || 
      p.codigo?.toLowerCase().includes(termo) ||
      p.especialidade?.toLowerCase().includes(termo)
    );
  }, [procedimentos, buscaProcedimento]);

  // Modificadores para o calendário
  const modifiers = useMemo(() => ({
    disponivel: (date) => {
      if (!formData.medico_id) return false;
      const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
      return medicoAtendeNaDataCalendario(date, medicoSelecionado);
    }
  }), [formData.medico_id, medicos, medicoAtendeNaDataCalendario]);

  const modifiersClassNames = {
    disponivel: "bg-green-100 text-green-900 font-bold",
  };

  // useEffect para setar os dados iniciais do agendamento ou definir padrões
  useEffect(() => {
    const initializeFormDataAndPatient = async () => {
      let initialFormData = {
        id: null,
        paciente_id: '',
        medico_id: '',
        data_agendamento: format(new Date(), 'yyyy-MM-dd'),
        horario: '',
        tipo_servico: 'Consulta',
        is_encaixe: false,
        is_recorrente: false,
        recorrencia_tipo: '',
        recorrencia_data_fim: '',
        procedimento_id: '',
        exames_ids: [],
        categoria_preco_id: '',
        valor_total: '0',
        forma_pagamento: 'Dinheiro',
        status: 'Agendado',
        observacoes: ''
      };

      if (agendamento) {
        initialFormData = {
          id: agendamento.id,
          paciente_id: agendamento.paciente_id || '',
          medico_id: agendamento.medico_id || '',
          data_agendamento: agendamento.data_agendamento ? format(new Date(agendamento.data_agendamento + 'T00:00:00'), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
          horario: agendamento.horario || '',
          tipo_servico: agendamento.tipo_servico || 'Consulta',
          itens_servico: agendamento.itens_servico || [],
          is_encaixe: agendamento.is_encaixe || false,
          is_recorrente: agendamento.is_recorrente || false,
          recorrencia_tipo: agendamento.recorrencia_tipo || '',
          recorrencia_data_fim: agendamento.recorrencia_data_fim || '',
          procedimento_id: agendamento.procedimento_id || '',
          exames_ids: agendamento.exames_ids || [],
          categoria_preco_id: agendamento.categoria_preco_id || '',
          valor_total: agendamento.valor_total?.toString() || '0',
          forma_pagamento: agendamento.forma_pagamento || 'Dinheiro',
          status: agendamento.status || 'Agendado',
          observacoes: agendamento.observacoes || '',
          lembrete_equipe: agendamento.lembrete_equipe || false,
          lembrete_dias_antes: agendamento.lembrete_dias_antes !== undefined ? agendamento.lembrete_dias_antes : 1
        };
        
        // Ativar modo múltiplos serviços se já tiver itens
        if (agendamento.itens_servico && agendamento.itens_servico.length > 0) {
          setModoMultiplosServicos(true);
        }

        if (agendamento.paciente_id) {
          try {
            const existingPatient = await Paciente.get(agendamento.paciente_id);
            if (existingPatient) {
              setPacientesEncontrados([existingPatient]);
              setBuscaPaciente(existingPatient.nome || '');
            } else {
              initialFormData.paciente_id = '';
              setPacientesEncontrados([]);
              setBuscaPaciente('');
            }
          } catch (error) {
            console.error("Erro ao buscar paciente existente:", error);
            initialFormData.paciente_id = '';
            setPacientesEncontrados([]);
            setBuscaPaciente('');
          }
        } else {
          setPacientesEncontrados([]);
          setBuscaPaciente('');
        }
      } else {
        // New appointment logic
        const categoriaParticular = Array.isArray(categorias) ? categorias.find(c => normalizeString(c.nome) === 'PARTICULAR') : null;
        initialFormData.paciente_id = '';
        initialFormData.medico_id = '';
        initialFormData.procedimento_id = '';
        initialFormData.exames_ids = [];
        initialFormData.itens_servico = [];
        initialFormData.categoria_preco_id = categoriaParticular?.id || '';
        initialFormData.valor_total = '0';
        initialFormData.observacoes = '';
        initialFormData.forma_pagamento = 'Dinheiro';
        initialFormData.status = 'Agendado';
        initialFormData.data_agendamento = format(new Date(), 'yyyy-MM-dd');
        initialFormData.is_encaixe = false;
        initialFormData.is_recorrente = false;
        initialFormData.recorrencia_tipo = '';
        initialFormData.recorrencia_data_fim = '';
        initialFormData.lembrete_equipe = false;
        initialFormData.lembrete_dias_antes = 1;
        setPacientesEncontrados([]);
        setBuscaPaciente('');
        setModoMultiplosServicos(false);
      }
      setFormData(initialFormData);
    };

    initializeFormDataAndPatient();
  }, [agendamento, categorias]);

  // NOVO: useEffect para auto-selecionar categoria baseado no convênio do paciente
  useEffect(() => {
    if (formData.paciente_id && !agendamento) { // Only for new appointments
      // Buscar o paciente selecionado
      const pacienteSelecionado = pacientesEncontrados.find(p => p.id === formData.paciente_id);
      
      if (pacienteSelecionado && pacienteSelecionado.convenio) {
        console.log('🔍 Paciente selecionado:', pacienteSelecionado.nome);
        console.log('🏥 Convênio do paciente:', pacienteSelecionado.convenio);
        
        // Buscar categoria correspondente ao convênio
        const categoriaCorrespondente = categorias.find(c => 
          normalizeString(c.nome) === normalizeString(pacienteSelecionado.convenio)
        );
        
        if (categoriaCorrespondente) {
          console.log('✅ Categoria encontrada:', categoriaCorrespondente.nome);
          handleChange('categoria_preco_id', categoriaCorrespondente.id);
          
          toast({
            title: "Categoria Selecionada",
            description: `Categoria "${categoriaCorrespondente.nome}" foi selecionada automaticamente baseado no convênio do paciente.`
          });
        } else {
          console.log('⚠️ Categoria não encontrada para o convênio:', pacienteSelecionado.convenio);
          // Se não encontrar, usar Particular como padrão
          const particular = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
          if (particular) {
            handleChange('categoria_preco_id', particular.id);
            toast({
              title: "Categoria Padrão",
              description: `Categoria "Particular" foi selecionada, pois não encontramos uma categoria correspondente ao convênio "${pacienteSelecionado.convenio}".`
            });
          }
        }
      } else if (pacienteSelecionado && !pacienteSelecionado.convenio) {
        console.log('⚠️ Paciente selecionado não possui convênio registrado. Definindo para Particular.');
        const particular = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
        if (particular) {
          handleChange('categoria_preco_id', particular.id);
        }
      }
    }
  }, [formData.paciente_id, pacientesEncontrados, categorias, agendamento, toast]);


  // Função para carregar horários disponíveis baseado no médico e data
  const carregarHorarios = useCallback(async (medicoId, data) => {
    // Para Exames e Procedimentos, gerar horários automáticos
    if (formData.tipo_servico === 'Exame' || formData.tipo_servico === 'Procedimento') {
      console.log('🔄 Gerando horários automáticos para', formData.tipo_servico);
      
      // Gerar horários das 7h às 19h, a cada 10 minutos
      const horariosAutomaticos = [];
      for (let hora = 7; hora <= 18; hora++) {
        for (let minuto = 0; minuto < 60; minuto += 10) {
          const horario = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
          horariosAutomaticos.push(horario);
        }
      }
      
      // Adicionar último horário de 19:00
      horariosAutomaticos.push('19:00');
      
      setHorariosDisponiveis(horariosAutomaticos.sort()); // Sort them
      setLoadingHorarios(false);
      return;
    }
    
    // Para Consultas e Retornos, usar a lógica existente
    if (!medicoId || !data) {
      setHorariosDisponiveis([]);
      return;
    }
    
    setLoadingHorarios(true);
    try {
      const medicoSelecionado = medicos.find(m => m.id === medicoId);
      if (!medicoSelecionado || !medicoSelecionado.horarios_atendimento) {
        setHorariosDisponiveis([]);
        setLoadingHorarios(false);
        return;
      }

      const dataObj = new Date(data + 'T00:00:00');
      const diaSemana = dataObj.getDay(); // 0=Domingo, 1=Segunda...
      
      // Verificar se há horários com data específica para este dia
      const horariosDataEspecifica = medicoSelecionado.horarios_atendimento.filter(h => h.data_especifica === data);
      
      // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
      const horariosDoMedico = horariosDataEspecifica.length > 0 
        ? horariosDataEspecifica 
        : medicoSelecionado.horarios_atendimento.filter(h => h.dia_semana === diaSemana && !h.data_especifica);
      
      if (horariosDoMedico.length === 0) {
        setHorariosDisponiveis([]);
        return;
      }

      const agendamentosExistentes = (todosAgendamentos || []).filter(a => 
        a.medico_id === medicoId && 
        a.data_agendamento === data &&
        a.status !== 'Cancelado'
      );
      
      const tipoAtendimento = medicoSelecionado.tipo_atendimento || "Horários Marcados";
      const horariosLivres = [];
      
      if (tipoAtendimento === "Horários Marcados") {
        const horariosOcupados = agendamentosExistentes.map(a => a.horario);
        
        // Se estiver editando, libera o horário atual para poder ser selecionado novamente
        if (agendamento && agendamento.medico_id === medicoId && agendamento.data_agendamento === data) {
          const index = horariosOcupados.indexOf(agendamento.horario);
          if (index > -1) {
            horariosOcupados.splice(index, 1);
          }
        }
        
        const tempoConsulta = medicoSelecionado.tempo_consulta_minutos || 30;
        for (let minutos = 0; minutos < 1440; minutos += tempoConsulta) { // 24 hours * 60 minutes
            const horas = Math.floor(minutos / 60);
            const mins = minutos % 60;
            const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            
            // Check if this slot falls within any of the doctor's defined periods
            const isInPeriod = horariosDoMedico.some(periodo => {
                const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
                const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
                const periodoInicioMinutos = inicioH * 60 + inicioM;
                const periodoFimMinutos = fimH * 60 + fimM;

                return minutos >= periodoInicioMinutos && (minutos + tempoConsulta) <= periodoFimMinutos;
            });

            if (isInPeriod && !horariosOcupados.includes(horario)) {
                horariosLivres.push(horario);
            }
        }
      } else { // Ordem de Chegada
        const limiteVagas = medicoSelecionado.limite_ordem_chegada || 1;
        const horarioInicio = horariosDoMedico[0]?.horario_inicio; 
        
        if (horarioInicio) {
          const vagasOcupadas = agendamentosExistentes.filter(a => a.horario === horarioInicio).length;
          
          let vagasAjustadas = vagasOcupadas;
          // Se estiver editando um agendamento de "Ordem de Chegada" para o mesmo médico, data e horário,
          // então essa vaga deve ser considerada "livre" para o próprio agendamento que está sendo editado.
          if (agendamento && agendamento.medico_id === medicoId && agendamento.data_agendamento === data && agendamento.horario === horarioInicio) {
            vagasAjustadas--;
          }

          if (vagasAjustadas < limiteVagas) {
            horariosLivres.push(horarioInicio);
          }
        }
      }

      setHorariosDisponiveis(horariosLivres.sort());
    } catch (error) {
      console.error("Erro ao carregar horários:", error);
      setHorariosDisponiveis([]);
    } finally {
      setLoadingHorarios(false);
    }
  }, [medicos, todosAgendamentos, agendamento, formData.tipo_servico]);

  // Função para verificar se o médico atende em uma data específica
  const medicoAtendeNaData = useCallback((data) => {
    if (!formData.medico_id) return false;
    
    const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
    if (!medicoSelecionado || !medicoSelecionado.horarios_atendimento) return false;
    
    const diaSemana = data.getDay();
    return medicoSelecionado.horarios_atendimento.some(h => h.dia_semana === diaSemana);
  }, [formData.medico_id, medicos]);

  // Atualizar horários quando mudar tipo de serviço, médico ou data
  useEffect(() => {
    if (formData.tipo_servico === 'Exame' || formData.tipo_servico === 'Procedimento') {
      // Para exames e procedimentos, carregar horários sem depender de médico
      if (formData.data_agendamento) { // Still needs a date
        carregarHorarios(null, formData.data_agendamento); // medicoId is not relevant, pass null
      } else {
        setHorariosDisponiveis([]);
      }
    } else if (formData.tipo_servico === 'Múltiplos Serviços') {
      // Para múltiplos serviços, gerar horários automáticos (7h às 19h a cada 10 min)
      if (formData.data_agendamento) {
        const horariosAutomaticos = [];
        for (let hora = 7; hora <= 18; hora++) {
          for (let minuto = 0; minuto < 60; minuto += 10) {
            const horario = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
            horariosAutomaticos.push(horario);
          }
        }
        horariosAutomaticos.push('19:00');
        setHorariosDisponiveis(horariosAutomaticos.sort());
      } else {
        setHorariosDisponiveis([]);
      }
    } else if (formData.medico_id && formData.data_agendamento) {
      // For consultations and returns, load based on the doctor
      carregarHorarios(formData.medico_id, formData.data_agendamento);
    } else {
      setHorariosDisponiveis([]);
    }
  }, [formData.medico_id, formData.data_agendamento, formData.tipo_servico, carregarHorarios]);

  // NOVO: Carregar horários do médico selecionado para consulta em múltiplos serviços
  const carregarHorariosParaMedicoMultiplo = useCallback(async (medicoId) => {
    if (!medicoId || !formData.data_agendamento) {
      setHorariosMultiplosServicos([]);
      return;
    }

    setLoadingHorariosMultiplos(true);
    try {
      const medicoSelecionado = medicos.find(m => m.id === medicoId);
      if (!medicoSelecionado || !medicoSelecionado.horarios_atendimento) {
        setHorariosMultiplosServicos([]);
        return;
      }

      const dataObj = new Date(formData.data_agendamento + 'T00:00:00');
      const diaSemana = dataObj.getDay();
      
      // Verificar se há horários com data específica para este dia
      const horariosDataEspecifica = medicoSelecionado.horarios_atendimento.filter(h => h.data_especifica === formData.data_agendamento);
      
      // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
      const horariosDoMedico = horariosDataEspecifica.length > 0 
        ? horariosDataEspecifica 
        : medicoSelecionado.horarios_atendimento.filter(h => h.dia_semana === diaSemana && !h.data_especifica);
      
      if (horariosDoMedico.length === 0) {
        setHorariosMultiplosServicos([]);
        return;
      }

      const agendamentosExistentes = (todosAgendamentos || []).filter(a => 
        a.medico_id === medicoId && 
        a.data_agendamento === formData.data_agendamento &&
        a.status !== 'Cancelado'
      );
      
      const horariosOcupados = agendamentosExistentes.map(a => a.horario);
      const tempoConsulta = medicoSelecionado.tempo_consulta_minutos || 30;
      const horariosLivres = [];

      for (let minutos = 0; minutos < 1440; minutos += tempoConsulta) {
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;
        const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
        
        const isInPeriod = horariosDoMedico.some(periodo => {
          const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
          const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
          const periodoInicioMinutos = inicioH * 60 + inicioM;
          const periodoFimMinutos = fimH * 60 + fimM;
          return minutos >= periodoInicioMinutos && (minutos + tempoConsulta) <= periodoFimMinutos;
        });

        if (isInPeriod && !horariosOcupados.includes(horario)) {
          horariosLivres.push(horario);
        }
      }

      setHorariosMultiplosServicos(horariosLivres.sort());
    } catch (error) {
      console.error("Erro ao carregar horários do médico:", error);
      setHorariosMultiplosServicos([]);
    } finally {
      setLoadingHorariosMultiplos(false);
    }
  }, [medicos, todosAgendamentos, formData.data_agendamento]);

  // Carregar horários quando selecionar médico em múltiplos serviços
  useEffect(() => {
    if (formData.tipo_servico === 'Múltiplos Serviços' && servicoParaAdicionar.tipo === 'Consulta' && servicoParaAdicionar.medicoId) {
      carregarHorariosParaMedicoMultiplo(servicoParaAdicionar.medicoId);
    } else {
      setHorariosMultiplosServicos([]);
    }
  }, [servicoParaAdicionar.medicoId, servicoParaAdicionar.tipo, formData.tipo_servico, carregarHorariosParaMedicoMultiplo]);
  
  // NOVO: Callback para verificar a disponibilidade do horário selecionado
  const checkSelectedHorarioAvailability = useCallback(async () => {
    // For Exames and Procedimentos, a selected time slot is typically always "available"
    // because they don't block doctor's specific schedules in the same way.
    if (formData.tipo_servico === 'Exame' || formData.tipo_servico === 'Procedimento') {
      if (!formData.horario) {
        setHorarioDisponivel(true); // Consider available if no specific time yet
        setMensagemDisponibilidade('');
      } else {
        setHorarioDisponivel(true);
        setMensagemDisponibilidade('Horário selecionado.');
      }
      return;
    }

    if (!formData.medico_id || !formData.data_agendamento || !formData.horario) {
      setHorarioDisponivel(true); // If essential fields not selected, consider available for selection
      setMensagemDisponibilidade('');
      return;
    }

    // If it's an encaixe, the time is logically "available" for scheduling
    if (formData.is_encaixe) {
      setHorarioDisponivel(true);
      setMensagemDisponibilidade("⚠️ Encaixe - Horário pode estar duplicado.");
      return;
    }
    
    // For recurring appointments, skip complex conflict checks here
    if (formData.is_recorrente && !agendamento) {
        setHorarioDisponivel(true);
        setMensagemDisponibilidade("Agendamento recorrente. A disponibilidade será verificada na criação da série.");
        return;
    }

    try {
      const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
      if (!medicoSelecionado) {
        setHorarioDisponivel(false);
        setMensagemDisponibilidade("Médico não encontrado.");
        return;
      }

      // Filter existing appointments that conflict with the selected time
      const agendamentosConflitantes = (todosAgendamentos || []).filter(a =>
        a.medico_id === formData.medico_id &&
        a.data_agendamento === formData.data_agendamento &&
        a.horario === formData.horario &&
        a.status !== 'Cancelado' &&
        (!agendamento || a.id !== agendamento.id) // Exclude the current appointment if editing
      );

      const tipoAtendimento = medicoSelecionado.tipo_atendimento || "Horários Marcados";

      if (tipoAtendimento === "Ordem de Chegada") {
        const limiteVagas = medicoSelecionado.limite_ordem_chegada || 1;
        const vagasOcupadas = agendamentosConflitantes.length;

        if (vagasOcupadas >= limiteVagas) {
          setHorarioDisponivel(false);
          setMensagemDisponibilidade(
            `❌ Limite de ${limiteVagas} paciente(s) atingido para este horário. Marque como "Encaixe" se necessário.`
          );
        } else {
          setHorarioDisponivel(true);
          setMensagemDisponibilidade("✅ Horário disponível.");
        }
      } else { // Horários Marcados
        const ocupado = agendamentosConflitantes.length > 0;
        if (ocupado) {
          setHorarioDisponivel(false);
          setMensagemDisponibilidade("❌ Horário já ocupado. Marque como 'Encaixe' se necessário.");
        } else {
          setHorarioDisponivel(true);
          setMensagemDisponibilidade("✅ Horário disponível.");
        }
      }
    } catch (error) {
      console.error("Erro ao verificar disponibilidade:", error);
      setHorarioDisponivel(false); 
      setMensagemDisponibilidade("Erro ao verificar disponibilidade.");
    }
  }, [formData.medico_id, formData.data_agendamento, formData.horario, formData.is_encaixe, formData.is_recorrente, medicos, todosAgendamentos, agendamento, formData.tipo_servico]);

  useEffect(() => {
    checkSelectedHorarioAvailability();
  }, [checkSelectedHorarioAvailability]);
  
  // Lógica de cálculo de preços mais precisa e com debug melhorado
  useEffect(() => {
    console.log('💰 ===== RECALCULANDO PREÇOS - NOVA LÓGICA DE CONSULTA =====');
    console.log('📝 Dados atuais:', {
      tipo_servico: formData.tipo_servico,
      medico_id: formData.medico_id,
      categoria_preco_id: formData.categoria_preco_id,
      exames_ids: formData.exames_ids,
      procedimento_id: formData.procedimento_id
    });

    let total = 0;
    const particularCategory = Array.isArray(categorias) ? categorias.find(c => normalizeString(c.nome) === 'PARTICULAR') : null;
    
    console.log('🏷️ Categoria Particular encontrada:', particularCategory);
    console.log('🏷️ Categoria Selecionada ID:', formData.categoria_preco_id);

    if (formData.tipo_servico === 'Consulta') {
      if (formData.medico_id && formData.categoria_preco_id) {
        // Usa a nova função para buscar o preço da consulta
        total = buscarPrecoConsulta(formData.medico_id, formData.categoria_preco_id);
        console.log('💰 Consulta - Valor via buscarPrecoConsulta:', { valor_final: total });
      }
    } else if (formData.tipo_servico === 'Procedimento') {
      if (formData.procedimento_id && formData.categoria_preco_id) {
        const preco = tabelaPrecos.find(tp => 
          tp.procedimento_id === formData.procedimento_id && 
          tp.categoria_id === formData.categoria_preco_id
        );
        total = preco?.valor || 0;
        console.log('💰 Procedimento:', {
          procedimento_id: formData.procedimento_id,
          categoria_id: formData.categoria_preco_id,
          preco_encontrado: preco,
          valor_final: total
        });
      }
    } else if (formData.tipo_servico === 'Exame') {
      if (formData.exames_ids?.length > 0) {
          console.log('🧪 Calculando exames...');
          total = formData.exames_ids.reduce((soma, exameId) => {
              const exameInfo = exames.find(e => e.id === exameId);
              
              if (!exameInfo) {
                console.warn(`⚠️ Exame não encontrado: ${exameId}`);
                return soma;
              }
              
              // LÓGICA CRÍTICA: Decidir entre valor particular ou convênio
              const isParticular = formData.categoria_preco_id === particularCategory?.id;
              let valorExame;
              
              if (isParticular) {
                // Para categoria PARTICULAR, usar sempre valor_particular
                valorExame = exameInfo.valor_particular || 0;
                console.log(`🧪 ${exameInfo.nome} (PARTICULAR):`, {
                  valor_particular: exameInfo.valor_particular,
                  valor_convenio: exameInfo.valor_convenio,
                  valor_usado: valorExame
                });
              } else {
                // Para outras categorias, usar valor_convenio se existir, senão valor_particular
                valorExame = exameInfo.valor_convenio || exameInfo.valor_particular || 0;
                console.log(`🧪 ${exameInfo.nome} (CONVÊNIO):`, {
                  valor_particular: exameInfo.valor_particular,
                  valor_convenio: exameInfo.valor_convenio,
                  valor_usado: valorExame
                });
              }
              
              return soma + valorExame;
          }, 0);
          
          console.log('🧪 TOTAL EXAMES:', {
            quantidade_exames: formData.exames_ids.length,
            categoria_eh_particular: formData.categoria_preco_id === particularCategory?.id,
            total_calculado: total
          });
      }
    } else if (formData.tipo_servico === 'Retorno') {
      total = 0; // Retornos sempre gratuitos
      console.log('💰 Retorno - valor zero');
    }
    
    console.log('💰 ===== VALOR FINAL CALCULADO: R$', total.toFixed(2), '=====');
    // Only update if the value has actually changed to avoid unnecessary re-renders
    if (parseFloat(formData.valor_total).toFixed(2) !== total.toFixed(2)) {
      setFormData(prev => ({ ...prev, valor_total: total.toFixed(2).toString() }));
    }
  }, [
    formData.tipo_servico,
    formData.medico_id,
    formData.procedimento_id,
    formData.exames_ids,
    formData.categoria_preco_id,
    medicos,
    procedimentos,
    exames,
    tabelaPrecos,
    categorias,
    buscarPrecoConsulta
  ]);
  
  const handleChange = (field, value) => {
    console.log(`📝 Campo alterado: ${field} = ${value}`);
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Atualizar procedimento_id quando mudar médico ou tipo de serviço para 'Consulta'
      if (
        (field === 'medico_id' || field === 'tipo_servico') && 
        newData.tipo_servico === 'Consulta' && 
        newData.medico_id
      ) {
        const medico = medicos.find(m => m.id === newData.medico_id);
        if (medico) {
          const especialidadeNorm = normalizeString(medico.especialidade);
          
          const procedimentoConsulta = procedimentos.find(p => {
            const nomeNorm = normalizeString(p.nome);
            
            const temConsulta = nomeNorm.includes('CONSULTA');
            const temEspecialidade = nomeNorm.includes(especialidadeNorm);
            const especialidadeMatch = p.especialidade && normalizeString(p.especialidade) === especialidadeNorm;
            
            return temConsulta && (temEspecialidade || especialidadeMatch);
          });
          
          if (procedimentoConsulta) {
            newData.procedimento_id = procedimentoConsulta.id;
          } else {
            newData.procedimento_id = ''; // Clear if not found
          }
        } else {
          newData.procedimento_id = ''; // Clear if no medico
        }
      } else if (field === 'tipo_servico' && newData.tipo_servico !== 'Consulta') {
        newData.procedimento_id = ''; // Clear if type changes from Consulta
      }
      
      return newData;
    });
  };

  // Função `calcularDatasRecorrentes` foi mantida no código, mas a nova lógica do `handleSubmit` não a utilizará para criar múltiplos agendamentos.
  // Se a intenção é que o backend crie a série, esta função pode não ser mais necessária no frontend.
  // No entanto, para fins de visualização no Alert, ela ainda é útil.
  const calcularDatasRecorrentes = (dataInicioStr, dataFimStr, recorrenciaTipo) => {
    const datas = [];
    let dataAtual = new Date(dataInicioStr + 'T00:00:00'); // Use T00:00:00 to avoid timezone issues
    const dataFim = new Date(dataFimStr + 'T00:00:00');

    let contador = 0;
    const limiteSeguranca = 365; // Safety limit to prevent infinite loops

    while (dataAtual <= dataFim && contador < limiteSeguranca) {
        datas.push(format(dataAtual, 'yyyy-MM-dd'));

        switch (recorrenciaTipo) {
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
                // Fallback, though ideally controlled by Select component
                dataAtual.setDate(dataAtual.getDate() + 7);
                break;
        }
        contador++;
    }
    return datas;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      // Validações mínimas
      if (!formData.paciente_id || !formData.data_agendamento || !formData.horario) {
        toast({ 
          title: "Erro", 
          description: "Preencha todos os campos obrigatórios", 
          variant: "destructive" 
        });
        setSalvando(false);
        return;
      }

      // CRÍTICO: Validar categoria
      if (!formData.categoria_preco_id) {
        toast({ 
          title: "Erro", 
          description: "Selecione uma categoria de preço!", 
          variant: "destructive" 
        });
        setSalvando(false);
        return;
      }

      console.log('💾 Salvando agendamento...');
      console.log('📦 categoria_preco_id:', formData.categoria_preco_id);

      // Validações específicas por tipo de serviço
      if ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) {
        toast({ title: "Erro", description: "Selecione um médico", variant: "destructive" });
        setSalvando(false);
        return;
      }

      if (formData.tipo_servico === 'Procedimento' && !formData.procedimento_id) {
        toast({ title: "Erro", description: "Selecione um procedimento", variant: "destructive" });
        setSalvando(false);
        return;
      }

      if (formData.tipo_servico === 'Exame' && (!formData.exames_ids || formData.exames_ids.length === 0)) {
        toast({ title: "Erro", description: "Selecione ao menos um exame", variant: "destructive" });
        setSalvando(false);
        return;
      }

      if (formData.tipo_servico === 'Múltiplos Serviços' && (!formData.itens_servico || formData.itens_servico.length === 0)) {
        toast({ title: "Erro", description: "Adicione ao menos um serviço", variant: "destructive" });
        setSalvando(false);
        return;
      }

      // Validação para campos de recorrência se is_recorrente for true
      if (formData.is_recorrente && (!formData.recorrencia_tipo || !formData.recorrencia_data_fim)) {
        toast({
          title: "Erro",
          description: "Para agendamentos recorrentes, selecione a frequência e a data final.",
          variant: "destructive",
        });
        setSalvando(false);
        return;
      }

      // Preparar dados - GARANTIR QUE CATEGORIA ESTÁ INCLUÍDA
      // Buscar nome do paciente para salvar no snapshot
      const pacienteSelecionado = pacientesEncontrados.find(p => p.id === formData.paciente_id);

      const dados = {
        paciente_id: formData.paciente_id,
        paciente_nome: pacienteSelecionado ? pacienteSelecionado.nome : '',
        data_agendamento: formData.data_agendamento,
        horario: formData.horario,
        tipo_servico: formData.tipo_servico,
        categoria_preco_id: formData.categoria_preco_id, // CRÍTICO
        valor_total: parseFloat(formData.valor_total) || 0,
        status: formData.status || 'Agendado',
        forma_pagamento: formData.forma_pagamento || 'Dinheiro',
        is_encaixe: formData.is_encaixe || false,
        is_recorrente: formData.is_recorrente || false,
        lembrete_equipe: formData.lembrete_equipe || false,
        lembrete_dias_antes: parseInt(formData.lembrete_dias_antes) || 0
      };

      // Adicionar campos opcionais
      if (formData.medico_id) dados.medico_id = formData.medico_id;
      if (formData.observacoes) dados.observacoes = formData.observacoes;
      if (formData.procedimento_id) dados.procedimento_id = formData.procedimento_id;
      if (formData.exames_ids?.length > 0) dados.exames_ids = formData.exames_ids;
      if (formData.itens_servico?.length > 0) dados.itens_servico = formData.itens_servico;
      
      let resultado; // Will hold the result of Agendamento.create or Agendamento.update

      if (agendamento) {
        // ATUALIZAR AGENDAMENTO EXISTENTE
        console.log('🔄 Atualizando agendamento:', agendamento.id);
        
        // Adicionar campos de recorrência se necessário para o UPDATE
        if (formData.is_recorrente) {
          if (formData.recorrencia_tipo) dados.recorrencia_tipo = String(formData.recorrencia_tipo);
          if (formData.recorrencia_data_fim) dados.recorrencia_data_fim = String(formData.recorrencia_data_fim);
          // Preserve existing recurrence_serie_id if available, but only if it's still recurring
          if (agendamento.recorrencia_serie_id) { // This means it was part of a series
            dados.recorrencia_serie_id = String(agendamento.recorrencia_serie_id);
          }
        } else {
          // If it's no longer recurring, ensure these fields are cleared or not sent
          dados.recorrencia_tipo = null; // Set to null to clear in DB
          dados.recorrencia_data_fim = null; // Set to null to clear in DB
          dados.recorrencia_serie_id = null; // Clear serie_id if no longer recurring
        }
        
        console.log('📦 Dados completos a atualizar:', JSON.stringify(dados, null, 2));
        resultado = await Agendamento.update(agendamento.id, dados);
        console.log('✅ Agendamento atualizado com sucesso');
        toast({ title: "Sucesso!", description: "Agendamento atualizado!" }); // Specific toast for update

      } else {
        // CRIAR NOVO AGENDAMENTO
        console.log('➕ Criando novo agendamento');
        
        // SE FOR RECORRENTE, usar a função backend para criar a série
        if (formData.is_recorrente) {
          console.log('🔄 Criando série recorrente via função backend...');
          
          const dadosRecorrentes = {
            ...dados,
            recorrencia_tipo: formData.recorrencia_tipo,
            recorrencia_data_fim: formData.recorrencia_data_fim
          };
          
          console.log('📦 Dados para função de recorrência:', JSON.stringify(dadosRecorrentes, null, 2));
          
          // Use safeApiCall for the backend function invocation
          const response = await safeApiCall(() => 
            base44.functions.invoke('createRecurringAppointments', dadosRecorrentes)
          );
          
          console.log('📥 Resposta da função:', response); // Log the full response object
          
          if (response && response.data && response.data.success) { // Check for response and response.data
            console.log(`✅ ${response.data.total_criados} agendamentos recorrentes criados!`);
            
            toast({
              title: "Série criada com sucesso! 🎉",
              description: `${response.data.total_criados} agendamento(s) foram criado(s) na agenda.`,
              duration: 5000
            });
            
            if (response.data.total_erros > 0) {
              toast({
                title: "Atenção",
                description: `${response.data.total_erros} agendamento(s) não foram criado(s) devido a conflitos. Verifique a agenda.`,
                variant: "warning", // Changed to warning for partial success
                duration: 7000
              });
            }
          } else {
            // Handle error from the backend function
            throw new Error(response?.data?.error || 'Erro desconhecido ao criar série recorrente');
          }
          
        } else {
          // Agendamento simples (não recorrente)
          console.log('📦 Dados para agendamento simples:', JSON.stringify(dados, null, 2));
          resultado = await Agendamento.create(dados);
          console.log('✅ Agendamento criado com sucesso');

          // Criar notificação visual e sonora para NOVO agendamento (não edição)
          if (resultado) { // Ensure creation was successful and we have a result
            try {
              const paciente = pacientesEncontrados.find(p => p.id === formData.paciente_id);
              const medico = medicos.find(m => m.id === formData.medico_id);
              const procedimento = procedimentos.find(p => p.id === formData.procedimento_id);
              
              let nomeServico = formData.tipo_servico;
              if (medico) {
                nomeServico += ` com Dr(a). ${medico.nome}`;
              } else if (procedimento) {
                nomeServico = procedimento.nome;
              }
              
              console.log('🔔 Criando notificação de novo agendamento...');
              
              await Notification.create({
                type: 'novo_agendamento',
                message: `📅 Novo agendamento: ${paciente?.nome || 'Paciente'} - ${nomeServico} - ${formData.data_agendamento} às ${formData.horario}`,
                data: {
                  agendamentoId: resultado.id,
                  paciente_nome: paciente?.nome || 'Paciente',
                  medico_nome: medico?.nome || 'N/A',
                  data_agendamento: formData.data_agendamento,
                  horario: formData.horario,
                  tipo_servico: formData.tipo_servico
                }
              });
              
              console.log('✅ Notificação criada com sucesso!');
            } catch (errorNotif) {
              console.error('⚠️ Erro ao criar notificação (não crítico):', errorNotif);
            }
          }
          toast({ title: "Sucesso!", description: "Agendamento salvo!" }); // Specific toast for single create
        }
      }

      await onSave();
      onClose();

    } catch (error) {
      console.error("❌ Erro:", error);
      
      toast({
        title: "Erro ao salvar",
        description: error.message || "Erro ao salvar agendamento",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  };

  const selectedExames = useMemo(() => {
    const particularCategory = Array.isArray(categorias) ? categorias.find(c => normalizeString(c.nome) === 'PARTICULAR') : null;
    return (formData.exames_ids || []).map(id => {
      const exame = exames.find(e => e.id === id);
      if (exame) {
        // Calculate the specific price for display in the list based on current category
        const isParticular = formData.categoria_preco_id === particularCategory?.id;
        let display_valor;

        if (isParticular) {
          display_valor = exame.valor_particular || 0;
        } else {
          display_valor = exame.valor_convenio || exame.valor_particular || 0;
        }

        return {
          ...exame,
          display_valor: display_valor
        };
      }
      return null;
    }).filter(Boolean);
  }, [formData.exames_ids, exames, formData.categoria_preco_id, categorias]);
  
  // Funções para manipular exames
  const adicionarExame = (exameId) => {
    if (exameId && !formData.exames_ids.includes(exameId)) {
      handleChange('exames_ids', [...formData.exames_ids, exameId]);
    }
  };

  const removerExame = (exameId) => {
    handleChange('exames_ids', formData.exames_ids.filter(id => id !== exameId));
  };

  // NOVO: Funções para gerenciar múltiplos serviços
  const adicionarItemServico = (tipo, itemId = null, medicoId = null) => {
    const particularCategory = Array.isArray(categorias) ? categorias.find(c => normalizeString(c.nome) === 'PARTICULAR') : null;
    const isParticular = formData.categoria_preco_id === particularCategory?.id;
    
    let novoItem = {
      id: Date.now().toString(), // ID temporário para o frontend
      tipo: tipo,
      medico_id: null,
      procedimento_id: null,
      exame_id: null,
      descricao: '',
      valor: 0
    };

    if (tipo === 'Consulta' && medicoId) {
      const medico = medicos.find(m => m.id === medicoId);
      if (medico) {
        novoItem.medico_id = medicoId;
        novoItem.descricao = `Consulta ${medico.especialidade} - Dr(a). ${medico.nome}`;
        novoItem.valor = buscarPrecoConsulta(medicoId, formData.categoria_preco_id);
      }
    } else if (tipo === 'Procedimento' && itemId) {
      const proc = procedimentos.find(p => p.id === itemId);
      if (proc) {
        novoItem.procedimento_id = itemId;
        novoItem.descricao = proc.nome;
        const preco = tabelaPrecos.find(tp => 
          tp.procedimento_id === itemId && 
          tp.categoria_id === formData.categoria_preco_id
        );
        novoItem.valor = preco?.valor || 0;
      }
    } else if (tipo === 'Exame' && itemId) {
      const exame = exames.find(e => e.id === itemId);
      if (exame) {
        novoItem.exame_id = itemId;
        novoItem.descricao = exame.nome;
        novoItem.valor = isParticular ? (exame.valor_particular || 0) : (exame.valor_convenio || exame.valor_particular || 0);
      }
    }

    if (novoItem.descricao) {
      const novosItens = [...formData.itens_servico, novoItem];
      handleChange('itens_servico', novosItens);
      recalcularTotalMultiplosServicos(novosItens);
    }
  };

  const removerItemServico = (itemId) => {
    const novosItens = formData.itens_servico.filter(item => item.id !== itemId);
    handleChange('itens_servico', novosItens);
    recalcularTotalMultiplosServicos(novosItens);
  };

  const recalcularTotalMultiplosServicos = (itens) => {
    const total = itens.reduce((soma, item) => soma + (item.valor || 0), 0);
    setFormData(prev => ({ ...prev, valor_total: total.toFixed(2).toString() }));
  };

  // Funções para controlar o redimensionamento da lista de exames
  const handleMouseDownResize = (e) => {
    e.preventDefault(); // Prevent text selection
    setRedimensionandoExames(true);
    const startY = e.clientY;
    const startHeight = alturaListaExames;

    const handleMouseMove = (e) => {
      const newHeight = startHeight + (e.clientY - startY);
      // Limitar altura entre 100px e 400px
      setAlturaListaExames(Math.max(100, Math.min(400, newHeight)));
    };

    const handleMouseUp = () => {
      setRedimensionandoExames(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Função para analisar pedido de exame com IA com retry e compressão
  const handleAnalisarPedidoExame = async () => {
    if (!pedidoExameFile) {
      toast({
        title: "Nenhum arquivo selecionado",
        description: "Por favor, selecione um arquivo de pedido de exame para analisar.",
        variant: "destructive",
      });
      return;
    }

    // Validação do arquivo
    const maxSize = 15 * 1024 * 1024; // Aumentado para 15MB
    if (pedidoExameFile.size > maxSize) {
      toast({
        title: "Arquivo muito grande",
        description: "Por favor, selecione um arquivo com menos de 15MB.",
        variant: "destructive",
      });
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(pedidoExameFile.type)) {
      toast({
        title: "Tipo de arquivo não suportado",
        description: "Por favor, selecione um PDF, JPG ou PNG.",
        variant: "destructive",
      });
      return;
    }

    setAnalisando(true);
    setUploadProgress(0);
    setUploadStatus('Preparando arquivo...');
    
    try {
      toast({
        title: "Iniciando análise...",
        description: "Otimizando e enviando arquivo...",
      });

      let fileToUpload = pedidoExameFile;
      
      // Comprimir imagens antes do upload
      if (pedidoExameFile.type.startsWith('image/')) {
        setUploadStatus('Otimizando imagem...');
        try {
          const compressedFile = await compressImage(pedidoExameFile);
          if (compressedFile && compressedFile.size < pedidoExameFile.size) {
            fileToUpload = new File([compressedFile], pedidoExameFile.name, {
              type: pedidoExameFile.type
            });
            console.log(`📏 Imagem comprimida: ${pedidoExameFile.size} → ${fileToUpload.size} bytes`);
          }
        } catch (compressError) {
          console.warn('⚠️ Falha na compressão, usando arquivo original:', compressError);
        }
      }

      // Simular progresso do upload
      let progressValue = 0;
      const progressInterval = setInterval(() => {
        progressValue = Math.min(progressValue + 5, 85);
        setUploadProgress(progressValue);
      }, 300);

      let file_url;
      try {
        setUploadStatus('Enviando para o servidor...');
        
        // Upload com retry automático
        const uploadResult = await uploadWithRetry(fileToUpload, 3, 2000);
        file_url = uploadResult.file_url;
        
        clearInterval(progressInterval);
        setUploadProgress(95);
        setUploadStatus('Upload concluído!');
        
        toast({
          title: "Upload concluído ✅",
          description: "Agora a IA está analisando o documento...",
        });
      } catch (uploadError) {
        clearInterval(progressInterval);
        console.error("Erro no upload:", uploadError);
        
        let errorMessage = "Erro ao fazer upload do arquivo.";
        
        if (uploadError.message?.includes('timeout') || uploadError.message?.includes('DatabaseTimeout')) {
          errorMessage = "Timeout no servidor. O sistema está sobrecarregado. Tente novamente em alguns minutos.";
        } else if (uploadError.message?.includes('500')) {
          errorMessage = "Erro interno do servidor. Tente novamente ou use um arquivo menor.";
        } else if (uploadError.message?.includes('network')) {
          errorMessage = "Problema de conexão. Verifique sua internet e tente novamente.";
        }
        
        throw new Error(errorMessage);
      }
      
      setUploadStatus('IA analisando documento...');
      setUploadProgress(98);
      
      const schema = {
        type: "object",
        properties: {
          exames_solicitados: {
            type: "array",
            description: "Liste APENAS os nomes dos exames encontrados no documento. Seja preciso nos nomes e inclua todos os exames mencionados.",
            items: { "type": "string" }
          }
        },
        required: ["exames_solicitados"]
      };

      let resultadoIA;
      try {
        resultadoIA = await ExtractDataFromUploadedFile({
          file_url: file_url,
          json_schema: schema
        });
      } catch (extractError) {
        console.error("Erro na extração:", extractError);
        
        let errorMessage = "Erro ao analisar o documento com IA.";
        
        if (extractError.message?.includes('500')) {
          errorMessage = "Erro interno na análise. O documento pode estar corrompido ou ilegível.";
        } else if (extractError.message?.includes('timeout')) {
          errorMessage = "Timeout na análise. O documento é muito complexo ou o servidor está sobrecarregado.";
        }
        
        throw new Error(errorMessage);
      }

      setUploadProgress(100);
      setUploadStatus('Análise concluída!');

      if (resultadoIA.status !== 'success' || !resultadoIA.output?.exames_solicitados) {
        throw new Error(resultadoIA.details || "A IA não conseguiu extrair os exames do documento. Verifique se o arquivo está legível e contém solicitações de exames claras.");
      }

      const nomesExamesIA = resultadoIA.output.exames_solicitados;
      const examesEncontradosIds = [];
      const examesNaoEncontrados = [];
      const examnesEncontradosNomes = []; // Para mostrar quais foram encontrados
      
      console.log('🔍 Exames identificados pela IA:', nomesExamesIA);
      
      // Criar um mapa mais robusto para encontrar exames
      const mapaExames = new Map();
      const mapaExamesReverso = new Map(); // Para saber qual nome original corresponde
      exames.forEach(e => {
        const nomeNormalizado = normalizeString(e.nome);
        mapaExames.set(nomeNormalizado, e.id);
        mapaExamesReverso.set(e.id, e.nome);
        
        // Adicionar variações comuns (palavras-chave)
        const palavrasChave = nomeNormalizado.split(' ');
        if (palavrasChave.length > 3) { // Considerar apenas palavras com mais de 3 caracteres
          for (let i = 0; i < palavrasChave.length; i++) {
            const palavra = palavrasChave[i];
            if (palavra.length > 3) { // Considerar apenas palavras com mais de 3 caracteres
              if (!mapaExames.has(palavra)) { // Evitar sobrescrever se já tiver um match exato
                mapaExames.set(palavra, e.id);
              }
            }
          }
        }
      });

      for (const nomeIA of nomesExamesIA) {
        const nomeNormalizado = normalizeString(nomeIA);
        let idExame = mapaExames.get(nomeNormalizado);
        
        // Se não encontrou match exato, tentar match parcial (contém ou é contido por)
        if (!idExame) {
          for (const [nomeExameCadastrado, id] of mapaExames.entries()) {
            if (nomeExameCadastrado.includes(nomeNormalizado) || nomeNormalizado.includes(nomeExameCadastrado)) {
              idExame = id;
              break;
            }
          }
        }
        
        if (idExame && !formData.exames_ids.includes(idExame)) {
          examesEncontradosIds.push(idExame);
          examnesEncontradosNomes.push(mapaExamesReverso.get(idExame));
          console.log(`✅ Exame encontrado: "${nomeIA}" → "${mapaExamesReverso.get(idExame)}"`);
        } else if (!idExame) {
          examesNaoEncontrados.push(nomeIA);
          console.log(`❌ Exame NÃO encontrado: "${nomeIA}"`);
        } else {
          console.log(`⚠️ Exame já estava na lista: "${nomeIA}"`);
        }
      }
      
      if (examesEncontradosIds.length > 0) {
        handleChange('exames_ids', [...new Set([...formData.exames_ids, ...examesEncontradosIds])]);
        
        let message = `✅ ${examesEncontradosIds.length} exame(s) adicionado(s):\n${examnesEncontradosNomes.join(', ')}`;
        
        if (examesNaoEncontrados.length > 0) {
          message += `\n\n⚠️ ${examesNaoEncontrados.length} exame(s) NÃO encontrado(s) no sistema:\n${examesNaoEncontrados.join(', ')}\n\n💡 Estes exames precisam ser cadastrados primeiro no sistema.`;
        }
        
        toast({
          title: "Análise concluída! 🎉",
          description: message,
          duration: 8000, // Mais tempo para ler
        });
      } else {
        let message = "Nenhum exame novo foi adicionado.";
        
        if (examesNaoEncontrados.length > 0) {
          message += `\n\n❌ Exames identificados mas NÃO cadastrados no sistema:\n${examesNaoEncontrados.join(', ')}\n\n💡 Por favor, cadastre estes exames primeiro ou adicione manualmente.`;
        }
        
        toast({
          title: "Análise concluída",
          description: message,
          variant: "destructive",
          duration: 8000,
        });
      }

    } catch (error) {
      console.error("Erro na análise com IA:", error);
      toast({
        title: "Erro na Análise ❌",
        description: error.message || "Não foi possível analisar o arquivo. Tente novamente com um arquivo menor ou diferente.",
        variant: "destructive",
        duration: 10000,
      });
    } finally {
      setAnalisando(false);
      setUploadProgress(0);
      setUploadStatus('');
      setPedidoExameFile(null);
      // Limpar o input de arquivo
      const fileInput = document.getElementById('pedido-exame-input');
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  const gerarOrcamento = () => {
    const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const dataAgendamento = formData.data_agendamento ? 
      format(new Date(formData.data_agendamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR }) : 'N/A';
    
    const paciente = pacientesEncontrados.find(p => p.id === formData.paciente_id);
    const medico = medicos.find(m => m.id === formData.medico_id);
    const categoria = categorias.find(c => c.id === formData.categoria_preco_id);
    
    // Montar itens do orçamento
    let itensHtml = '';
    
    if (formData.tipo_servico === 'Consulta' && medico) {
      itensHtml += `
        <tr>
          <td>Consulta - ${medico.especialidade}</td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.', ',')}</td>
          <td style="text-align: right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.', ',')}</td>
        </tr>
      `;
    } else if (formData.tipo_servico === 'Procedimento' && formData.procedimento_id) {
      const proc = procedimentos.find(p => p.id === formData.procedimento_id);
      if (proc) {
        itensHtml += `
          <tr>
            <td>${proc.nome}</td>
            <td style="text-align: center;">1</td>
            <td style="text-align: right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.', ',')}</td>
            <td style="text-align: right;">R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      }
    } else if (formData.tipo_servico === 'Exame' && formData.exames_ids.length > 0) {
      formData.exames_ids.forEach(exameId => {
        const exame = exames.find(e => e.id === exameId);
        if (exame) {
          const particularCategory = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
          const isParticular = formData.categoria_preco_id === particularCategory?.id;
          const valor = isParticular ? (exame.valor_particular || 0) : (exame.valor_convenio || exame.valor_particular || 0);
          
          itensHtml += `
            <tr>
              <td>${exame.nome}</td>
              <td style="text-align: center;">1</td>
              <td style="text-align: right;">R$ ${valor.toFixed(2).replace('.', ',')}</td>
              <td style="text-align: right;">R$ ${valor.toFixed(2).replace('.', ',')}</td>
            </tr>
          `;
        }
      });
    } else if (formData.tipo_servico === 'Retorno') {
      itensHtml += `
        <tr>
          <td>Retorno - ${medico?.especialidade || 'Consulta'}</td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right;">R$ 0,00</td>
          <td style="text-align: right;">R$ 0,00</td>
        </tr>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Orçamento - Centro Vida Saúde</title>
        <style>
          @media print {
            @page { margin: 1cm; }
            body { margin: 0; }
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px;
            color: #333;
            line-height: 1.6;
          }
          .header { 
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 3px solid #10b981;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo-section {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .logo { 
            width: 80px; 
            height: 80px;
            object-fit: contain;
          }
          .clinic-info {
            flex: 1;
          }
          .clinic-name { 
            font-size: 24px; 
            font-weight: bold; 
            color: #10b981;
            margin: 0;
          }
          .clinic-details {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .document-type {
            text-align: right;
          }
          .document-type-label {
            font-size: 32px;
            font-weight: bold;
            color: #10b981;
            margin: 0;
          }
          .document-date {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
          }
          .section {
            margin: 25px 0;
            padding: 15px;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            background-color: #f9fafb;
          }
          .section-title {
            font-size: 16px;
            font-weight: bold;
            color: #10b981;
            margin: 0 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #10b981;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #4b5563;
            flex: 0 0 40%;
          }
          .info-value {
            color: #1f2937;
            flex: 1;
            text-align: right;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
          }
          .items-table th {
            background-color: #10b981;
            color: white;
            padding: 12px;
            text-align: left;
            font-weight: 600;
          }
          .items-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e5e7eb;
          }
          .items-table tr:nth-child(even) {
            background-color: #f9fafb;
          }
          .totals-section {
            margin: 30px 0;
            padding: 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            border-radius: 8px;
            color: white;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            font-size: 16px;
          }
          .total-final {
            font-size: 28px;
            font-weight: bold;
            border-top: 2px solid rgba(255,255,255,0.3);
            padding-top: 15px;
            margin-top: 10px;
          }
          .validade {
            background-color: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
            text-align: center;
          }
          .validade-text {
            font-weight: bold;
            color: #92400e;
            font-size: 14px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            font-size: 11px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-section">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo" />
            <div class="clinic-info">
              <h1 class="clinic-name">CENTRO VIDA SAÚDE</h1>
              <div class="clinic-details">
                Endereço da Clínica • Telefone: (XX) XXXX-XXXX<br/>
                CNPJ: XX.XXX.XXX/XXXX-XX
              </div>
            </div>
          </div>
          <div class="document-type">
            <p class="document-type-label">ORÇAMENTO</p>
            <p class="document-date">Gerado em: ${dataAtual}</p>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Informações do Paciente</h3>
          <div class="info-row">
            <span class="info-label">Nome:</span>
            <span class="info-value">${paciente?.nome || 'A definir'}</span>
          </div>
          ${paciente?.telefone ? `
          <div class="info-row">
            <span class="info-label">Telefone:</span>
            <span class="info-value">${paciente.telefone}</span>
          </div>
          ` : ''}
        </div>

        <div class="section">
          <h3 class="section-title">Informações do Agendamento</h3>
          <div class="info-row">
            <span class="info-label">Data do Agendamento:</span>
            <span class="info-value">${dataAgendamento}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Horário:</span>
            <span class="info-value">${formData.horario || 'A definir'}</span>
          </div>
          ${medico ? `
          <div class="info-row">
            <span class="info-label">Profissional:</span>
            <span class="info-value">Dr(a). ${medico.nome} - ${medico.especialidade}</span>
          </div>
          ` : ''}
          <div class="info-row">
            <span class="info-label">Categoria:</span>
            <span class="info-value">${categoria?.nome || 'N/A'}</span>
          </div>
        </div>

        <div class="section">
          <h3 class="section-title">Itens do Orçamento</h3>
          <table class="items-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th style="text-align: center;">Qtd</th>
                <th style="text-align: right;">Valor Unit.</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itensHtml}
            </tbody>
          </table>
        </div>

        <div class="totals-section">
          <div class="total-row total-final">
            <span>VALOR TOTAL:</span>
            <span>R$ ${parseFloat(formData.valor_total).toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div class="validade">
          <p class="validade-text">⏰ Orçamento válido por 30 dias a partir da data de emissão</p>
        </div>

        ${formData.observacoes ? `
        <div class="section">
          <h3 class="section-title">Observações</h3>
          <p>${formData.observacoes}</p>
        </div>
        ` : ''}

        <div class="footer">
          <p><strong>CENTRO VIDA SAÚDE</strong></p>
          <p>Sistema desenvolvido por Glória Virtual - Soluções com Inteligência Artificial</p>
          <p>gloriavirtual.com | CNPJ: 51.424.200/0001-02</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  return (
    <>
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5" />
                {agendamento ? 'Editar Agendamento' : 'Novo Agendamento'}
                {agendamento?.is_recorrente && (
                  <Badge className="bg-purple-100 text-purple-700 border-purple-300">
                    <Repeat className="w-3 h-3 mr-1" />
                    Recorrente
                  </Badge>
                )}
              </DialogTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={gerarOrcamento}
                disabled={!formData.paciente_id || parseFloat(formData.valor_total) <= 0}
                className="gap-2"
              >
                <Printer className="w-4 h-4" />
                Gerar Orçamento
              </Button>
            </div>
            <DialogDescription>
              Preencha os dados para criar ou editar um agendamento.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-4 pr-2" id="formulario-agendamento">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="busca_paciente">Buscar Paciente *</Label>
                
                {/* Campo de busca com botão de novo paciente */}
                <div className="flex gap-2">
                  <Input
                    id="busca_paciente"
                    placeholder="Digite nome, CPF ou telefone..."
                    value={buscaPaciente}
                    onChange={(e) => setBuscaPaciente(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        buscarPacientesPorNome();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={buscarPacientesPorNome}
                    disabled={buscandoPaciente || buscaPaciente.trim().length < 2}
                  >
                    {buscandoPaciente ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Buscando...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        Buscar
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCadastroRapidoAberto(true)}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Novo
                  </Button>
                </div>
                
                <p className="text-xs text-gray-500">
                  💡 Digite o nome, CPF ou telefone e clique em "Buscar". Pacientes recém-cadastrados aparecem no topo.
                </p>
                
                {/* Select de pacientes encontrados */}
                {pacientesEncontrados.length > 0 && (
                  <div className="mt-2">
                    <Label htmlFor="paciente_id">Selecione o Paciente ({pacientesEncontrados.length} encontrado{pacientesEncontrados.length !== 1 ? 's' : ''})</Label>
                    <Select 
                      name="paciente_id" 
                      value={formData.paciente_id} 
                      onValueChange={(value) => handleChange('paciente_id', value)} 
                      required
                    >
                      <SelectTrigger id="paciente_id">
                        <SelectValue placeholder="Escolha o paciente da lista" />
                      </SelectTrigger>
                      <SelectContent>
                        {pacientesEncontrados.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome} {p.cpf ? `- CPF: ${p.cpf}` : ''} {p.telefone ? `- Tel: ${p.telefone}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="data_agendamento">Data *</Label>
                {/* Calendário em Popover para destacar dias */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={"outline"}
                      className={`w-full justify-start text-left font-normal ${!formData.data_agendamento && "text-muted-foreground"}`}
                      disabled={!formData.medico_id && (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno')}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_agendamento ? format(new Date(formData.data_agendamento + 'T00:00:00'), "PPP", { locale: ptBR }) : <span>Selecione uma data</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={new Date(formData.data_agendamento + 'T00:00:00')}
                      onSelect={(date) => {
                        if (date) {
                          handleChange('data_agendamento', format(date, 'yyyy-MM-dd'))
                        }
                      }}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0) - 86400000)} // Disable dates before today
                      modifiers={modifiers}
                      modifiersClassNames={modifiersClassNames}
                      initialFocus
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
                {(!formData.medico_id && (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno')) && (
                  <p className="text-xs text-amber-600 mt-1">
                    Selecione um médico para ver os dias de atendimento.
                  </p>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tipo_servico">Tipo de Serviço *</Label>
                <Select 
                  name="tipo_servico" 
                  value={formData.tipo_servico} 
                  onValueChange={(value) => {
                    handleChange('tipo_servico', value);
                    if (value !== 'Múltiplos Serviços') {
                      setModoMultiplosServicos(false);
                      handleChange('itens_servico', []);
                    }
                  }}
                >
                  <SelectTrigger id="tipo_servico"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Consulta">Consulta</SelectItem>
                    <SelectItem value="Retorno">Retorno</SelectItem>
                    <SelectItem value="Procedimento">Procedimento</SelectItem>
                    <SelectItem value="Exame">Exame</SelectItem>
                    <SelectItem value="Múltiplos Serviços">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        Múltiplos Serviços
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {formData.tipo_servico === 'Retorno' && (
                  <p className="text-xs text-green-600 mt-1">
                    ✅ Retornos são sempre gratuitos para o paciente
                  </p>
                )}
                {formData.tipo_servico === 'Múltiplos Serviços' && (
                  <p className="text-xs text-purple-600 mt-1">
                    🔄 Adicione consultas, procedimentos e exames no mesmo agendamento
                  </p>
                )}
              </div>

              {(formData.tipo_servico === 'Retorno' || formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Procedimento') && (
                <div>
                  <Label htmlFor="medico_id">
                    Médico {formData.tipo_servico === 'Procedimento' ? '(Opcional)' : '*'}
                  </Label>
                  <Select name="medico_id" value={formData.medico_id} onValueChange={(value) => handleChange('medico_id', value)}>
                    <SelectTrigger id="medico_id"><SelectValue placeholder="Selecione o médico" /></SelectTrigger>
                    <SelectContent>
                      {medicos.map(m => <SelectItem key={m.id} value={m.id}>Dr(a). {m.nome} - {m.especialidade}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {formData.tipo_servico === 'Procedimento' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selecione um médico se desejar vincular o procedimento para cálculo de repasse.
                    </p>
                  )}
                </div>
              )}

              {formData.tipo_servico === 'Procedimento' && (
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="busca_procedimento">Buscar Procedimento</Label>
                  <div className="flex gap-2">
                    <Input
                      id="busca_procedimento"
                      placeholder="Digite o nome ou código do procedimento..."
                      value={buscaProcedimento}
                      onChange={(e) => setBuscaProcedimento(e.target.value)}
                      className="flex-1"
                    />
                    {buscaProcedimento && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setBuscaProcedimento('')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div>
                    <Label htmlFor="procedimento_id">Procedimento * {procedimentosFiltrados.length > 0 && `(${procedimentosFiltrados.length} encontrado${procedimentosFiltrados.length !== 1 ? 's' : ''})`}</Label>
                    <Select 
                      name="procedimento_id" 
                      value={formData.procedimento_id} 
                      onValueChange={(value) => handleChange('procedimento_id', value)}
                    >
                      <SelectTrigger id="procedimento_id">
                        <SelectValue placeholder="Selecione o procedimento" />
                      </SelectTrigger>
                      <SelectContent>
                        {procedimentosFiltrados.length === 0 ? (
                          <SelectItem value="none" disabled>Nenhum procedimento encontrado</SelectItem>
                        ) : (
                          procedimentosFiltrados.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome} {p.codigo && `(${p.codigo})`}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    
                    {buscaProcedimento && procedimentosFiltrados.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">
                        Nenhum procedimento encontrado com "{buscaProcedimento}"
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* NOVO: Bloco para Múltiplos Serviços */}
            {formData.tipo_servico === 'Múltiplos Serviços' && (
              <div className="space-y-4 p-4 border-2 border-purple-200 rounded-lg bg-purple-50">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-lg text-purple-900 flex items-center gap-2">
                    <Layers className="w-5 h-5" />
                    Serviços Incluídos
                  </h3>
                  <Badge variant="outline" className="bg-purple-100 text-purple-700">
                    {formData.itens_servico.length} serviço(s)
                  </Badge>
                </div>

                {/* Adicionar novo serviço */}
                <div className="p-3 border border-purple-300 rounded-lg bg-white space-y-3">
                  <Label className="text-purple-800 font-medium">Adicionar Serviço</Label>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Select 
                      value={servicoParaAdicionar.tipo} 
                      onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, tipo: v, id: '', medicoId: '' }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo de serviço" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Consulta">Consulta</SelectItem>
                        <SelectItem value="Procedimento">Procedimento</SelectItem>
                        <SelectItem value="Exame">Exame</SelectItem>
                      </SelectContent>
                    </Select>

                    {servicoParaAdicionar.tipo === 'Consulta' && (
                      <>
                        <Select 
                          value={servicoParaAdicionar.medicoId}
                          onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, medicoId: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o médico" />
                          </SelectTrigger>
                          <SelectContent>
                            {medicos.map(m => (
                              <SelectItem key={m.id} value={m.id}>
                                Dr(a). {m.nome} - {m.especialidade}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        {/* Mostrar horários disponíveis do médico */}
                        {servicoParaAdicionar.medicoId && (
                          <div className="md:col-span-3 mt-2">
                            {loadingHorariosMultiplos ? (
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Carregando horários...
                              </div>
                            ) : horariosMultiplosServicos.length > 0 ? (
                              <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                                <span className="text-green-700 font-medium">
                                  ✅ {horariosMultiplosServicos.length} horário(s) disponível(is) para este médico na data selecionada
                                </span>
                                <p className="text-xs text-green-600 mt-1">
                                  Horários: {horariosMultiplosServicos.slice(0, 8).join(', ')}{horariosMultiplosServicos.length > 8 ? '...' : ''}
                                </p>
                              </div>
                            ) : (
                              <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                                <span className="text-amber-700 font-medium">
                                  ⚠️ Este médico não possui horários disponíveis para {formData.data_agendamento ? format(new Date(formData.data_agendamento + 'T00:00:00'), "dd/MM/yyyy", { locale: ptBR }) : 'a data selecionada'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {servicoParaAdicionar.tipo === 'Procedimento' && (
                      <Select 
                        value={servicoParaAdicionar.id}
                        onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o procedimento" />
                        </SelectTrigger>
                        <SelectContent>
                          {procedimentos.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {servicoParaAdicionar.tipo === 'Exame' && (
                      <Select 
                        value={servicoParaAdicionar.id}
                        onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, id: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o exame" />
                        </SelectTrigger>
                        <SelectContent>
                          {exames.map(e => (
                            <SelectItem key={e.id} value={e.id}>
                              {e.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <Button
                      type="button"
                      onClick={() => {
                        if (servicoParaAdicionar.tipo === 'Consulta' && servicoParaAdicionar.medicoId) {
                          adicionarItemServico('Consulta', null, servicoParaAdicionar.medicoId);
                        } else if (servicoParaAdicionar.tipo === 'Procedimento' && servicoParaAdicionar.id) {
                          adicionarItemServico('Procedimento', servicoParaAdicionar.id);
                        } else if (servicoParaAdicionar.tipo === 'Exame' && servicoParaAdicionar.id) {
                          adicionarItemServico('Exame', servicoParaAdicionar.id);
                        }
                        setServicoParaAdicionar({ tipo: '', id: '', medicoId: '' });
                      }}
                      disabled={
                        !servicoParaAdicionar.tipo ||
                        (servicoParaAdicionar.tipo === 'Consulta' && !servicoParaAdicionar.medicoId) ||
                        ((servicoParaAdicionar.tipo === 'Procedimento' || servicoParaAdicionar.tipo === 'Exame') && !servicoParaAdicionar.id)
                      }
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </div>

                {/* Lista de serviços adicionados */}
                {formData.itens_servico.length > 0 && (
                  <div className="space-y-2">
                    {formData.itens_servico.map((item, index) => (
                      <div 
                        key={item.id} 
                        className="flex items-center justify-between p-3 bg-white rounded border border-purple-200 hover:bg-purple-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Badge 
                            variant="outline" 
                            className={
                              item.tipo === 'Consulta' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                              item.tipo === 'Procedimento' ? 'bg-green-50 text-green-700 border-green-300' :
                              'bg-orange-50 text-orange-700 border-orange-300'
                            }
                          >
                            {item.tipo}
                          </Badge>
                          <span className="text-sm font-medium">{item.descricao}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                            R$ {item.valor.toFixed(2).replace('.', ',')}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removerItemServico(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {/* Total */}
                    <div className="mt-3 p-3 bg-purple-100 rounded-lg border border-purple-300">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-purple-900">Total dos Serviços:</span>
                        <span className="font-bold text-xl text-purple-900">
                          R$ {formData.itens_servico.reduce((total, item) => total + item.valor, 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {formData.itens_servico.length === 0 && (
                  <Alert className="bg-yellow-50 border-yellow-200">
                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">
                      Adicione pelo menos um serviço (consulta, procedimento ou exame) ao agendamento.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

            {/* Bloco para seleção de exames com retry e compressão */}
            {formData.tipo_servico === 'Exame' && (
              <div className="space-y-4 p-4 border rounded-lg bg-gray-50">
                <h3 className="font-medium text-lg">Orçamento de Exames</h3>
                
                <div className='p-4 border-l-4 border-blue-500 bg-blue-50 text-blue-800 rounded-r-lg'>
                    <p className='font-bold mb-2'>🤖 Análise de Pedido com IA</p>
                    <p className='text-sm mb-3 text-blue-700'>
                      Envie uma foto ou PDF do pedido médico. Nossa IA identifica automaticamente os exames solicitados.
                      <br/>
                      <span className='text-xs text-blue-600'>
                        💡 Arquivos grandes são otimizados automaticamente. Sistema com retry automático em caso de falhas.
                      </span>
                    </p>
                    
                    <div className="flex flex-col md:flex-row items-end gap-3">
                        <div className='flex-grow w-full'>
                            <Label htmlFor="pedido-exame-input" className='text-sm font-medium'>
                              Arquivo do Pedido (PDF, JPG, PNG - máx. 15MB)
                            </Label>
                            <Input 
                                id="pedido-exame-input" 
                                type="file" 
                                accept="image/*,application/pdf"
                                onChange={(e) => setPedidoExameFile(e.target.files[0])} 
                                className='mt-1'
                                disabled={analisando}
                            />
                        </div>
                        <Button 
                          type="button" 
                          onClick={handleAnalisarPedidoExame} 
                          disabled={!pedidoExameFile || analisando}
                          className="w-full md:w-auto"
                        >
                            {analisando ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 
                                  {uploadStatus || 'Processando...'}
                                </>
                            ) : (
                                <><FileScan className="w-4 h-4 mr-2" /> Analisar com IA</>
                            )}
                        </Button>
                    </div>
                    
                    {analisando && uploadProgress > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="flex justify-between text-xs text-blue-600">
                          <span>{uploadStatus}</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${uploadProgress}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                </div>

                <div>
                    <Label>Adicionar Exame Manualmente</Label>
                     <Select onValueChange={adicionarExame} value="">
                        <SelectTrigger><SelectValue placeholder="Selecione um exame para adicionar..." /></SelectTrigger>
                        <SelectContent>
                            {exames.filter(e => !formData.exames_ids.includes(e.id)).map(e => (
                                <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedExames.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="font-medium">
                        Exames Selecionados ({selectedExames.length})
                      </Label>
                      <span className="text-xs text-gray-500">
                        Arraste a barra abaixo para ajustar o tamanho da lista
                      </span>
                    </div>
                    
                    {/* Lista de exames com altura ajustável */}
                    <div 
                      className="relative border rounded-lg bg-white shadow-sm"
                      style={{ height: `${alturaListaExames}px` }}
                    >
                      <div className="overflow-y-auto h-full p-2 space-y-2">
                        {selectedExames.map(exame => (
                            <div key={exame.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border hover:bg-gray-100 transition-colors">
                              <span className="text-sm font-medium flex-grow">{exame.nome}</span>
                              <div className="flex items-center gap-3">
                                 <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                   R$ {exame.display_valor.toFixed(2).replace('.', ',')}
                                 </Badge>
                                 <Button 
                                   type="button" 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50" 
                                   onClick={() => removerExame(exame.id)}
                                 >
                                    <X className="w-4 h-4" />
                                 </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                      
                      {/* Barra de redimensionamento */}
                      <div 
                        className={`absolute bottom-0 left-0 right-0 h-3 bg-gray-200 hover:bg-gray-300 cursor-row-resize flex items-center justify-center transition-colors ${redimensionandoExames ? 'bg-blue-300' : ''}`}
                        onMouseDown={handleMouseDownResize}
                        title="Arraste para redimensionar a lista"
                      >
                        <div className="w-12 h-1 bg-gray-400 rounded-full"></div>
                      </div>
                    </div>
                    
                    {/* Total dos exames */}
                    <div className="mt-2 p-2 bg-green-50 rounded border border-green-200">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-green-800">Total dos Exames:</span>
                        <span className="font-bold text-lg text-green-800">
                          R$ ${selectedExames.reduce((total, exame) => total + exame.display_valor, 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="horario">Horário *</Label>
                <Select 
                  name="horario" 
                  value={formData.horario} 
                  onValueChange={(value) => handleChange('horario', value)} 
                  disabled={
                    loadingHorarios || 
                    ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) || 
                    !formData.data_agendamento
                  }
                >
                  <SelectTrigger id="horario"><SelectValue placeholder={
                    loadingHorarios ? "Carregando..." : 
                    ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) ? "Selecione médico e data" :
                    !formData.data_agendamento ? "Selecione uma data" :
                    horariosDisponiveis.length === 0 ? "Sem horários disponíveis" :
                    "Selecione o horário"
                  } /></SelectTrigger>
                  <SelectContent>
                    {horariosDisponiveis.length > 0 ? (
                        horariosDisponiveis.map(h => (
                          <SelectItem key={h} value={h}>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              {h}
                            </div>
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>Nenhum horário disponível</SelectItem>
                      )}
                  </SelectContent>
                </Select>
                {horariosDisponiveis.length > 0 && (
                    <p className="text-xs text-green-600 mt-1">
                      {horariosDisponiveis.length} horário(s) disponível(is)
                    </p>
                )}
                {/* NOVO: Mensagem de disponibilidade do horário */}
                {mensagemDisponibilidade && (
                  <p className={`text-xs mt-1 ${horarioDisponivel ? 'text-green-600' : 'text-red-600'}`}>
                    {mensagemDisponibilidade}
                  </p>
                )}
              </div>

              {/* NOVO: Checkbox de Encaixe */}
              <div className="flex flex-col justify-end"> {/* Align with the bottom of the select */}
                <div className="flex items-center space-x-2 pt-2"> {/* pt-2 to align with label of select */}
                  <Checkbox
                    id="is_encaixe"
                    checked={formData.is_encaixe}
                    onCheckedChange={(checked) => {
                      handleChange('is_encaixe', checked);
                    }}
                    disabled={salvando}
                  />
                  <label
                    htmlFor="is_encaixe"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                      🔄 Marcar como Encaixe
                    </Badge>
                  </label>
                </div>
                <p className="text-xs text-gray-500 mt-1 pl-6"> {/* pl-6 to align with text */}
                  Permite agendar mesmo com horário ocupado.
                </p>
              </div>
             </div>

            {/* NOVA SEÇÃO: RECORRÊNCIA - Mostrar apenas para novo agendamento de consulta */}
            {!agendamento && (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && (
              <div className="p-4 border-2 border-purple-200 rounded-lg bg-purple-50 space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_recorrente"
                    checked={formData.is_recorrente}
                    onCheckedChange={(checked) => {
                      handleChange('is_recorrente', checked);
                      if (!checked) {
                        handleChange('recorrencia_tipo', '');
                        handleChange('recorrencia_data_fim', '');
                      }
                    }}
                  />
                  <label
                    htmlFor="is_recorrente"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    <Repeat className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-purple-900">Agendar Consultas Recorrentes</span>
                  </label>
                </div>
                
                {formData.is_recorrente && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 ml-6">
                    <div>
                      <Label htmlFor="recorrencia_tipo" className="text-purple-900">
                        Frequência *
                      </Label>
                      <Select 
                        name="recorrencia_tipo" 
                        value={formData.recorrencia_tipo} 
                        onValueChange={(value) => handleChange('recorrencia_tipo', value)}
                        required={formData.is_recorrente}
                      >
                        <SelectTrigger id="recorrencia_tipo">
                          <SelectValue placeholder="Selecione a frequência" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Semanal">Semanal (toda semana)</SelectItem>
                          <SelectItem value="Quinzenal">Quinzenal (a cada 15 dias)</SelectItem>
                          <SelectItem value="Mensal">Mensal (todo mês)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="recorrencia_data_fim" className="text-purple-900">
                        Repetir até *
                      </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className="w-full justify-start text-left font-normal"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.recorrencia_data_fim ? 
                              format(new Date(formData.recorrencia_data_fim + 'T00:00:00'), "PPP", { locale: ptBR }) : 
                              <span>Selecione a data final</span>
                            }
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={formData.recorrencia_data_fim ? new Date(formData.recorrencia_data_fim + 'T00:00:00') : undefined}
                            onSelect={(date) => {
                              if (date) {
                                handleChange('recorrencia_data_fim', format(date, 'yyyy-MM-dd'));
                              }
                            }}
                            disabled={(date) => date < new Date(formData.data_agendamento + 'T00:00:00')}
                            initialFocus
                            locale={ptBR}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )}

                {formData.is_recorrente && formData.recorrencia_tipo && formData.recorrencia_data_fim && (
                  <Alert className="bg-purple-100 border-purple-300 mt-3">
                    <Repeat className="w-4 h-4 text-purple-600" />
                    <AlertDescription className="text-purple-900 text-sm">
                      <strong>Serão criados múltiplos agendamentos:</strong>
                      <br />
                      De {format(new Date(formData.data_agendamento + 'T00:00:00'), "dd/MM/yyyy")} até{' '}
                      {format(new Date(formData.recorrencia_data_fim + 'T00:00:00'), "dd/MM/yyyy")}
                      <br />
                      Frequência: <strong>{formData.recorrencia_tipo}</strong>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="categoria_preco_id">Categoria de Preço *</Label>
                <Select name="categoria_preco_id" value={formData.categoria_preco_id} onValueChange={(value) => handleChange('categoria_preco_id', value)}>
                  <SelectTrigger id="categoria_preco_id"><SelectValue placeholder="Selecione a categoria" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="valor_total">Valor Total (R$)</Label>
                <Input 
                  id="valor_total" 
                  name="valor_total" 
                  value={formData.valor_total} 
                  onChange={(e) => handleChange('valor_total', e.target.value)} 
                  type="number" 
                  step="0.01" 
                  readOnly={formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno' || formData.tipo_servico === 'Procedimento' || formData.tipo_servico === 'Exame'}
                  className={(formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno' || formData.tipo_servico === 'Procedimento' || formData.tipo_servico === 'Exame') ? 'bg-gray-100' : ''}
                />
                {(formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Procedimento' || formData.tipo_servico === 'Exame') && (
                  <p className="text-xs text-gray-500 mt-1">
                    Valor calculado automaticamente via Tabela de Preços
                  </p>
                )}
                {formData.tipo_servico === 'Retorno' && (
                  <p className="text-xs text-green-600 mt-1">
                    Retornos são sempre gratuitos - valor fixo R$ 0,00
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="forma_pagamento">Forma de Pagamento</Label>
                <Select name="forma_pagamento" value={formData.forma_pagamento} onValueChange={(value) => {
                  handleChange('forma_pagamento', value);
                  if (value !== 'Múltiplas Formas') {
                    setPagamento1({ forma: '', valor: '' });
                    setPagamento2({ forma: '', valor: '' });
                  }
                }}>
                  <SelectTrigger id="forma_pagamento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão Débito">Cartão de Débito</SelectItem>
                    <SelectItem value="Cartão Crédito">Cartão de Crédito</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Transferência">Transferência Bancária</SelectItem>
                    <SelectItem value="Convênio">Convênio</SelectItem>
                    <SelectItem value="Múltiplas Formas">Múltiplas Formas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Agendado">Agendado</SelectItem>
                    <SelectItem value="Confirmado">Confirmado</SelectItem>
                    <SelectItem value="Pago">Pago</SelectItem>
                    <SelectItem value="Em Atendimento">Em Atendimento</SelectItem>
                    <SelectItem value="Finalizado">Finalizado</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                    <SelectItem value="Não Compareceu">Não Compareceu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Campos para Múltiplas Formas de Pagamento */}
            {formData.forma_pagamento === 'Múltiplas Formas' && (
              <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50 space-y-4">
                <h4 className="font-medium text-blue-900">Detalhar Formas de Pagamento</h4>
                
                {/* Pagamento 1 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Forma 1</Label>
                    <Select value={pagamento1.forma} onValueChange={(v) => setPagamento1(prev => ({ ...prev, forma: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                        <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="Transferência">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={pagamento1.valor}
                      onChange={(e) => setPagamento1(prev => ({ ...prev, valor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Pagamento 2 */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Forma 2</Label>
                    <Select value={pagamento2.forma} onValueChange={(v) => setPagamento2(prev => ({ ...prev, forma: v }))}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                        <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="Transferência">Transferência</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0,00"
                      value={pagamento2.valor}
                      onChange={(e) => setPagamento2(prev => ({ ...prev, valor: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Total das formas */}
                {(pagamento1.valor || pagamento2.valor) && (
                  <div className="pt-2 border-t border-blue-300">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-800">Total informado:</span>
                      <span className="font-bold text-blue-900">
                        R$ {((parseFloat(pagamento1.valor) || 0) + (parseFloat(pagamento2.valor) || 0)).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" name="observacoes" value={formData.observacoes} onChange={(e) => handleChange('observacoes', e.target.value)} placeholder="Alergias, pedidos especiais, etc." />
            </div>

            <div className="flex items-center space-x-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="lembrete_equipe"
                  checked={formData.lembrete_equipe}
                  onCheckedChange={(checked) => handleChange('lembrete_equipe', checked)}
                />
                <Label htmlFor="lembrete_equipe" className="cursor-pointer font-medium text-yellow-900">
                  Lembrar equipe
                </Label>
              </div>
              
              {formData.lembrete_equipe && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                  <Label htmlFor="lembrete_dias_antes" className="text-sm whitespace-nowrap">Avisar:</Label>
                  <Select 
                    value={String(formData.lembrete_dias_antes)} 
                    onValueChange={(v) => handleChange('lembrete_dias_antes', parseInt(v))}
                  >
                    <SelectTrigger id="lembrete_dias_antes" className="w-[180px] h-8 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No dia do agendamento</SelectItem>
                      <SelectItem value="1">1 dia antes</SelectItem>
                      <SelectItem value="2">2 dias antes</SelectItem>
                      <SelectItem value="3">3 dias antes</SelectItem>
                      <SelectItem value="7">1 semana antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </form>
          <DialogFooter className="mt-4 pt-4 border-t">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={salvando}>Cancelar</Button>
            </DialogClose>
            <Button 
              type="submit" 
              form="formulario-agendamento" 
              disabled={
                salvando || 
                !formData.paciente_id || 
                !formData.data_agendamento ||
                !formData.horario ||
                ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) ||
                (formData.tipo_servico === 'Procedimento' && !formData.procedimento_id) ||
                (formData.tipo_servico === 'Exame' && formData.exames_ids.length === 0) ||
                (formData.tipo_servico === 'Múltiplos Serviços' && formData.itens_servico.length === 0) ||
                !formData.categoria_preco_id ||
                (!horarioDisponivel && !formData.is_encaixe) ||
                (formData.is_recorrente && (!formData.recorrencia_tipo || !formData.recorrencia_data_fim))
              }
            >
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 
                  {formData.is_recorrente && !agendamento ? 'Criando série...' : 'Salvando...'}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" /> 
                  {formData.is_recorrente && !agendamento ? 'Criar Série Recorrente' : 'Salvar Agendamento'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOVO: Dialog para cadastro rápido de paciente */}
      <Dialog open={cadastroRapidoAberto} onOpenChange={setCadastroRapidoAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Cadastro Rápido de Paciente
            </DialogTitle>
            <DialogDescription>
              Cadastre apenas o essencial agora. Complete os dados depois na página de Pacientes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="novo_nome">Nome Completo *</Label>
              <Input
                id="novo_nome"
                value={novoPacienteRapido.nome}
                onChange={(e) => setNovoPacienteRapido(prev => ({ ...prev, nome: e.target.value }))}
                placeholder="Ex: João da Silva"
                disabled={salvandoPacienteRapido}
              />
            </div>

            <div>
              <Label htmlFor="novo_telefone">Telefone *</Label>
              <Input
                id="novo_telefone"
                value={novoPacienteRapido.telefone}
                onChange={(e) => setNovoPacienteRapido(prev => ({ ...prev, telefone: e.target.value }))}
                placeholder="Ex: (51) 99999-9999"
                disabled={salvandoPacienteRapido}
              />
            </div>

            <div>
              <Label htmlFor="novo_convenio">Convênio *</Label>
              <Select 
                value={novoPacienteRapido.convenio} 
                onValueChange={(value) => setNovoPacienteRapido(prev => ({ ...prev, convenio: value }))}
                disabled={salvandoPacienteRapido}
              >
                <SelectTrigger id="novo_convenio">
                  <SelectValue placeholder="Selecione o convênio" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map(categoria => (
                    <SelectItem key={categoria.id} value={categoria.nome}>
                      {categoria.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                💡 O convênio define automaticamente a categoria de preço nos agendamentos
              </p>
            </div>

            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                Após salvar, complete o cadastro com CPF, endereço e outras informações na página <strong>Pacientes</strong>.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={salvandoPacienteRapido}>
                Cancelar
              </Button>
            </DialogClose>
            <Button 
              type="button" 
              onClick={handleCriarPacienteRapido}
              disabled={salvandoPacienteRapido || !novoPacienteRapido.nome || !novoPacienteRapido.telefone}
            >
              {salvandoPacienteRapido ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar e Selecionar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}