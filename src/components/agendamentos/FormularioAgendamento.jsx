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
import { ptBR } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

// SDK entity shortcuts
const Agendamento = base44.entities.Agendamento;
const Paciente = base44.entities.Paciente;
const Notification = base44.entities.Notification;
import { safeApiCall, clearCache } from "@/components/shared/apiThrottle";
import { gerarOrcamento } from "@/components/agendamentos/GerarOrcamento";
import CadastroRapidoDialog from "@/components/agendamentos/CadastroRapidoDialog";
import { analisarPedidoExame } from "@/components/agendamentos/AnalisePedidoExame";

const normalizeString = (str) => {
    if (!str) return '';
    return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

export default function FormularioAgendamento({ agendamento, dadosIniciais, todosAgendamentos, medicos, pacientes: pacientesProps, procedimentos, exames, categorias, tabelaPrecos, onSave, onClose }) {
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
    desconto_manual: '0',
    acrescimo_manual: '0',
    valor_final: '0',
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

  const [alturaListaExames, setAlturaListaExames] = useState(200);
  const [redimensionandoExames, setRedimensionandoExames] = useState(false);
  const [buscaProcedimento, setBuscaProcedimento] = useState('');

  // Estado para busca de exames
  const [buscaExame, setBuscaExame] = useState('');

  // NOVO: Estados para múltiplas formas de pagamento
  const [pagamento1, setPagamento1] = useState({ forma: '', valor: '' });
  const [pagamento2, setPagamento2] = useState({ forma: '', valor: '' });

  const [cadastroRapidoAberto, setCadastroRapidoAberto] = useState(false);
  const [novoPacienteRapido, setNovoPacienteRapido] = useState({ nome: '', cpf: '', telefone: '', convenio: 'Particular' });
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
    if (!medico) {
      console.warn('⚠️ Médico não encontrado:', medicoId);
      return 0;
    }

    console.log(`🔍 Buscando preço para médico: ${medico.nome} (ID: ${medicoId})`);
    console.log(`🔍 Especialidade do médico: ${medico.especialidade}`);
    console.log(`📋 Categoria ID: ${categoriaId}`);

    // Normalizar especialidade do médico específico
    const especialidadeNorm = normalizeString(medico.especialidade);
    console.log(`🔤 Especialidade normalizada: ${especialidadeNorm}`);

    // Buscar procedimento de consulta da especialidade
    // PRIORIZAR match EXATO no campo especialidade do procedimento
    let procedimentoConsulta = procedimentos.find(p => {
      const nomeNorm = normalizeString(p.nome);
      const temConsulta = nomeNorm.includes('CONSULTA');
      const especialidadeExata = p.especialidade && normalizeString(p.especialidade) === especialidadeNorm;
      
      if (temConsulta && especialidadeExata) {
        console.log(`✅ Match exato encontrado: ${p.nome} (especialidade: ${p.especialidade})`);
      }
      
      return temConsulta && especialidadeExata;
    });

    // Se não encontrou por especialidade exata, tentar pelo nome
    if (!procedimentoConsulta) {
      console.log(`⚠️ Não encontrou match exato por especialidade, tentando pelo nome...`);
      procedimentoConsulta = procedimentos.find(p => {
        const nomeNorm = normalizeString(p.nome);
        const temConsulta = nomeNorm.includes('CONSULTA');
        const temEspecialidadeNoNome = nomeNorm.includes(especialidadeNorm);
        
        return temConsulta && temEspecialidadeNoNome;
      });
    }

    if (!procedimentoConsulta) {
      console.error(`❌ PROCEDIMENTO NÃO ENCONTRADO para especialidade: ${medico.especialidade}`);
      return 0;
    }

    console.log(`✅ Procedimento encontrado: ${procedimentoConsulta.nome} (ID: ${procedimentoConsulta.id})`);

    // Buscar preço na tabela de preços
    const preco = tabelaPrecos.find(tp => 
      tp.procedimento_id === procedimentoConsulta.id && 
      tp.categoria_id === categoriaId
    );

    if (!preco) {
      console.error(`❌ PREÇO NÃO ENCONTRADO na tabela para procedimento ${procedimentoConsulta.id} e categoria ${categoriaId}`);
      return 0;
    }

    console.log(`✅💰 Preço encontrado: R$ ${preco.valor.toFixed(2)}`);
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

  const handleCriarPacienteRapido = async () => {
    if (!novoPacienteRapido.nome || !novoPacienteRapido.cpf || !novoPacienteRapido.telefone) {
      toast({ title: "Campos obrigatórios", description: "Preencha nome, CPF e telefone", variant: "destructive" });
      return;
    }
    setSalvandoPacienteRapido(true);
    try {
      const novoPaciente = await Paciente.create({
        nome: novoPacienteRapido.nome,
        cpf: novoPacienteRapido.cpf,
        telefone: novoPacienteRapido.telefone,
        convenio: novoPacienteRapido.convenio || 'Particular'
      });
      toast({ title: "Sucesso!", description: `Paciente ${novoPaciente.nome} cadastrado com sucesso! Complete os dados depois na página de Pacientes.` });
      setPacientesEncontrados([novoPaciente]);
      setBuscaPaciente(novoPaciente.nome);
      handleChange('paciente_id', novoPaciente.id);
      setNovoPacienteRapido({ nome: '', cpf: '', telefone: '', convenio: 'Particular' });
      setCadastroRapidoAberto(false);
      setTimeout(() => buscarPacientesPorNome(), 500);
    } catch (error) {
      console.error('❌ Erro ao criar paciente:', error);
      toast({ title: "Erro", description: error.message || "Erro ao criar paciente", variant: "destructive" });
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
    
    // 0. Verificar se a data está BLOQUEADA (feriado/clínica fechada)
    const dataBloqueada = medicoSelecionado.horarios_atendimento.some(h => 
      h.data_especifica === dataFormatada && h.bloqueado === true
    );
    if (dataBloqueada) return false;
    
    // 1. Verificar se há horário com data específica para esta data (não bloqueado)
    const temDataEspecifica = medicoSelecionado.horarios_atendimento.some(h => 
      h.data_especifica === dataFormatada && !h.bloqueado
    );
    
    if (temDataEspecifica) return true;
    
    // 2. Verificar horários recorrentes (sem data específica, não bloqueados)
    const horariosRecorrentes = medicoSelecionado.horarios_atendimento.filter(h => 
      h.dia_semana === diaSemana && !h.data_especifica && !h.bloqueado
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

  // Filtrar exames baseado na busca
  const examesFiltrados = useMemo(() => {
    if (!buscaExame || buscaExame.trim() === '') {
      return exames;
    }
    
    const termo = buscaExame.toLowerCase().trim();
    return exames.filter(e => 
      e.nome?.toLowerCase().includes(termo) || 
      e.codigo?.toLowerCase().includes(termo) ||
      e.tipo?.toLowerCase().includes(termo)
    );
  }, [exames, buscaExame]);

  // Helper: verificar se uma data está bloqueada (feriado) em QUALQUER médico
  const isDataBloqueada = useCallback((date) => {
    const dataFormatada = format(date, 'yyyy-MM-dd');
    return medicos.some(m => 
      (m.horarios_atendimento || []).some(h => 
        h.data_especifica === dataFormatada && h.bloqueado === true
      )
    );
  }, [medicos]);

  // Modificadores para o calendário
  const modifiers = useMemo(() => ({
    disponivel: (date) => {
      if (isDataBloqueada(date)) return false;
      if (!formData.medico_id) return false;
      const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
      return medicoAtendeNaDataCalendario(date, medicoSelecionado);
    },
    bloqueado: (date) => isDataBloqueada(date)
  }), [formData.medico_id, medicos, medicoAtendeNaDataCalendario, isDataBloqueada]);

  const modifiersClassNames = {
    disponivel: "bg-green-100 text-green-900 font-bold",
    bloqueado: "!bg-red-100 !text-red-400 line-through opacity-60",
  };

  // Limpar cache de médicos ao abrir o formulário para garantir dados atualizados (ex: feriados)
  useEffect(() => {
    clearCache('medicos');
  }, []);

  // Estado para armazenar o horário original do agendamento sendo editado
  const [horarioOriginal, setHorarioOriginal] = useState('');

  // Ref para controlar se já inicializou (evita re-execução infinita)
  const inicializouRef = React.useRef(false);
  const agendamentoIdRef = React.useRef(agendamento?.id || null);

  // useEffect para setar os dados iniciais do agendamento ou definir padrões
  useEffect(() => {
    // Evitar re-inicialização se já foi feita para o mesmo agendamento
    const currentAgendamentoId = agendamento?.id || null;
    if (inicializouRef.current && agendamentoIdRef.current === currentAgendamentoId) {
      return;
    }
    inicializouRef.current = true;
    agendamentoIdRef.current = currentAgendamentoId;

    const initializeFormDataAndPatient = async () => {
      let initialFormData = {
        id: null,
        paciente_id: '',
        medico_id: '',
        data_agendamento: format(new Date(), 'yyyy-MM-dd'),
        horario: '',
        tipo_servico: 'Consulta',
        itens_servico: [],
        is_encaixe: false,
        is_recorrente: false,
        recorrencia_tipo: '',
        recorrencia_data_fim: '',
        procedimento_id: '',
        exames_ids: [],
        categoria_preco_id: '',
        valor_total: '0',
        desconto_manual: '0',
        acrescimo_manual: '0',
        valor_final: '0',
        forma_pagamento: 'Dinheiro',
        status: 'Agendado',
        observacoes: '',
        lembrete_equipe: false,
        lembrete_dias_antes: 1
      };

      if (agendamento) {
        // Guardar o horário original para preservá-lo na edição
        if (agendamento.horario) {
          setHorarioOriginal(agendamento.horario);
        }
        
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
          desconto_manual: agendamento.desconto_manual?.toString() || '0',
          acrescimo_manual: agendamento.acrescimo_manual?.toString() || '0',
          valor_final: agendamento.valor_final?.toString() || agendamento.valor_total?.toString() || '0',
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
        setModoMultiplosServicos(false);

        try {
          const pk = Object.keys(localStorage).find(k => k.startsWith('agendamento_preconfig_'));
          if (pk) { const pc = JSON.parse(localStorage.getItem(pk) || '{}'); if (pc.data_agendamento) initialFormData.data_agendamento = pc.data_agendamento; if (pc.tipo_servico) initialFormData.tipo_servico = pc.tipo_servico; if (pc.medico_id && medicos.find(m => m.id === pc.medico_id)) initialFormData.medico_id = pc.medico_id; }
        } catch (e) {}

        // Handle dadosIniciais from navigation (e.g., from Chat or Dashboard)
        if (dadosIniciais) {
          if (dadosIniciais.paciente_id) {
            initialFormData.paciente_id = dadosIniciais.paciente_id;
            // Fetch the patient to populate the search
            try {
              const pacienteInicial = await Paciente.get(dadosIniciais.paciente_id);
              if (pacienteInicial) {
                setPacientesEncontrados([pacienteInicial]);
                setBuscaPaciente(pacienteInicial.nome || dadosIniciais.paciente_nome || '');
              } else {
                setPacientesEncontrados([]);
                setBuscaPaciente(dadosIniciais.paciente_nome || '');
              }
            } catch (e) {
              console.warn('⚠️ Erro ao buscar paciente inicial:', e);
              setPacientesEncontrados([]);
              setBuscaPaciente(dadosIniciais.paciente_nome || '');
            }
          } else {
            setPacientesEncontrados([]);
            setBuscaPaciente(dadosIniciais.paciente_nome || '');
          }
        } else {
          setPacientesEncontrados([]);
          setBuscaPaciente('');
        }
      }
      setFormData(initialFormData);
    };

    initializeFormDataAndPatient();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento?.id]);

  // Ref para evitar loop infinito na auto-seleção de categoria
  const lastAutoCategoriaPacienteRef = React.useRef('');

  // NOVO: useEffect para auto-selecionar categoria baseado no convênio do paciente
  useEffect(() => {
    if (!formData.paciente_id || agendamento) return; // Only for new appointments
    if (lastAutoCategoriaPacienteRef.current === formData.paciente_id) return; // Já processou este paciente
    
    const pacienteSelecionado = pacientesEncontrados.find(p => p.id === formData.paciente_id);
    if (!pacienteSelecionado) return;
    
    lastAutoCategoriaPacienteRef.current = formData.paciente_id;
    
    if (pacienteSelecionado.convenio) {
      const categoriaCorrespondente = categorias.find(c => 
        normalizeString(c.nome) === normalizeString(pacienteSelecionado.convenio)
      );
      
      if (categoriaCorrespondente) {
        handleChange('categoria_preco_id', categoriaCorrespondente.id);
        toast({
          title: "Categoria Selecionada",
          description: `Categoria "${categoriaCorrespondente.nome}" selecionada automaticamente.`
        });
      } else {
        const particular = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
        if (particular) {
          handleChange('categoria_preco_id', particular.id);
        }
      }
    } else {
      const particular = categorias.find(c => normalizeString(c.nome) === 'PARTICULAR');
      if (particular) {
        handleChange('categoria_preco_id', particular.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.paciente_id]);


  // Função para carregar horários disponíveis baseado no médico e data
  const carregarHorarios = useCallback(async (medicoId, data) => {
    // Para Exames e Procedimentos, gerar horários automáticos mas filtrar ocupados
    if (formData.tipo_servico === 'Exame' || formData.tipo_servico === 'Procedimento') {
      console.log('🔄 Gerando horários automáticos para', formData.tipo_servico);
      
      // Se for Procedimento COM médico selecionado, usar a lógica de agenda do médico (Horários Marcados)
      // para travar 1 agendamento por horário
      if (formData.tipo_servico === 'Procedimento' && medicoId) {
        console.log('🔒 Procedimento com médico - usando agenda do médico para travar horários');
        // NÃO retornar aqui, deixar cair na lógica de consultas abaixo que já trata "Horários Marcados"
      } else {
        // Para Exames (sem médico obrigatório), gerar horários das 7h às 19h, a cada 10 minutos
        const horariosAutomaticos = [];
        for (let hora = 7; hora <= 18; hora++) {
          for (let minuto = 0; minuto < 60; minuto += 10) {
            const horario = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
            horariosAutomaticos.push(horario);
          }
        }
        
        // Adicionar último horário de 19:00
        horariosAutomaticos.push('19:00');

        // Se NÃO for encaixe, filtrar horários já ocupados
        if (data && !formData.is_encaixe) {
          const agendamentosNoDia = (todosAgendamentos || []).filter(a => 
            a.data_agendamento === data &&
            a.status !== 'Cancelado' &&
            (!agendamento || a.id !== agendamento.id)
          );
          const horariosOcupados = agendamentosNoDia.map(a => a.horario);
          
          const horariosLivres = horariosAutomaticos.filter(h => !horariosOcupados.includes(h));
          
          // Se estiver editando, garantir que o horário original esteja na lista
          let horariosFinais = horariosLivres;
          if (agendamento?.horario && !horariosFinais.includes(agendamento.horario)) {
            horariosFinais = [...horariosFinais, agendamento.horario].sort();
          }
          
          setHorariosDisponiveis(horariosFinais.sort());
        } else {
          setHorariosDisponiveis(horariosAutomaticos.sort());
        }
        
        setLoadingHorarios(false);
        return;
      }
    }
    
    // Para Consultas e Retornos, usar a lógica existente
    if (!medicoId || !data) {
      setHorariosDisponiveis([]);
      return;
    }
    
    setLoadingHorarios(true);
    try {
      const medicoSelecionado = medicos.find(m => m.id === medicoId);
      if (!medicoSelecionado) {
        setHorariosDisponiveis([]);
        setLoadingHorarios(false);
        return;
      }

      const dataObj = new Date(data + 'T00:00:00');
      const diaSemana = dataObj.getDay(); // 0=Domingo, 1=Segunda...
      
      // NOVO: Para Odontologia, Dr. Ruben e Dr. Marco com agenda unificada, combinar horários
      const isOdontologia = normalizeString(medicoSelecionado.especialidade) === 'ODONTOLOGIA';
      const medicosOdontologia = medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA');
      const isAgendaUnificadaOdonto = isOdontologia && medicosOdontologia.length > 1;
      
      // Verificar se é Dr. Ruben (múltiplas especialidades)
      const isRuben = normalizeString(medicoSelecionado.nome).includes('RUBEN');
      const medicosRuben = medicos.filter(m => normalizeString(m.nome).includes('RUBEN') && m.status === 'Ativo');
      const isAgendaUnificadaRuben = isRuben && medicosRuben.length > 1;
      
      // Verificar se é Dr. Marco Antônio Delazeri (múltiplas especialidades)
      const isMarco = normalizeString(medicoSelecionado.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(medicoSelecionado.nome).includes('MARCO ANTÔNIO DELAZERI');
      const medicosMarco = medicos.filter(m => (normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI')) && m.status === 'Ativo');
      const isAgendaUnificadaMarco = isMarco && medicosMarco.length > 1;
      
      const isAgendaUnificada = isAgendaUnificadaOdonto || isAgendaUnificadaRuben || isAgendaUnificadaMarco;
      
      let horariosDoMedico = [];
      let medicosParaVerificar = [medicoSelecionado];
      
      if (isAgendaUnificadaOdonto) {
        // Para agenda unificada de Odontologia, combinar horários de todos os dentistas
        console.log('🦷 Agenda unificada de Odontologia - combinando horários de', medicosOdontologia.length, 'dentistas');
        medicosParaVerificar = medicosOdontologia;
      } else if (isAgendaUnificadaRuben) {
        // Para Dr. Ruben, combinar horários de todos os cadastros dele
        console.log('🩺 Agenda unificada Dr. Ruben - combinando horários de', medicosRuben.length, 'especialidades');
        medicosParaVerificar = medicosRuben;
      } else if (isAgendaUnificadaMarco) {
        // Para Dr. Marco, combinar horários de todos os cadastros dele
        console.log('🩺 Agenda unificada Dr. Marco - combinando horários de', medicosMarco.length, 'especialidades');
        medicosParaVerificar = medicosMarco;
      }
      
      // Coletar todos os horários dos médicos relevantes
      for (const medico of medicosParaVerificar) {
        if (!medico.horarios_atendimento) continue;
        
        // Verificar se há horários com data específica para este dia
        const horariosDataEspecifica = medico.horarios_atendimento.filter(h => h.data_especifica === data);
        
        // Se houver horários com data específica, usar eles; senão, usar horários recorrentes
        const horariosDesteMedico = horariosDataEspecifica.length > 0 
          ? horariosDataEspecifica.filter(h => !h.bloqueado)
          : medico.horarios_atendimento.filter(h => {
              if (h.bloqueado) return false;
              if (h.dia_semana !== diaSemana || h.data_especifica) return false;
              
              // Verificar recorrência
              const recorrencia = h.recorrencia || 'Toda Semana';
              if (recorrencia === 'Toda Semana') return true;
              if (recorrencia === 'Apenas uma vez') return false;
              
              const weekOfMonth = getWeekOfMonth(dataObj);
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
        
        // Adicionar horários deste médico ao array geral
        horariosDoMedico = [...horariosDoMedico, ...horariosDesteMedico.map(h => ({
          ...h,
          medico_id: medico.id,
          tempo_consulta: medico.tempo_consulta_minutos || 30
        }))];
      }
      
      if (horariosDoMedico.length === 0) {
        console.log('⚠️ Nenhum horário encontrado para este dia');
        setHorariosDisponiveis([]);
        setLoadingHorarios(false);
        return;
      }

      // Para agenda unificada, verificar agendamentos de TODOS os médicos do grupo
      let agendamentosExistentes;
      if (isAgendaUnificadaOdonto) {
        const idsDentistas = medicosOdontologia.map(m => m.id);
        agendamentosExistentes = (todosAgendamentos || []).filter(a => 
          idsDentistas.includes(a.medico_id) && 
          a.data_agendamento === data &&
          a.status !== 'Cancelado'
        );
      } else if (isAgendaUnificadaRuben) {
        const idsRuben = medicosRuben.map(m => m.id);
        agendamentosExistentes = (todosAgendamentos || []).filter(a => 
          idsRuben.includes(a.medico_id) && 
          a.data_agendamento === data &&
          a.status !== 'Cancelado'
        );
      } else if (isAgendaUnificadaMarco) {
        const idsMarco = medicosMarco.map(m => m.id);
        agendamentosExistentes = (todosAgendamentos || []).filter(a => 
          idsMarco.includes(a.medico_id) && 
          a.data_agendamento === data &&
          a.status !== 'Cancelado'
        );
      } else {
        agendamentosExistentes = (todosAgendamentos || []).filter(a => 
          a.medico_id === medicoId && 
          a.data_agendamento === data &&
          a.status !== 'Cancelado'
        );
      }
      
      const tipoAtendimento = medicoSelecionado.tipo_atendimento || "Horários Marcados";
      const horariosLivres = [];
      
      if (tipoAtendimento === "Horários Marcados") {
        const horariosOcupados = formData.is_encaixe ? [] : agendamentosExistentes.map(a => a.horario);
        
        // Se estiver editando, libera o horário atual para poder ser selecionado novamente
        if (!formData.is_encaixe && agendamento && agendamento.data_agendamento === data) {
          const index = horariosOcupados.indexOf(agendamento.horario);
          if (index > -1) {
            horariosOcupados.splice(index, 1);
          }
        }
        
        // Gerar horários baseados nos períodos definidos
        for (const periodo of horariosDoMedico) {
          const tempoConsulta = periodo.tempo_consulta || medicoSelecionado.tempo_consulta_minutos || 30;
          const [inicioH, inicioM] = periodo.horario_inicio.split(':').map(Number);
          const [fimH, fimM] = periodo.horario_fim.split(':').map(Number);
          const periodoInicioMinutos = inicioH * 60 + inicioM;
          const periodoFimMinutos = fimH * 60 + fimM;
          
          for (let minutos = periodoInicioMinutos; minutos + tempoConsulta <= periodoFimMinutos; minutos += tempoConsulta) {
            const horas = Math.floor(minutos / 60);
            const mins = minutos % 60;
            const horario = `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            
            if (!horariosOcupados.includes(horario) && !horariosLivres.includes(horario)) {
              horariosLivres.push(horario);
            }
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

      // Se estiver editando um agendamento, garantir que o horário original esteja na lista
      let horariosFinais = horariosLivres.sort();
      if (agendamento && agendamento.horario && !horariosFinais.includes(agendamento.horario)) {
        horariosFinais = [...horariosFinais, agendamento.horario].sort();
        console.log('📌 Horário original adicionado:', agendamento.horario);
      }
      
      console.log('✅ Horários finais disponíveis:', horariosFinais);
      setHorariosDisponiveis(horariosFinais);
    } catch (error) {
      console.error("Erro ao carregar horários:", error);
      // Se estiver editando e deu erro, pelo menos mostrar o horário atual
      if (agendamento && agendamento.horario) {
        setHorariosDisponiveis([agendamento.horario]);
      } else {
        setHorariosDisponiveis([]);
      }
    } finally {
      setLoadingHorarios(false);
    }
  }, [medicos, todosAgendamentos, agendamento, formData.tipo_servico, formData.is_encaixe]);

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
    const loadHorarios = async () => {
      let horarios = [];
      
      if (formData.tipo_servico === 'Exame') {
        // Para exames, carregar horários sem depender de médico
        if (formData.data_agendamento) {
          await carregarHorarios(null, formData.data_agendamento);
          return;
        } else {
          setHorariosDisponiveis([]);
          return;
        }
      } else if (formData.tipo_servico === 'Procedimento') {
        // Para procedimentos: se tem médico, usar agenda do médico (trava 1 por horário)
        // Se não tem médico, gerar horários livres
        if (formData.data_agendamento) {
          await carregarHorarios(formData.medico_id || null, formData.data_agendamento);
          return;
        } else {
          setHorariosDisponiveis([]);
          return;
        }
      } else if (formData.tipo_servico === 'Múltiplos Serviços') {
        // Para múltiplos serviços, gerar horários automáticos (7h às 19h a cada 10 min) e filtrar ocupados
        if (formData.data_agendamento) {
          const horariosAutomaticos = [];
          for (let hora = 7; hora <= 18; hora++) {
            for (let minuto = 0; minuto < 60; minuto += 10) {
              const horario = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
              horariosAutomaticos.push(horario);
            }
          }
          horariosAutomaticos.push('19:00');
          
          // Se NÃO for encaixe, filtrar horários já ocupados no mesmo dia
          if (!formData.is_encaixe) {
            const agendamentosNoDia = (todosAgendamentos || []).filter(a => 
              a.data_agendamento === formData.data_agendamento &&
              a.status !== 'Cancelado' &&
              (!agendamento || a.id !== agendamento.id)
            );
            const horariosOcupados = agendamentosNoDia.map(a => a.horario);
            horarios = horariosAutomaticos.filter(h => !horariosOcupados.includes(h)).sort();
          } else {
            horarios = horariosAutomaticos.sort();
          }
        }
      } else if (formData.medico_id && formData.data_agendamento) {
        // For consultations and returns, load based on the doctor
        await carregarHorarios(formData.medico_id, formData.data_agendamento);
        return; // carregarHorarios já seta horariosDisponiveis
      }
      
      // Se estiver editando, garantir que o horário original esteja na lista
      if (agendamento?.horario && !horarios.includes(agendamento.horario)) {
        horarios = [...horarios, agendamento.horario].sort();
      }
      
      setHorariosDisponiveis(horarios);
    };

    loadHorarios();
  }, [formData.medico_id, formData.data_agendamento, formData.tipo_servico, formData.is_encaixe, carregarHorarios, agendamento, todosAgendamentos]);

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
        ? horariosDataEspecifica.filter(h => !h.bloqueado)
        : medicoSelecionado.horarios_atendimento.filter(h => {
            if (h.bloqueado) return false;
            if (h.dia_semana !== diaSemana || h.data_especifica) return false;
            
            // Verificar recorrência
            const recorrencia = h.recorrencia || 'Toda Semana';
            if (recorrencia === 'Toda Semana') return true;
            if (recorrencia === 'Apenas uma vez') return false;
            
            const weekOfMonth = getWeekOfMonth(dataObj);
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
    // Para Exames sem médico, horário é sempre "disponível"
    if (formData.tipo_servico === 'Exame') {
      if (!formData.horario) {
        setHorarioDisponivel(true);
        setMensagemDisponibilidade('');
      } else {
        setHorarioDisponivel(true);
        setMensagemDisponibilidade('Horário selecionado.');
      }
      return;
    }
    
    // Para Procedimentos COM médico, verificar conflito como consulta (1 por horário)
    // Para Procedimentos SEM médico, considerar disponível
    if (formData.tipo_servico === 'Procedimento' && !formData.medico_id) {
      setHorarioDisponivel(true);
      setMensagemDisponibilidade(formData.horario ? 'Horário selecionado.' : '');
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

      // Determinar IDs do grupo unificado (mesma lógica de carregarHorarios)
      const isOdontologia = normalizeString(medicoSelecionado.especialidade) === 'ODONTOLOGIA';
      const isRuben = normalizeString(medicoSelecionado.nome).includes('RUBEN');
      const isMarco = normalizeString(medicoSelecionado.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(medicoSelecionado.nome).includes('MARCO ANTÔNIO DELAZERI');

      let idsParaVerificar = [formData.medico_id];
      if (isOdontologia) {
        idsParaVerificar = medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA').map(m => m.id);
      } else if (isRuben) {
        idsParaVerificar = medicos.filter(m => normalizeString(m.nome).includes('RUBEN') && m.status === 'Ativo').map(m => m.id);
      } else if (isMarco) {
        idsParaVerificar = medicos.filter(m => (normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI')) && m.status === 'Ativo').map(m => m.id);
      }

      // Filter existing appointments that conflict with the selected time across the unified group
      const agendamentosConflitantes = (todosAgendamentos || []).filter(a =>
        idsParaVerificar.includes(a.medico_id) &&
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
  // IMPORTANTE: Não recalcular se o valor já foi definido manualmente (ex: seleção de especialidade do Dr. Ruben)
  const [skipNextPriceRecalc, setSkipNextPriceRecalc] = useState(false);
  
  useEffect(() => {
    // Se o valor já foi setado manualmente, pular este recálculo
    if (skipNextPriceRecalc) {
      console.log('💰 ===== PULANDO RECÁLCULO (valor já definido manualmente) =====');
      setSkipNextPriceRecalc(false);
      return;
    }
    
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
      setFormData(prev => {
        const desconto = parseFloat(prev.desconto_manual) || 0;
        const acrescimo = parseFloat(prev.acrescimo_manual) || 0;
        const valorFinal = Math.max(0, total - desconto + acrescimo);
        return { 
          ...prev, 
          valor_total: total.toFixed(2).toString(),
          valor_final: valorFinal.toFixed(2).toString()
        };
      });
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

      // Recalcular valor final quando desconto ou acréscimo mudar
      if (field === 'desconto_manual' || field === 'acrescimo_manual') {
        const valorBase = parseFloat(newData.valor_total) || 0;
        const desconto = parseFloat(newData.desconto_manual) || 0;
        const acrescimo = parseFloat(newData.acrescimo_manual) || 0;
        newData.valor_final = Math.max(0, valorBase - desconto + acrescimo).toFixed(2).toString();
      }

      return newData;
    });
  };

  const calcularDatasRecorrentes = (dataInicioStr, dataFimStr, recorrenciaTipo) => {
    const datas = []; let d = new Date(dataInicioStr + 'T00:00:00'); const fim = new Date(dataFimStr + 'T00:00:00'); let c = 0;
    while (d <= fim && c < 365) { datas.push(format(d, 'yyyy-MM-dd')); if (recorrenciaTipo === 'Mensal') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + (recorrenciaTipo === 'Quinzenal' ? 15 : 7)); c++; } return datas;
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSalvando(true);

    try {
      const erroValidacao = (msg) => { toast({ title: "Erro", description: msg, variant: "destructive" }); setSalvando(false); return true; };
      if (!formData.paciente_id || !formData.data_agendamento || !formData.horario) { erroValidacao("Preencha todos os campos obrigatórios"); return; }
      if (!formData.categoria_preco_id) { erroValidacao("Selecione uma categoria de preço!"); return; }
      if ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) { erroValidacao("Selecione um médico"); return; }
      if (formData.tipo_servico === 'Procedimento' && !formData.procedimento_id) { erroValidacao("Selecione um procedimento"); return; }
      if (formData.tipo_servico === 'Exame' && (!formData.exames_ids || formData.exames_ids.length === 0)) { erroValidacao("Selecione ao menos um exame"); return; }
      if (formData.tipo_servico === 'Múltiplos Serviços' && (!formData.itens_servico || formData.itens_servico.length === 0)) { erroValidacao("Adicione ao menos um serviço"); return; }
      if (formData.is_recorrente && (!formData.recorrencia_tipo || !formData.recorrencia_data_fim)) { erroValidacao("Para recorrentes, selecione frequência e data final."); return; }

      const pacienteSelecionado = pacientesEncontrados.find(p => p.id === formData.paciente_id);
      const dados = { paciente_id: formData.paciente_id, paciente_nome: pacienteSelecionado?.nome || '', data_agendamento: formData.data_agendamento, horario: formData.horario, tipo_servico: formData.tipo_servico, categoria_preco_id: formData.categoria_preco_id, valor_total: parseFloat(formData.valor_total) || 0, desconto_manual: parseFloat(formData.desconto_manual) || 0, acrescimo_manual: parseFloat(formData.acrescimo_manual) || 0, valor_final: parseFloat(formData.valor_final) || parseFloat(formData.valor_total) || 0, status: formData.status || 'Agendado', forma_pagamento: formData.forma_pagamento || 'Dinheiro', is_encaixe: formData.is_encaixe || false, is_reserva: !formData.paciente_id, is_recorrente: formData.is_recorrente || false, lembrete_equipe: formData.lembrete_equipe || false, lembrete_dias_antes: parseInt(formData.lembrete_dias_antes) || 0 };
      if (formData.duracao_minutos) dados.duracao_minutos = parseInt(formData.duracao_minutos);
      const _dn=formData.observacoes?.match(/Dentista:\s*(.+?)(\n|$)/)?.[1]?.trim(),_dm=_dn&&medicos.find(m=>m.nome===_dn);dados.medico_id=_dm?_dm.id:(formData.medico_id||null);
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

          if (resultado) {
            try {
              const pac = pacientesEncontrados.find(p => p.id === formData.paciente_id);
              const med = medicos.find(m => m.id === formData.medico_id);
              let nomeUsr = 'Sistema'; try { const u = await base44.auth.me(); nomeUsr = u?.display_name || u?.full_name || 'Usuário'; } catch(e) {}
              let nSvc = formData.tipo_servico; if (med) nSvc += ` com Dr(a). ${med.nome}`;
              await Notification.create({ type: 'novo_agendamento', message: `🆕 ${pac?.nome || 'Paciente'} - ${nSvc} - ${formData.data_agendamento} às ${formData.horario}`, data: { agendamentoId: resultado.id, paciente_nome: pac?.nome || 'Paciente', medico_nome: med?.nome || 'N/A', data_agendamento: formData.data_agendamento, horario: formData.horario, tipo_servico: formData.tipo_servico, agendado_por: nomeUsr, agendado_por_tipo: 'usuario' } });
              await Agendamento.update(resultado.id, { agendado_por: nomeUsr, agendado_por_tipo: 'usuario' });
            } catch (e) { console.error('⚠️ Notificação não crítica:', e); }
          }
          toast({ title: "Sucesso!", description: "Agendamento salvo!" }); // Specific toast for single create
        }
      }

      try { const cu = await base44.auth.me(); localStorage.setItem(`agendamento_preconfig_${cu?.id||'default'}`, JSON.stringify({ data_agendamento: formData.data_agendamento, tipo_servico: formData.tipo_servico, medico_id: formData.medico_id || '' })); } catch(e) {}

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

  const adicionarItemServico = (tipo, itemId = null, medicoId = null) => {
    const pc = Array.isArray(categorias) ? categorias.find(c => normalizeString(c.nome) === 'PARTICULAR') : null;
    const isPart = formData.categoria_preco_id === pc?.id;
    let ni = { id: Date.now().toString(), tipo, medico_id: null, procedimento_id: null, exame_id: null, descricao: '', valor: 0 };
    if (tipo === 'Consulta' && medicoId) { const m = medicos.find(x => x.id === medicoId); if (m) { ni.medico_id = medicoId; ni.descricao = `Consulta ${m.especialidade} - Dr(a). ${m.nome}`; ni.valor = buscarPrecoConsulta(medicoId, formData.categoria_preco_id); } }
    else if (tipo === 'Procedimento' && itemId) { const p = procedimentos.find(x => x.id === itemId); if (p) { ni.procedimento_id = itemId; ni.descricao = p.nome; const pr = tabelaPrecos.find(t => t.procedimento_id === itemId && t.categoria_id === formData.categoria_preco_id); ni.valor = pr?.valor || 0; } }
    else if (tipo === 'Exame' && itemId) { const e = exames.find(x => x.id === itemId); if (e) { ni.exame_id = itemId; ni.descricao = e.nome; ni.valor = isPart ? (e.valor_particular || 0) : (e.valor_convenio || e.valor_particular || 0); } }
    if (ni.descricao) { const novos = [...formData.itens_servico, ni]; handleChange('itens_servico', novos); recalcularTotalMultiplosServicos(novos); }
  };
  const removerItemServico = (itemId) => { const novos = formData.itens_servico.filter(i => i.id !== itemId); handleChange('itens_servico', novos); recalcularTotalMultiplosServicos(novos); };
  const recalcularTotalMultiplosServicos = (itens) => { const total = itens.reduce((s, i) => s + (i.valor || 0), 0); setFormData(prev => ({ ...prev, valor_total: total.toFixed(2).toString() })); };

  const handleMouseDownResize = (e) => { e.preventDefault(); setRedimensionandoExames(true); const startY = e.clientY; const startH = alturaListaExames; const onMove = (ev) => setAlturaListaExames(Math.max(100, Math.min(400, startH + (ev.clientY - startY)))); const onUp = () => { setRedimensionandoExames(false); document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }; document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); };

  const handleAnalisarPedidoExame = async () => {
    if (!pedidoExameFile) { toast({ title: "Nenhum arquivo", description: "Selecione um arquivo.", variant: "destructive" }); return; }
    setAnalisando(true); setUploadProgress(0); setUploadStatus('Preparando...');
    try {
      toast({ title: "Iniciando análise...", description: "Enviando arquivo..." });
      const { examesEncontradosIds, examnesEncontradosNomes, examesNaoEncontrados } = await analisarPedidoExame({ pedidoExameFile, exames, formData, setUploadProgress, setUploadStatus, toast });
      if (examesEncontradosIds.length > 0) { handleChange('exames_ids', [...new Set([...formData.exames_ids, ...examesEncontradosIds])]); toast({ title: `✅ ${examesEncontradosIds.length} exame(s) adicionado(s)!`, description: examnesEncontradosNomes.join(', '), duration: 6000 }); }
      if (examesNaoEncontrados.length > 0) { toast({ title: `⚠️ ${examesNaoEncontrados.length} não encontrado(s)`, description: examesNaoEncontrados.join(', '), variant: "destructive", duration: 12000 }); }
      if (examesEncontradosIds.length === 0 && examesNaoEncontrados.length === 0) { toast({ title: "Nenhum exame identificado", variant: "destructive", duration: 6000 }); }
    } catch (error) { toast({ title: "Erro ❌", description: error.message, variant: "destructive", duration: 10000 }); }
    finally { setAnalisando(false); setUploadProgress(0); setUploadStatus(''); setPedidoExameFile(null); const fi = document.getElementById('pedido-exame-input'); if (fi) fi.value = ''; }
  };

  const handleGerarOrcamento = () => gerarOrcamento({ formData, pacientesEncontrados, medicos, procedimentos, exames, categorias });

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
          <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-6 p-1" id="formulario-agendamento">
                         {/* SEÇÃO 1: PACIENTE */}
                         <div className="space-y-3">
                           <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Paciente</h3>
                           <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                             <div>
                               <Label htmlFor="busca_paciente" className="text-sm font-medium">Buscar Paciente *</Label>
                               <div className="flex gap-2 mt-1">
                                 <Input
                                   id="busca_paciente"
                                   placeholder="Nome, CPF ou telefone..."
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
                                   className="bg-gray-700 hover:bg-gray-800"
                                   size="sm"
                                 >
                                   {buscandoPaciente ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                 </Button>
                                 <Button
                                   type="button"
                                   variant="outline"
                                   onClick={() => setCadastroRapidoAberto(true)}
                                   size="sm"
                                   title="Cadastrar novo paciente"
                                 >
                                   <Plus className="w-4 h-4" />
                                 </Button>
                               </div>
                             </div>
                             {pacientesEncontrados.length > 0 && (
                               <div>
                                 <Label htmlFor="paciente_id" className="text-sm font-medium">Selecione ({pacientesEncontrados.length} encontrados)</Label>
                                 <Select 
                                   name="paciente_id" 
                                   value={formData.paciente_id} 
                                   onValueChange={(value) => handleChange('paciente_id', value)} 
                                   required
                                 >
                                   <SelectTrigger id="paciente_id" className="mt-1">
                                     <SelectValue placeholder="Escolha o paciente da lista" />
                                   </SelectTrigger>
                                   <SelectContent>
                                     {pacientesEncontrados.map((p) => (
                                       <SelectItem key={p.id} value={p.id}>
                                         {p.nome} {p.cpf ? `- ${p.cpf}` : ''} {p.telefone ? `- ${p.telefone}` : ''}
                                       </SelectItem>
                                     ))}
                                   </SelectContent>
                                 </Select>
                               </div>
                             )}
                           </div>
                         </div>

                         {/* SEÇÃO 2: AGENDAMENTO */}
                         <div className="space-y-3">
                           <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Detalhes do Agendamento</h3>
                           <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                 <Label htmlFor="data_agendamento">Data *</Label>
                                 <Popover>
                                   <PopoverTrigger asChild>
                                     <Button
                                       variant={"outline"}
                                       className={`w-full justify-start text-left font-normal mt-1 ${!formData.data_agendamento && "text-muted-foreground"}`}
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
                                       onSelect={(date) => { if (date) { handleChange('data_agendamento', format(date, 'yyyy-MM-dd')) } }}
                                       modifiers={modifiers}
                                       modifiersClassNames={modifiersClassNames}
                                       initialFocus
                                       locale={ptBR}
                                     />
                                   </PopoverContent>
                                 </Popover>
                                 {(!formData.medico_id && (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno')) && (
                                   <p className="text-xs text-amber-600 mt-1">Selecione um médico para ver os dias.</p>
                                 )}
                               </div>
                               <div>
                                 <Label htmlFor="horario">Horário *</Label>
                                 <Select 
                                   name="horario" 
                                   value={formData.horario} 
                                   onValueChange={(value) => handleChange('horario', value)} 
                                   disabled={loadingHorarios || ((formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && !formData.medico_id) || !formData.data_agendamento}
                                 >
                                   <SelectTrigger id="horario" className="mt-1"><SelectValue placeholder={loadingHorarios ? "Carregando..." : "Selecione..."} /></SelectTrigger>
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
                                 {mensagemDisponibilidade && <p className={`text-xs mt-1 ${horarioDisponivel ? 'text-gray-600' : 'text-red-600'}`}>{mensagemDisponibilidade}</p>}
                               </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                 <Label htmlFor="tipo_servico">Tipo de Serviço *</Label>
                                 <Select name="tipo_servico" value={formData.tipo_servico} onValueChange={(value) => { handleChange('tipo_servico', value); if (value !== 'Múltiplos Serviços') { setModoMultiplosServicos(false); handleChange('itens_servico', []); } }}>
                                   <SelectTrigger id="tipo_servico" className="mt-1"><SelectValue /></SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="Consulta">Consulta</SelectItem>
                                     <SelectItem value="Retorno">Retorno</SelectItem>
                                     <SelectItem value="Procedimento">Procedimento</SelectItem>
                                     <SelectItem value="Exame">Exame</SelectItem>
                                     <SelectItem value="Múltiplos Serviços">Múltiplos Serviços</SelectItem>
                                   </SelectContent>
                                 </Select>
                               </div>
                               {(formData.tipo_servico === 'Retorno' || formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Procedimento') && (
                                   <div>
                                     <Label htmlFor="medico_id">{medicos.some(m => normalizeString(m.especialidade) === 'ODONTOLOGIA') && formData.tipo_servico !== 'Procedimento' ? 'Especialidade *' : formData.tipo_servico === 'Procedimento' ? 'Médico (Opcional)' : 'Médico *'}</Label>
                                     <Select name="medico_id" value={(() => {
                                         const mR = medicos.filter(m => normalizeString(m.nome).includes('RUBEN'));
                                         if (mR.length > 1 && mR.some(m => m.id === formData.medico_id)) return mR[0].id;
                                         const mM = medicos.filter(m => normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI'));
                                         if (mM.length > 1 && mM.some(m => m.id === formData.medico_id)) return mM[0].id;
                                         return formData.medico_id;
                                       })()} onValueChange={(value) => handleChange('medico_id', value)}>
                                       <SelectTrigger id="medico_id" className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                       <SelectContent>
                                         {(() => {
                                           const mO = medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA');
                                           const mRu = medicos.filter(m => normalizeString(m.nome).includes('RUBEN'));
                                           const mMa = medicos.filter(m => normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI'));
                                           const outros = medicos.filter(m => normalizeString(m.especialidade) !== 'ODONTOLOGIA' && !normalizeString(m.nome).includes('RUBEN') && !normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') && !normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI'));
                                           const r = [];
                                           if (mO.length > 1) r.push(<SelectItem key="odonto-u" value={mO[0].id}>🦷 Odontologia (Agenda Unificada)</SelectItem>);
                                           else mO.forEach(m => r.push(<SelectItem key={m.id} value={m.id}>Dr(a). {m.nome} - {m.especialidade}</SelectItem>));
                                           if (mRu.length > 1) r.push(<SelectItem key="ruben-u" value={mRu[0].id}>🩺 Dr. Ruben Hurtado (Múltiplas Esp.)</SelectItem>);
                                           else if (mRu.length === 1) r.push(<SelectItem key={mRu[0].id} value={mRu[0].id}>Dr(a). {mRu[0].nome} - {mRu[0].especialidade}</SelectItem>);
                                           if (mMa.length > 1) r.push(<SelectItem key="marco-u" value={mMa[0].id}>🩺 Dr. Marco A. Delazeri (Múltiplas Esp.)</SelectItem>);
                                           else if (mMa.length === 1) r.push(<SelectItem key={mMa[0].id} value={mMa[0].id}>Dr(a). {mMa[0].nome} - {mMa[0].especialidade}</SelectItem>);
                                           outros.forEach(m => r.push(<SelectItem key={m.id} value={m.id}>Dr(a). {m.nome} - {m.especialidade}</SelectItem>));
                                           return r;
                                         })()}
                                       </SelectContent>
                                     </Select>
                                   </div>
                                 )}
                             </div>

                             {/* Seletor de profissional específico para Odontologia */}
                             {(() => {
                               const medicoSelecionado = medicos.find(m => m.id === formData.medico_id);
                               const medicosOdontologia = medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA');

                               if (medicoSelecionado && 
                                   normalizeString(medicoSelecionado.especialidade) === 'ODONTOLOGIA' && 
                                   medicosOdontologia.length > 1 &&
                                   (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno' || formData.tipo_servico === 'Procedimento' || formData.tipo_servico === 'Exame')) {
                                   return (
                                   <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                     <Label htmlFor="dentista_especifico" className="text-blue-800 font-medium flex items-center gap-2">
                                       🦷 Selecione o Dentista para este agendamento
                                     </Label>
                                     <Select 
                                       value={formData.observacoes?.includes('Dentista:') ? formData.observacoes.split('Dentista:')[1]?.split('\n')[0]?.trim() : ''} 
                                       onValueChange={(value) => {
                                         // Salvar o dentista selecionado nas observações
                                         const obsAtual = formData.observacoes || '';
                                         const obsLimpa = obsAtual.replace(/Dentista:.*(\n|$)/g, '').trim();
                                         const novaObs = obsLimpa ? `${obsLimpa}\nDentista: ${value}` : `Dentista: ${value}`;
                                         handleChange('observacoes', novaObs);
                                       }}
                                     >
                                       <SelectTrigger id="dentista_especifico" className="mt-2 bg-white">
                                         <SelectValue placeholder="Escolha o dentista..." />
                                       </SelectTrigger>
                                       <SelectContent>
                                         {medicosOdontologia.map(d => (
                                           <SelectItem key={d.id} value={d.nome}>
                                             Dr(a). {d.nome}
                                           </SelectItem>
                                         ))}
                                       </SelectContent>
                                     </Select>
                                     <p className="text-xs text-blue-600 mt-2">
                                       A agenda de Odontologia é unificada. Selecione qual dentista irá atender.
                                     </p>
                                   </div>
                                 );
                               }
                               return null;
                             })()}

                             {/* Seletor de especialidade para médicos com múltiplas especialidades */}
                             {(() => {
                               const ms = medicos.find(m => m.id === formData.medico_id);
                               const mR = medicos.filter(m => normalizeString(m.nome).includes('RUBEN') && m.status === 'Ativo');
                               const mM = medicos.filter(m => (normalizeString(m.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(m.nome).includes('MARCO ANTÔNIO DELAZERI')) && m.status === 'Ativo');
                               const isR = ms && normalizeString(ms.nome).includes('RUBEN') && mR.length > 1;
                               const isM = ms && (normalizeString(ms.nome).includes('MARCO ANTONIO DELAZERI') || normalizeString(ms.nome).includes('MARCO ANTÔNIO DELAZERI')) && mM.length > 1;
                               if (!(isR || isM) || !(formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno')) return null;
                               const mList = isR ? mR : mM;
                               const nomeM = isR ? 'Dr. Ruben' : 'Dr. Marco Antônio';
                               const espObs = formData.observacoes?.match(/Especialidade:\s*(.+?)(\n|$)/)?.[1]?.trim();
                               const espAtual = espObs || ms.especialidade || '';
                               return (
                                 <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                                   <Label htmlFor="especialidade_multipla" className="text-green-800 font-medium flex items-center gap-2">🩺 Selecione a Especialidade *</Label>
                                   <Select value={espAtual} onValueChange={(value) => {
                                     const mEsp = mList.find(m => m.especialidade === value);
                                     if (!mEsp) return;
                                     const obsAtual = formData.observacoes || '';
                                     const obsLimpa = obsAtual.replace(/Especialidade:.*(\n|$)/g, '').trim();
                                     const novaObs = obsLimpa ? `${obsLimpa}\nEspecialidade: ${value}` : `Especialidade: ${value}`;
                                     const espNorm = normalizeString(mEsp.especialidade);
                                     const procC = procedimentos.find(p => { const n = normalizeString(p.nome); return n.includes('CONSULTA') && p.especialidade && normalizeString(p.especialidade) === espNorm; });
                                     let preco = 0;
                                     if (procC) { const tp = tabelaPrecos.find(t => t.procedimento_id === procC.id && t.categoria_id === formData.categoria_preco_id); if (tp) preco = tp.valor; }
                                     const desc = parseFloat(formData.desconto_manual) || 0;
                                     const acre = parseFloat(formData.acrescimo_manual) || 0;
                                     setSkipNextPriceRecalc(true);
                                     setFormData(prev => ({ ...prev, medico_id: mEsp.id, observacoes: novaObs, valor_total: preco.toFixed(2).toString(), valor_final: Math.max(0, preco - desc + acre).toFixed(2).toString() }));
                                   }}>
                                     <SelectTrigger id="especialidade_multipla" className="mt-2 bg-white"><SelectValue placeholder="Escolha a especialidade..." /></SelectTrigger>
                                     <SelectContent>{mList.map(m => <SelectItem key={m.id} value={m.especialidade}>{m.especialidade}</SelectItem>)}</SelectContent>
                                   </Select>
                                   <p className="text-xs text-green-600 mt-2">{nomeM} atende em múltiplas especialidades com preços diferentes.</p>
                                 </div>
                               );
                             })()}

                             <div className="flex items-center space-x-6 pt-2">
                               <div className="flex items-center space-x-2">
                                 <Checkbox id="is_encaixe" checked={formData.is_encaixe} onCheckedChange={(checked) => handleChange('is_encaixe', checked)} />
                                 <label htmlFor="is_encaixe" className="text-sm font-medium cursor-pointer">Encaixe</label>
                               </div>
                               {!agendamento && (formData.tipo_servico === 'Consulta' || formData.tipo_servico === 'Retorno') && (
                                 <div className="flex items-center space-x-2">
                                   <Checkbox id="is_recorrente" checked={formData.is_recorrente} onCheckedChange={(checked) => { handleChange('is_recorrente', checked); if (!checked) { handleChange('recorrencia_tipo', ''); handleChange('recorrencia_data_fim', ''); } }} />
                                   <label htmlFor="is_recorrente" className="text-sm font-medium cursor-pointer">Recorrente</label>
                                 </div>
                               )}
                             </div>

                             {formData.is_recorrente && !agendamento && (
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-3 bg-gray-100 rounded-md">
                                 <div>
                                   <Label htmlFor="recorrencia_tipo">Frequência *</Label>
                                   <Select value={formData.recorrencia_tipo} onValueChange={(value) => handleChange('recorrencia_tipo', value)}>
                                     <SelectTrigger id="recorrencia_tipo" className="mt-1">
                                       <SelectValue placeholder="Selecione a frequência" />
                                     </SelectTrigger>
                                     <SelectContent>
                                       <SelectItem value="Semanal">Semanal</SelectItem>
                                       <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                                       <SelectItem value="Mensal">Mensal</SelectItem>
                                     </SelectContent>
                                   </Select>
                                 </div>
                                 <div>
                                   <Label htmlFor="recorrencia_data_fim">Repetir até *</Label>
                                   <Popover>
                                     <PopoverTrigger asChild>
                                       <Button variant="outline" className="w-full justify-start text-left font-normal mt-1">
                                         <CalendarIcon className="mr-2 h-4 w-4" />
                                         {formData.recorrencia_data_fim ? format(new Date(formData.recorrencia_data_fim + 'T00:00:00'), "PPP", { locale: ptBR }) : <span>Selecione a data final</span>}
                                       </Button>
                                     </PopoverTrigger>
                                     <PopoverContent className="w-auto p-0">
                                       <Calendar mode="single" selected={formData.recorrencia_data_fim ? new Date(formData.recorrencia_data_fim + 'T00:00:00') : undefined} onSelect={(date) => { if (date) { handleChange('recorrencia_data_fim', format(date, 'yyyy-MM-dd')); } }} disabled={(date) => date < new Date(formData.data_agendamento + 'T00:00:00')} initialFocus locale={ptBR} />
                                     </PopoverContent>
                                   </Popover>
                                 </div>
                               </div>
                             )}
                           </div>
                         </div>

                         {formData.tipo_servico === 'Procedimento' && (
                           <div className="space-y-3">
                             <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Procedimento</h3>
                             <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                               <div>
                                 <Label htmlFor="busca_procedimento">Buscar Procedimento</Label>
                                 <Input id="busca_procedimento" placeholder="Digite o nome..." value={buscaProcedimento} onChange={(e) => setBuscaProcedimento(e.target.value)} className="mt-1" />
                               </div>
                               <div>
                                 <Label htmlFor="procedimento_id">Procedimento *</Label>
                                 <Select value={formData.procedimento_id} onValueChange={(value) => handleChange('procedimento_id', value)}>
                                   <SelectTrigger id="procedimento_id" className="mt-1">
                                     <SelectValue placeholder="Selecione..." />
                                   </SelectTrigger>
                                   <SelectContent>
                                     {procedimentosFiltrados.length === 0 ? (
                                       <SelectItem value="none" disabled>Nenhum encontrado</SelectItem>
                                     ) : (
                                       procedimentosFiltrados.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)
                                     )}
                                   </SelectContent>
                                 </Select>
                               </div>
                             </div>
                           </div>
                         )}

                         {formData.tipo_servico === 'Exame' && (
                          <div className="space-y-3">
                            <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Exames</h3>
                            <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                              {/* Análise de requisição com IA */}
                              <div className="p-3 border-2 border-dashed border-blue-300 bg-blue-50 rounded-lg space-y-2">
                                <Label className="text-blue-800 font-medium flex items-center gap-2">
                                  <FileScan className="w-4 h-4" />
                                  Importar Requisição de Exames (IA)
                                </Label>
                                <p className="text-xs text-blue-600">Envie uma foto ou PDF da requisição médica. A IA identificará os exames e adicionará automaticamente.</p>
                                <div className="flex gap-2">
                                  <Input
                                    id="pedido-exame-input"
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    onChange={(e) => setPedidoExameFile(e.target.files?.[0] || null)}
                                    disabled={analisando}
                                    className="flex-1 bg-white"
                                  />
                                  <Button
                                    type="button"
                                    onClick={handleAnalisarPedidoExame}
                                    disabled={analisando || !pedidoExameFile}
                                    className="bg-blue-600 hover:bg-blue-700 gap-2"
                                    size="sm"
                                  >
                                    {analisando ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {uploadStatus || 'Analisando...'}
                                      </>
                                    ) : (
                                      <>
                                        <FileScan className="w-4 h-4" />
                                        Analisar
                                      </>
                                    )}
                                  </Button>
                                </div>
                                {analisando && uploadProgress > 0 && (
                                  <div className="w-full bg-blue-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                                      style={{ width: `${uploadProgress}%` }}
                                    />
                                  </div>
                                )}
                              </div>

                              <div>
                                <Label htmlFor="busca_exame">Buscar Exame</Label>
                                <Input 
                                  id="busca_exame" 
                                  placeholder="Digite o nome do exame..." 
                                  value={buscaExame} 
                                  onChange={(e) => setBuscaExame(e.target.value)} 
                                  className="mt-1" 
                                />
                              </div>
                              <div>
                                <Label>Adicionar Exame</Label>
                                <Select onValueChange={adicionarExame} value="">
                                  <SelectTrigger><SelectValue placeholder="Selecione um exame para adicionar..." /></SelectTrigger>
                                  <SelectContent>
                                    {examesFiltrados.filter(e => !formData.exames_ids.includes(e.id)).length === 0 ? (
                                      <SelectItem value="none" disabled>Nenhum exame encontrado</SelectItem>
                                    ) : (
                                      examesFiltrados.filter(e => !formData.exames_ids.includes(e.id)).map(e => (
                                        <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                                      ))
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              {selectedExames.length > 0 && (
                                <div>
                                  <Label className="font-medium">Selecionados ({selectedExames.length})</Label>
                                  <div className="space-y-2 mt-2">
                                    {selectedExames.map(exame => (
                                      <div key={exame.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                        <div className="flex-1">
                                          <span className="text-sm">{exame.nome}</span>
                                          <span className="text-xs text-gray-500 ml-2">R$ {exame.display_valor?.toFixed(2).replace('.', ',') || '0,00'}</span>
                                        </div>
                                        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removerExame(exame.id)}>
                                          <X className="w-4 h-4" />
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                         )}

                         {formData.tipo_servico === 'Múltiplos Serviços' && (
                           <div className="space-y-3">
                             <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Serviços ({formData.itens_servico.length})</h3>
                             <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                               <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                 <Select value={servicoParaAdicionar.tipo} onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, tipo: v, id: '', medicoId: '' }))}>
                                   <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="Consulta">Consulta</SelectItem>
                                     <SelectItem value="Procedimento">Procedimento</SelectItem>
                                     <SelectItem value="Exame">Exame</SelectItem>
                                   </SelectContent>
                                 </Select>
                                 {servicoParaAdicionar.tipo === 'Consulta' ? (
                                   <Select value={servicoParaAdicionar.medicoId} onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, medicoId: v }))}>
                                     <SelectTrigger><SelectValue placeholder="Médico" /></SelectTrigger>
                                     <SelectContent>
                                       {medicos.map(m => <SelectItem key={m.id} value={m.id}>Dr(a). {m.nome}</SelectItem>)}
                                     </SelectContent>
                                   </Select>
                                 ) : servicoParaAdicionar.tipo === 'Procedimento' ? (
                                   <Select value={servicoParaAdicionar.id} onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, id: v }))}>
                                     <SelectTrigger><SelectValue placeholder="Procedimento" /></SelectTrigger>
                                     <SelectContent>
                                       {procedimentos.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                                     </SelectContent>
                                   </Select>
                                 ) : servicoParaAdicionar.tipo === 'Exame' ? (
                                   <Select value={servicoParaAdicionar.id} onValueChange={(v) => setServicoParaAdicionar(prev => ({ ...prev, id: v }))}>
                                     <SelectTrigger><SelectValue placeholder="Exame" /></SelectTrigger>
                                     <SelectContent>
                                       {exames.map(e => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}
                                     </SelectContent>
                                   </Select>
                                 ) : null}
                                 <Button type="button" onClick={() => { if (servicoParaAdicionar.tipo === 'Consulta' && servicoParaAdicionar.medicoId) { adicionarItemServico('Consulta', null, servicoParaAdicionar.medicoId); } else if (servicoParaAdicionar.tipo === 'Procedimento' && servicoParaAdicionar.id) { adicionarItemServico('Procedimento', servicoParaAdicionar.id); } else if (servicoParaAdicionar.tipo === 'Exame' && servicoParaAdicionar.id) { adicionarItemServico('Exame', servicoParaAdicionar.id); } setServicoParaAdicionar({ tipo: '', id: '', medicoId: '' }); }}>
                                   <Plus className="w-4 h-4" />
                                 </Button>
                               </div>
                               {formData.itens_servico.length > 0 && (
                                 <div className="space-y-2">
                                   {formData.itens_servico.map(item => (
                                     <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                       <div className="flex-1">
                                         <p className="text-sm font-medium">{item.descricao}</p>
                                         <p className="text-xs text-gray-500">R$ {item.valor.toFixed(2).replace('.', ',')}</p>
                                       </div>
                                       <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removerItemServico(item.id)}>
                                         <Trash2 className="w-4 h-4 text-red-500" />
                                       </Button>
                                     </div>
                                   ))}
                                 </div>
                               )}
                             </div>
                           </div>
                         )}

                         {/* SEÇÃO VALORES E PAGAMENTO */}
                         <div className="space-y-3">
                           <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Valores e Pagamento</h3>
                           <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                 <Label htmlFor="categoria_preco_id">Categoria de Preço *</Label>
                                 <Select name="categoria_preco_id" value={formData.categoria_preco_id} onValueChange={(value) => handleChange('categoria_preco_id', value)}>
                                   <SelectTrigger id="categoria_preco_id" className="mt-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                                   <SelectContent>
                                     {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                                   </SelectContent>
                                 </Select>
                               </div>
                               <div>
                                 <Label htmlFor="valor_total">Valor Base (R$)</Label>
                                 <Input id="valor_total" name="valor_total" value={formData.valor_total} readOnly className="mt-1 bg-gray-100" />
                                 <p className="text-xs text-gray-500 mt-1">Calculado automaticamente</p>
                               </div>
                             </div>

                             <div className="space-y-2 pt-4 border-t">
                                <Label className="font-medium text-gray-700">Ajustes de Valor</Label>
                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                   <div>
                                     <Label htmlFor="desconto_manual" className="text-sm">Desconto (R$)</Label>
                                     <Input id="desconto_manual" name="desconto_manual" value={formData.desconto_manual} onChange={(e) => handleChange('desconto_manual', e.target.value)} type="number" step="0.01" min="0" placeholder="0,00" />
                                   </div>
                                   <div>
                                     <Label htmlFor="acrescimo_manual" className="text-sm">Acréscimo (R$)</Label>
                                     <Input id="acrescimo_manual" name="acrescimo_manual" value={formData.acrescimo_manual} onChange={(e) => handleChange('acrescimo_manual', e.target.value)} type="number" step="0.01" min="0" placeholder="0,00" />
                                   </div>
                                   <div>
                                     <Label htmlFor="valor_final" className="text-sm font-bold">Valor Final (R$)</Label>
                                     <Input id="valor_final" name="valor_final" value={formData.valor_final} readOnly className="bg-gray-200 font-bold" />
                                   </div>
                                 </div>
                             </div>

                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                               <div>
                                 <Label htmlFor="forma_pagamento">Forma de Pagamento</Label>
                                 <Select name="forma_pagamento" value={formData.forma_pagamento} onValueChange={(value) => {
                                   handleChange('forma_pagamento', value);
                                   if (value !== 'Múltiplas Formas') {
                                     setPagamento1({ forma: '', valor: '' });
                                     setPagamento2({ forma: '', valor: '' });
                                   }
                                 }}>
                                   <SelectTrigger id="forma_pagamento" className="mt-1"><SelectValue /></SelectTrigger>
                                   <SelectContent>
                                     <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                                     <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                                     <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                                     <SelectItem value="PIX">PIX</SelectItem>
                                     <SelectItem value="Transferência">Transferência</SelectItem>
                                     <SelectItem value="Convênio">Convênio</SelectItem>
                                     <SelectItem value="Múltiplas Formas">Múltiplas Formas</SelectItem>
                                   </SelectContent>
                                 </Select>
                                 </div>
                                 <div>
                                 <Label htmlFor="status">Status</Label>
                                 <Select value={formData.status} onValueChange={(v) => handleChange('status', v)}>
                                   <SelectTrigger id="status" className="mt-1"><SelectValue /></SelectTrigger>
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

                             {formData.forma_pagamento === 'Múltiplas Formas' && (
                               <div className="p-4 border-2 border-purple-200 bg-purple-50 rounded-lg space-y-4">
                                 <h4 className="font-medium text-purple-900">Detalhar Formas de Pagamento</h4>
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
                                     <Input type="number" step="0.01" min="0" placeholder="0,00" value={pagamento1.valor} onChange={(e) => setPagamento1(prev => ({ ...prev, valor: e.target.value }))} />
                                   </div>
                                 </div>
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
                                     <Input type="number" step="0.01" min="0" placeholder="0,00" value={pagamento2.valor} onChange={(e) => setPagamento2(prev => ({ ...prev, valor: e.target.value }))} />
                                   </div>
                                 </div>
                                 {(pagamento1.valor || pagamento2.valor) && (
                                   <div className="pt-2 border-t border-purple-300">
                                     <div className="flex justify-between text-sm">
                                       <span className="text-purple-800">Total informado:</span>
                                       <span className="font-bold text-purple-900">
                                         R$ {((parseFloat(pagamento1.valor) || 0) + (parseFloat(pagamento2.valor) || 0)).toFixed(2).replace('.', ',')}
                                       </span>
                                     </div>
                                   </div>
                                 )}
                               </div>
                             )}
                             </div>
                             </div>

                             {/* SEÇÃO OBSERVAÇÕES */}
                         <div className="space-y-3">
                           <h3 className="text-base font-semibold text-gray-800 border-b pb-2">Outras Informações</h3>
                           <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
                             <div>
                               <Label htmlFor="observacoes">Observações</Label>
                               <Textarea id="observacoes" name="observacoes" value={formData.observacoes} onChange={(e) => handleChange('observacoes', e.target.value)} placeholder="Alergias, pedidos especiais, etc." className="mt-1" />
                             </div>
                             <div className="flex items-center space-x-2">
                               <Checkbox id="lembrete_equipe" checked={formData.lembrete_equipe} onCheckedChange={(checked) => handleChange('lembrete_equipe', checked)} />
                               <Label htmlFor="lembrete_equipe" className="cursor-pointer font-medium">Lembrete à equipe</Label>
                             </div>
                           </div>
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

      <CadastroRapidoDialog open={cadastroRapidoAberto} onClose={setCadastroRapidoAberto} novoPacienteRapido={novoPacienteRapido} setNovoPacienteRapido={setNovoPacienteRapido} salvandoPacienteRapido={salvandoPacienteRapido} onSave={handleCriarPacienteRapido} categorias={categorias} />
    </>
  );
}