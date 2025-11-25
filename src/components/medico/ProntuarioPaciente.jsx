
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Prontuario, Agendamento, Exame, ArquivoPaciente, ModeloPrescricao, Medico } from "@/entities/all"; // Adicionado ModeloPrescricao, Medico
import { Save, X, User, Calendar, Phone, AlertCircle, FileText, Clock, Download, Pill, TestTube, Plus, Trash2, Printer, Mic, Square, Play, Upload, Image as ImageIcon, Loader2, Shield, Sparkles } from "lucide-react"; // Adicionado Upload, ImageIcon, Loader2, Shield, Sparkles
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UploadFile, InvokeLLM } from "@/integrations/Core"; // Adicionado UploadFile, InvokeLLM
import CapturaAssinatura from "../assinatura/CapturaAssinatura"; // Adicionado CapturaAssinatura

const prioridadeColors = {
  "Normal": "bg-gray-100 text-gray-700",
  "Idoso (60+ anos)": "bg-blue-100 text-blue-700",
  "Deficiente Físico": "bg-purple-100 text-purple-700",
  "Gestante": "bg-pink-100 text-pink-700",
  "Lactante": "bg-green-100 text-green-700",
  "Criança de Colo": "bg-orange-100 text-orange-700",
  "Pessoa com Criança de Colo": "bg-red-100 text-red-700"
};

const calcularIdade = (dataNascimento) => {
  if (!dataNascimento) return "Não informado";
  const hoje = new Date();
  const nascimento = new Date(dataNascimento);
  const idade = hoje.getFullYear() - nascimento.getFullYear();
  const m = hoje.getMonth() - nascimento.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
    return idade - 1;
  }
  return idade;
};

// Templates ATUALIZADOS sem linhas
const receituarioTemplates = {
  simples: `NOME DO PACIENTE: [PACIENTE]
DATA: [DATA]

USO ORAL
------------------------------------------------------------------------------------------------

1 - 

2 - 

`,
  
  especial: `RECEITUÁRIO DE CONTROLE ESPECIAL

IDENTIFICAÇÃO DO EMITENTE:
NOME: Dr(a). [MEDICO]
CRM: [CRM]
ENDEREÇO: [ENDERECO_CLINICA]
TELEFONE: [TELEFONE_CLINICA]

IDENTIFICAÇÃO DO PACIENTE:
NOME: [PACIENTE]
ENDEREÇO: [ENDERECO_PACIENTE]

PRESCRIÇÃO:

1 - 

2 - 

DATA DA EMISSÃO: [DATA]`
};

export default function ProntuarioPaciente({ 
  paciente, 
  agendamento, 
  medico,
  aberto, 
  onFechar,
  onFinalizarConsulta 
}) {
  const [dadosProntuario, setDadosProntuario] = useState({
    perfil_paciente: '', // NOVO: Campo para o perfil do paciente
    queixa_principal: '',
    historico_doenca_atual: '',
    anamnese_dirigida: [], 
    exame_fisico: '',
    hipotese_diagnostica: '',
    conduta: '',
    prescricao_simples: '', 
    prescricao_especial: '', 
    solicitacao_exames: '',
    exames_solicitados: [] 
  });
  const [historicoConsultas, setHistoricoConsultas] = useState([]);
  const [examesDisponiveis, setExamesDisponiveis] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [novaPerguntaAnamnese, setNovaPerguntaAnamnese] = useState(''); 
  
  // Estados para gravação de voz
  const [isRecording, setIsRecording] = useState(false);
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  const [transcricaoTemp, setTranscricaoTemp] = useState('');
  const [campoGravacao, setCampoGravacao] = useState(null); // qual campo está sendo gravado
  const recognitionRef = useRef(null);

  // Estados para Arquivos
  const [arquivosPaciente, setArquivosPaciente] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [novoArquivo, setNovoArquivo] = useState(null);
  const [descricaoNovoArquivo, setDescricaoNovoArquivo] = useState('');
  const [tipoNovoArquivo, setTipoNovoArquivo] = useState('Imagem');

  // Estados para Modelos de Prescrição
  const [modelosPrescricao, setModelosPrescricao] = useState([]);
  const [mostrarFormModelo, setMostrarFormModelo] = useState(false);
  const [novoModelo, setNovoModelo] = useState({
    medicamento: '',
    concentracao: '',
    posologia: '',
    duracao: '',
    observacoes: '',
    tipo_receituario: 'simples'
  });

  // Estados para Assinatura Eletrônica
  const [mostrarAssinatura, setMostrarAssinatura] = useState(false);
  const [tipoDocumentoAssinar, setTipoDocumentoAssinar] = useState('');
  const [conteudoDocumentoAssinar, setConteudoDocumentoAssinar] = useState('');

  // Novo estado para IA de organização de queixa
  const [organizandoQueixa, setOrganizandoQueixa] = useState(false);

  useEffect(() => {
    // Configurar reconhecimento de voz
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechRecognitionSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'pt-BR';
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setTranscricaoTemp('');
      };
      
      recognition.onend = () => {
        setIsRecording(false);
        setCampoGravacao(null);
      };
      
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setCampoGravacao(null);
      };
      
      recognition.onresult = (event) => {
        let transcricaoCompleta = '';
        for (let i = 0; i < event.results.length; i++) {
          transcricaoCompleta += event.results[i][0].transcript;
        }
        setTranscricaoTemp(transcricaoCompleta);
      };
      
      recognitionRef.current = recognition;
    }

    const carregarDados = async () => {
      if (!aberto || !paciente) return;
      
      try {
        setLoading(true);
        
        const [historico, exames, arquivos, modelos] = await Promise.all([
          // Busca o histórico e ordena pela data de atendimento decrescente para pegar o mais recente primeiro
          Prontuario.filter({ paciente_id: paciente.id }, "-data_atendimento").catch(() => []),
          Exame.filter({ status: "Ativo" }).catch(() => []),
          ArquivoPaciente.filter({ paciente_id: paciente.id }, "-created_date").catch(() => []), // Carregar arquivos
          ModeloPrescricao.filter({ medico_id: medico.id }).catch(() => []) // Carregar modelos do médico
        ]);
        
        const historicoArray = Array.isArray(historico) ? historico : [];
        setHistoricoConsultas(historicoArray.slice(0, 5));
        setExamesDisponiveis(Array.isArray(exames) ? exames : []);
        setArquivosPaciente(Array.isArray(arquivos) ? arquivos : []); // Setar arquivos
        setModelosPrescricao(Array.isArray(modelos) ? modelos : []); // Setar modelos

        // Pré-preenche o perfil com o último registrado, se houver
        const ultimoPerfil = historicoArray.find(h => h.perfil_paciente)?.perfil_paciente;
        if (ultimoPerfil) {
          handleInputChange('perfil_paciente', ultimoPerfil);
        }

      } catch (error) {
        console.error("Erro ao carregar dados:", error);
        setHistoricoConsultas([]);
        setExamesDisponiveis([]);
        setArquivosPaciente([]); // Limpar em caso de erro
        setModelosPrescricao([]); // Limpar em caso de erro
      } finally {
        setLoading(false);
      }
    };

    carregarDados();
  }, [aberto, paciente, medico.id]); // Adicionado medico.id como dependência

  const iniciarGravacao = (campo) => {
    if (!recognitionRef.current || isRecording) return;
    
    setCampoGravacao(campo);
    setTranscricaoTemp('');
    recognitionRef.current.start();
  };

  const pararGravacao = () => {
    if (!recognitionRef.current || !isRecording) return;
    
    recognitionRef.current.stop();
  };

  const inserirTranscricao = () => {
    if (!transcricaoTemp || !campoGravacao) return;
    
    const textoAtual = dadosProntuario[campoGravacao] || '';
    const novoTexto = textoAtual ? `${textoAtual}\n\n${transcricaoTemp}` : transcricaoTemp;
    
    handleInputChange(campoGravacao, novoTexto);
    setTranscricaoTemp('');
    setCampoGravacao(null);
  };

  const descartarTranscricao = () => {
    setTranscricaoTemp('');
    setCampoGravacao(null);
  };

  const handleSalvarProntuario = async () => {
    try {
      setSalvando(true);
      
      const prontuarioData = {
        paciente_id: paciente.id,
        agendamento_id: agendamento.id,
        medico_id: medico.id,
        data_atendimento: format(new Date(), "yyyy-MM-dd"),
        perfil_paciente: dadosProntuario.perfil_paciente, // NOVO: Salva o perfil do paciente
        queixa_principal: dadosProntuario.queixa_principal,
        historico_doenca_atual: dadosProntuario.historico_doenca_atual,
        anamnese_dirigida: dadosProntuario.anamnese_dirigida, 
        exame_fisico: dadosProntuario.exame_fisico,
        hipotese_diagnostica: dadosProntuario.hipotese_diagnostica,
        conduta: dadosProntuario.conduta,
        prescricao_simples: dadosProntuario.prescricao_simples, 
        prescricao_especial: dadosProntuario.prescricao_especial,
        solicitacao_exames: dadosProntuario.solicitacao_exames,
        exames_solicitados: dadosProntuario.exames_solicitados,
      };

      await Prontuario.create(prontuarioData);
      
      // Finalizar a consulta
      await Agendamento.update(agendamento.id, { 
        status: "Finalizado",
        data_fim_atendimento: new Date().toISOString()
      });

      onFinalizarConsulta();
      onFechar();
      
    } catch (error) {
      console.error("Erro ao salvar prontuário:", error);
      alert("Erro ao salvar prontuário: " + error.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleInputChange = (campo, valor) => {
    setDadosProntuario(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  // --- NOVAS FUNÇÕES PARA O CHECKLIST ---
  const handleAdicionarPergunta = () => {
    if (novaPerguntaAnamnese.trim() === '') return;
    const novaLista = [
      ...(dadosProntuario.anamnese_dirigida || []),
      { pergunta: novaPerguntaAnamnese.trim(), checked: false }
    ];
    handleInputChange('anamnese_dirigida', novaLista);
    setNovaPerguntaAnamnese('');
  };

  const handleCheckPergunta = (index, checked) => {
    const novaLista = [...(dadosProntuario.anamnese_dirigida || [])];
    novaLista[index].checked = checked;
    handleInputChange('anamnese_dirigida', novaLista);
  };
  
  const handleRemoverPergunta = (index) => {
    const novaLista = (dadosProntuario.anamnese_dirigida || []).filter((_, i) => i !== index);
    handleInputChange('anamnese_dirigida', novaLista);
  };
  // --- FIM DAS NOVAS FUNÇÕES ---

  // --- Funções para Modelos de Prescrição ---
  const criarPrescricaoCompleta = (modelo) => {
    let prescricao = `${modelo.medicamento}`;
    if (modelo.concentracao) prescricao += ` ${modelo.concentracao}`;
    prescricao += ` - ${modelo.posologia}`;
    if (modelo.duracao) prescricao += ` ${modelo.duracao}`;
    if (modelo.observacoes) prescricao += ` (${modelo.observacoes})`;
    return prescricao;
  };

  const handleSalvarModelo = async () => {
    if (!novoModelo.medicamento || !novoModelo.posologia) {
      alert("Medicamento e posologia são obrigatórios");
      return;
    }

    try {
      const prescricaoCompleta = criarPrescricaoCompleta(novoModelo);
      
      await ModeloPrescricao.create({
        ...novoModelo,
        medico_id: medico.id,
        prescricao_completa: prescricaoCompleta
      });

      // Recarregar modelos
      const modelos = await ModeloPrescricao.filter({ medico_id: medico.id });
      setModelosPrescricao(Array.isArray(modelos) ? modelos : []);

      // Limpar formulário
      setNovoModelo({
        medicamento: '',
        concentracao: '',
        posologia: '',
        duracao: '',
        observacoes: '',
        tipo_receituario: 'simples'
      });
      setMostrarFormModelo(false);

    } catch (error) {
      console.error("Erro ao salvar modelo:", error);
      alert("Erro ao salvar modelo de prescrição");
    }
  };

  const inserirPrescricaoNoReceituario = (modelo, tipoReceituario) => {
    const campoReceituario = tipoReceituario === 'simples' ? 'prescricao_simples' : 'prescricao_especial';
    const textoAtual = dadosProntuario[campoReceituario] || '';
    
    // Adicionar a nova prescrição
    let novoTexto = textoAtual;
    if (novoTexto.trim() !== '') { // Only add new lines if there's existing text
      novoTexto += '\n\n';
    }
    novoTexto += modelo.prescricao_completa;

    handleInputChange(campoReceituario, novoTexto);
  };

  const excluirModelo = async (modeloId) => {
    if (!window.confirm("Tem certeza que deseja excluir este modelo? Esta ação não pode ser desfeita.")) return;

    try {
      await ModeloPrescricao.delete(modeloId);
      const modelos = await ModeloPrescricao.filter({ medico_id: medico.id });
      setModelosPrescricao(Array.isArray(modelos) ? modelos : []);
    } catch (error) {
      console.error("Erro ao excluir modelo:", error);
      alert("Erro ao excluir modelo de prescrição.");
    }
  };
  // --- Fim das funções para Modelos de Prescrição ---

  // --- Funções para Arquivos ---
  const carregarArquivosDoPaciente = async () => {
    if (!paciente) return;
    try {
      const arquivos = await ArquivoPaciente.filter({ paciente_id: paciente.id }, "-created_date");
      setArquivosPaciente(Array.isArray(arquivos) ? arquivos : []);
    } catch (error) {
      console.error("Erro ao carregar arquivos:", error);
    }
  };

  const handleAdicionarArquivo = async () => {
    if (!novoArquivo) {
      alert("Selecione um arquivo para fazer o upload.");
      return;
    }
    
    setUploading(true);
    try {
      const { file_url } = await UploadFile({ file: novoArquivo });

      await ArquivoPaciente.create({
        paciente_id: paciente.id,
        medico_id: medico.id,
        prontuario_id: agendamento?.id, // Associa ao prontuário se houver um agendamento
        file_url,
        nome_arquivo: novoArquivo.name,
        descricao: descricaoNovoArquivo,
        tipo: tipoNovoArquivo
      });

      // Limpar formulário de upload e recarregar lista
      setNovoArquivo(null);
      setDescricaoNovoArquivo('');
      setTipoNovoArquivo('Imagem');
      document.getElementById('file-upload-input').value = null; // Limpa o input de arquivo
      await carregarArquivosDoPaciente();

    } catch (error) {
      console.error("Erro ao fazer upload do arquivo:", error);
      alert("Falha no upload do arquivo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  };
  
  const handleExcluirArquivo = async (arquivoId) => {
    if (window.confirm("Tem certeza que deseja excluir este arquivo? Esta ação não pode ser desfeita.")) {
      try {
        await ArquivoPaciente.delete(arquivoId);
        await carregarArquivosDoPaciente();
      } catch (error) {
        console.error("Erro ao excluir arquivo:", error);
        alert("Falha ao excluir o arquivo.");
      }
    }
  };
  // --- Fim das funções para Arquivos ---

  const iniciarAssinatura = (tipo) => {
    let conteudo = '';
    switch (tipo) {
      case 'receituario_simples':
        conteudo = dadosProntuario.prescricao_simples;
        break;
      case 'receituario_especial':
        conteudo = dadosProntuario.prescricao_especial;
        break;
      case 'solicitacao_exames':
        const examesSelecionados = (dadosProntuario.exames_solicitados || [])
          .map(id => examesDisponiveis.find(e => e.id === id))
          .filter(Boolean);
        conteudo = `Solicitação de Exames para ${paciente.nome}\n\n` +
                  examesSelecionados.map(e => `- ${e.nome}`).join('\n') +
                  (dadosProntuario.solicitacao_exames ? `\n\nObservações:\n${dadosProntuario.solicitacao_exames}` : '');
        break;
      default:
        console.error("Tipo de documento para assinar não reconhecido:", tipo);
        return;
    }

    if (!conteudo.trim()) {
      alert("O documento está vazio. Preencha o conteúdo antes de assinar.");
      return;
    }

    setTipoDocumentoAssinar(tipo);
    setConteudoDocumentoAssinar(conteudo);
    setMostrarAssinatura(true);
  };

  const handleDocumentoAssinado = async (assinatura) => {
    console.log("Documento assinado com sucesso:", assinatura);
    
    // CORREÇÃO: Atualizar a assinatura do médico no estado local
    try {
      // Recarregar os dados do médico para pegar a assinatura atualizada
      const medicoAtualizado = await Medico.get(medico.id);
      if (medicoAtualizado.assinatura_digital) {
        // Força a atualização do objeto médico com a nova assinatura
        // Nota: se 'medico' for um prop vindo de um estado pai, essa modificação direta
        // pode não ser reativa. O ideal seria ter um callback 'onUpdateMedico' no prop.
        // Contudo, seguindo a lógica do outline, estamos modificando o objeto diretamente.
        Object.assign(medico, { assinatura_digital: medicoAtualizado.assinatura_digital });
      }
    } catch (error) {
      console.error("Erro ao recarregar dados do médico:", error);
    }
    
    setMostrarAssinatura(false);
    alert("Documento assinado com sucesso! A assinatura digital agora aparecerá nos receituários.");
  };

  const adicionarReceituario = (tipo) => {
    const campo = tipo === 'simples' ? 'prescricao_simples' : 'prescricao_especial';
    let template = receituarioTemplates[tipo]
      .replace('[PACIENTE]', paciente.nome)
      .replace('[MEDICO]', medico.nome)
      .replace('[CRM]', medico.crm || 'N/A');

    if (tipo === 'especial') {
        template = template
            .replace('[ENDERECO_CLINICA]', 'Rua Exemplo, 123 - Centro - Cidade, UF') // Placeholder
            .replace('[TELEFONE_CLINICA]', '(XX) XXXX-XXXX') // Placeholder
            .replace('[ENDERECO_PACIENTE]', paciente.endereco ? `${paciente.endereco.logradouro}, ${paciente.endereco.numero} - ${paciente.endereco.bairro} - ${paciente.endereco.cidade}, ${paciente.endereco.uf}` : '___________________________________________');
    }
    
    template = template.replace(/\[DATA\]/g, format(new Date(), "dd/MM/yyyy"));
    
    // Define o template no campo, limpando o conteúdo anterior
    handleInputChange(campo, template);
  };
  
  const baixarReceituario = (tipo) => {
    const campo = tipo === 'simples' ? 'prescricao_simples' : 'prescricao_especial';
    const conteudo = dadosProntuario[campo];

    if (!conteudo) {
      alert(`O campo "${tipo === 'simples' ? 'Receituário Simples' : 'Controle Especial'}" está vazio. Preencha ou use o template.`);
      return;
    }

    // CORREÇÃO: Incluir assinatura digital se existir
    let assinaturaHtml = '';
    if (medico.assinatura_digital) {
      assinaturaHtml = `
        <div class="assinatura-digital" style="margin-top: 40px; text-align: center;">
          <img src="${medico.assinatura_digital}" alt="Assinatura Digital" style="max-width: 300px; max-height: 80px; border: 1px solid #ddd; padding: 10px; background: white;" />
          <p style="margin-top: 5px; font-size: 10pt; color: #666;">Assinatura Digital</p>
        </div>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${tipo === 'simples' ? 'Receituário Médico Simples' : 'Receituário de Controle Especial'}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; margin: 40px; color: #000; font-size: 12pt; }
          .container { width: 100%; max-width: 700px; margin: auto; }
          .header { display: flex; align-items: center; justify-content: center; text-align: center; margin-bottom: 30px; }
          .logo { width: 60px; height: 60px; margin-right: 20px; }
          .clinic-info { text-align: center; }
          .clinic-name { font-size: 16pt; font-weight: bold; }
          .doctor-name { font-size: 14pt; }
          .specialty { font-size: 12pt; color: #333; }
          pre { white-space: pre-wrap; font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; }
          .footer { text-align: center; margin-top: 60px; }
          .signature-line { border-top: 1px solid #000; width: 300px; margin: 0 auto; padding-top: 5px; }
          .assinatura-digital { margin-top: 20px; }
          .digital-signature-warning { margin-top: 20px; padding: 10px; border: 1px solid #ccc; background: #f9f9f9; font-size: 10pt; }
          @media print { 
            body { margin: 20mm; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo" class="logo no-print">
            <div class="clinic-info">
              <div class="clinic-name">CENTRO VIDA SAÚDE</div>
              <div class="doctor-name">Dr(a). ${medico.nome}</div>
              <div class="specialty">${medico.especialidade} | CRM: ${medico.crm}</div>
            </div>
          </div>
          <pre>${conteudo}</pre>
          <div class="footer">
            ${assinaturaHtml || '<div class="signature-line">Assinatura e Carimbo do Médico</div>'}
            ${!medico.assinatura_digital ? `
              <div class="digital-signature-warning">
                <p><strong>⚠️ IMPORTANTE:</strong> Para validade jurídica, este documento deve ser assinado digitalmente através do sistema.</p>
                <p>Documentos sem assinatura digital não possuem validade legal.</p>
              </div>
            ` : `
              <div class="digital-signature-warning">
                <p><strong>✅ DOCUMENTO ASSINADO DIGITALMENTE</strong></p>
                <p>Este documento possui assinatura digital válida do médico responsável.</p>
                <p>Data da assinatura: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
              </div>
            `}
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const adicionarExame = (exameId) => {
    const examesAtuais = dadosProntuario.exames_solicitados || [];
    if (!examesAtuais.includes(exameId)) {
      handleInputChange('exames_solicitados', [...examesAtuais, exameId]);
    }
  };

  const removerExame = (exameId) => {
    const examesAtuais = dadosProntuario.exames_solicitados || [];
    handleInputChange('exames_solicitados', examesAtuais.filter(id => id !== exameId));
  };

  const baixarSolicitacaoExames = () => {
    const examesSelecionados = (dadosProntuario.exames_solicitados || [])
      .map(id => examesDisponiveis.find(e => e.id === id))
      .filter(Boolean);

    if (examesSelecionados.length === 0) {
      alert("Selecione pelo menos um exame para gerar a solicitação.");
      return;
    }

    const dataAtual = format(new Date(), "dd/MM/yyyy");
    
    // CORREÇÃO: Incluir assinatura digital se existir
    let assinaturaHtml = '';
    if (medico.assinatura_digital) {
      assinaturaHtml = `
        <div class="assinatura-digital" style="margin-top: 40px; text-align: center;">
          <img src="${medico.assinatura_digital}" alt="Assinatura Digital" style="max-width: 300px; max-height: 80px; border: 1px solid #ddd; padding: 10px; background: white;" />
          <p style="margin-top: 5px; font-size: 10pt; color: #666;">Assinatura Digital</p>
        </div>
      `;
    }
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Solicitação de Exames</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          .header { display: flex; align-items: center; border-bottom: 2px solid #4338ca; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { width: 80px; height: 80px; margin-right: 20px; }
          .clinic-info { flex: 1; }
          .clinic-name { font-size: 24px; font-weight: bold; color: #4338ca; }
          .clinic-details { font-size: 12px; color: #666; margin-top: 5px; }
          .document-title { text-align: center; font-size: 20px; font-weight: bold; margin: 30px 0; color: #4338ca; }
          .patient-info { background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          .exams-list { margin: 20px 0; }
          .exam-item { padding: 10px; border-left: 3px solid #4338ca; margin-bottom: 10px; background-color: #f8fafc; }
          .footer { margin-top: 40px; text-align: center; font-size: 12px; border-top: 1px solid #ccc; padding-top: 20px; }
          .doctor-signature { margin-top: 60px; }
          .signature-line { border-top: 1px solid #333; width: 300px; margin: 0 auto; padding-top: 10px; text-align: center; }
          .assinatura-digital { margin-top: 20px; }
          .digital-signature-warning { margin-top: 20px; padding: 10px; border: 1px solid #ccc; background: #f9f9f9; font-size: 10pt; }
          @media print { body { margin: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/a0f6566fe_ImagemdoWhatsAppde2025-08-31s094100_18581e21.jpg" alt="Logo Centro Vida Saúde" class="logo">
          <div class="clinic-info">
            <div class="clinic-name">CENTRO VIDA SAÚDE</div>
            <div class="clinic-details">
              Sistema de Gestão Médica<br>
              CNPJ: 51.424.200/0001-02
            </div>
          </div>
        </div>

        <div class="document-title">SOLICITAÇÃO DE EXAMES</div>

        <div class="patient-info">
          <h3>📋 DADOS DO PACIENTE</h3>
          <p><strong>Nome:</strong> ${paciente.nome}</p>
          <p><strong>Data de Nascimento:</strong> ${paciente.data_nascimento ? format(new Date(paciente.data_nascimento), "dd/MM/yyyy") : 'Não informado'}</p>
          <p><strong>CPF:</strong> ${paciente.cpf}</p>
          <p><strong>Convênio:</strong> ${paciente.convenio}</p>
        </div>

        <div class="exams-list">
          <h3>🧪 EXAMES SOLICITADOS</h3>
          ${examesSelecionados.map(exame => `
            <div class="exam-item">
              <strong>${exame.nome}</strong>
              ${exame.tipo ? `<br><small>Tipo: ${exame.tipo}</small>` : ''}
              ${exame.preparo_necessario ? `<br><small>⚠️ Requer preparo</small>` : ''}
            </div>
          `).join('')}
        </div>

        ${dadosProntuario.hipotese_diagnostica ? `
        <div style="margin: 20px 0;">
          <h3>🩺 HIPÓTESE DIAGNÓSTICA</h3>
          <p>${dadosProntuario.hipotese_diagnostica}</p>
        </div>
        ` : ''}

        <div class="doctor-signature">
          ${assinaturaHtml || '<div class="signature-line"><div><strong>Dr(a). ' + medico.nome + '</strong></div><div>CRM: ' + medico.crm + ' | ' + medico.especialidade + '</div><div>Data: ' + dataAtual + '</div></div>'}
        </div>

        <div class="footer">
          <p><strong>Centro Vida Saúde</strong> - Soluções inteligentes para empresas que querem crescer</p>
          ${!medico.assinatura_digital ? `
            <div class="digital-signature-warning">
              <p><strong>⚠️ IMPORTANTE:</strong> Para validade jurídica, este documento deve ser assinado digitalmente através do sistema.</p>
              <p>Documentos sem assinatura digital não possuem validade legal.</p>
            </div>
          ` : `
            <div class="digital-signature-warning">
              <p><strong>✅ DOCUMENTO ASSINADO DIGITALMENTE</strong></p>
              <p>Este documento possui assinatura digital válida do médico responsável.</p>
              <p>Data da assinatura: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
            </div>
          `}
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const organizarQueixaComIA = async () => {
    const queixaAtual = dadosProntuario.queixa_principal?.trim();
    
    if (!queixaAtual) {
      alert("Escreva algumas anotações sobre a queixa do paciente antes de organizar com IA.");
      return;
    }

    if (queixaAtual.length < 10) {
      alert("Adicione mais informações sobre a queixa para que a IA possa organizar melhor.");
      return;
    }

    setOrganizandoQueixa(true);
    
    try {
      const prompt = `
Você é um assistente médico especializado em organizar anotações de consulta. 
Analise o texto abaixo que contém anotações sobre a queixa principal de um paciente e organize de forma clara e estruturada.

DADOS DO PACIENTE:
- Nome: ${paciente.nome}
- Idade: ${paciente.data_nascimento ? calcularIdade(paciente.data_nascimento) + ' anos' : 'Não informado'}
- Especialidade do médico: ${medico.especialidade}

TEXTO ORIGINAL (anotações do médico):
"${queixaAtual}"

INSTRUÇÕES:
1. Organize o texto de forma clara e estruturada
2. Use linguagem médica apropriada
3. Separe os sintomas principais dos secundários
4. Organize cronologicamente quando possível
5. Destaque informações importantes sobre duração, intensidade, fatores desencadeantes
6. Mantenha todas as informações originais, apenas organizando melhor
7. Use bullet points ou parágrafos conforme apropriado
8. Limite a resposta a no máximo 500 palavras

Resposta organizada:`;

      const resultadoIA = await InvokeLLM({
        prompt: prompt,
        add_context_from_internet: false
      });

      // Atualizar o campo com a versão organizada
      setDadosProntuario(prev => ({
        ...prev,
        queixa_principal: resultadoIA
      }));

      alert("✅ Queixa principal organizada com sucesso pela IA!");

    } catch (error) {
      console.error("Erro ao organizar queixa com IA:", error);
      alert("❌ Erro ao processar com IA. Tente novamente em alguns instantes.");
    } finally {
      setOrganizandoQueixa(false);
    }
  };

  if (!aberto || !paciente) return null;

  const prioridade = paciente.prioridade || 'Normal';
  const idade = calcularIdade(paciente.data_nascimento);
  const examesSelecionados = (dadosProntuario.exames_solicitados || [])
    .map(id => examesDisponiveis.find(e => e.id === id))
    .filter(Boolean);

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <User className="w-6 h-6 text-blue-600" />
            Prontuário - {paciente.nome}
            {prioridade !== 'Normal' && (
              <Badge className={`${prioridadeColors[prioridade]} font-medium`}>
                {prioridade}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:col-span-4 lg:grid-cols-4 gap-6">
          {/* Coluna 1: Informações do Paciente */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Dados do Paciente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <strong>Nome:</strong> {paciente.nome}
                </div>
                <div>
                  <strong>Idade:</strong> {idade} anos
                </div>
                <div>
                  <strong>CPF:</strong> {paciente.cpf}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <strong>Telefone:</strong> {paciente.telefone}
                </div>
                <div>
                  <strong>Convênio:</strong> {paciente.convenio}
                </div>
                {prioridade !== 'Normal' && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <strong className="text-yellow-800">Prioridade:</strong>
                    </div>
                    <span className="text-yellow-700 text-xs">{prioridade}</span>
                  </div>
                )}
                {paciente.observacoes && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                    <strong className="text-blue-800">Observações:</strong>
                    <p className="text-blue-700 text-xs mt-1">{paciente.observacoes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Histórico de Consultas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Últimas Consultas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-gray-500">Carregando histórico...</p>
                ) : historicoConsultas.length === 0 ? (
                  <p className="text-sm text-gray-500">Primeira consulta do paciente</p>
                ) : (
                  <div className="space-y-2">
                    {historicoConsultas.map((consulta, index) => (
                      <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                        <div className="flex justify-between">
                          <span className="font-medium">
                            {format(new Date(consulta.data_atendimento), "dd/MM/yyyy")}
                          </span>
                        </div>
                        {/* Exibe o perfil do paciente se houver */}
                        {consulta.perfil_paciente && (
                          <p className="text-purple-800 italic mt-1 bg-purple-50 p-1.5 rounded border border-purple-100">
                            “{consulta.perfil_paciente}”
                          </p>
                        )}
                        {consulta.hipotese_diagnostica && (
                          <p className="text-gray-600 mt-1">
                            {consulta.hipotese_diagnostica}
                          </p>
                        )}
                        {/* NOVO: EXIBIR ITENS MARCADOS DO CHECKLIST */}
                        {consulta.anamnese_dirigida && consulta.anamnese_dirigida.some(item => item.checked) && (
                          <div className="mt-1 border-t pt-1">
                            <p className="font-medium text-gray-700">Anamnese Dirigida:</p>
                            {consulta.anamnese_dirigida.filter(item => item.checked).map((item, idx) => (
                               <p key={idx} className="text-gray-600">✓ {item.pergunta}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Colunas 2-4: Formulário do Prontuário com Tabs */}
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Consulta Atual - {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="anamnese" className="w-full">
                  <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="anamnese">Anamnese</TabsTrigger>
                    <TabsTrigger value="prescricao">Prescrição</TabsTrigger>
                    <TabsTrigger value="exames">Exames</TabsTrigger>
                    <TabsTrigger value="arquivos">Arquivos</TabsTrigger>
                    <TabsTrigger value="conduta">Conduta</TabsTrigger>
                  </TabsList>

                  <TabsContent value="anamnese" className="space-y-4 mt-4">
                    
                    {/* SEÇÃO DE PERFIL DO PACIENTE */}
                    <div>
                      <Label htmlFor="perfil_paciente" className="text-base font-medium text-purple-800 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Perfil do Paciente (Notas Pessoais)
                      </Label>
                      <Textarea
                        id="perfil_paciente"
                        value={dadosProntuario.perfil_paciente}
                        onChange={(e) => handleInputChange('perfil_paciente', e.target.value)}
                        placeholder="Informações de contexto sobre o paciente: estilo de vida, eventos importantes, hobbies, família, trabalho... Ex: 'Dona Maria quer fazer exames porque vai casar em 6 meses.'"
                        rows={3}
                        className="mt-1 border-purple-200 focus:border-purple-400 bg-purple-50/50"
                      />
                    </div>

                    {/* Painel de Gravação */}
                    {speechRecognitionSupported && (
                      <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}>
                                <Mic className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <h4 className="font-medium text-blue-900">Gravação de Voz - Anamnese</h4>
                                <p className="text-sm text-blue-700">
                                  {isRecording ? 'Gravando... Fale com o paciente' : 'Clique para gravar a conversa com o paciente'}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              {!isRecording ? (
                                <>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" onClick={() => iniciarGravacao('queixa_principal')} className="bg-green-600 hover:bg-green-700">
                                          <Mic className="w-4 h-4 mr-1" />
                                          Queixa
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Gravar para Queixa Principal</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" onClick={() => iniciarGravacao('historico_doenca_atual')} className="bg-blue-600 hover:bg-blue-700">
                                          <Mic className="w-4 h-4 mr-1" />
                                          HDA
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Gravar para Histórico da Doença Atual</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button size="sm" onClick={() => iniciarGravacao('exame_fisico')} className="bg-purple-600 hover:bg-purple-700">
                                          <Mic className="w-4 h-4 mr-1" />
                                          Exame
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Gravar para Exame Físico</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </>
                              ) : (
                                <Button size="sm" onClick={pararGravacao} className="bg-red-600 hover:bg-red-700">
                                  <Square className="w-4 h-4 mr-1" />
                                  Parar
                                </Button>
                              )}
                            </div>
                          </div>
                          
                          {transcricaoTemp && (
                            <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                              <div className="flex justify-between items-start mb-2">
                                <h5 className="font-medium text-blue-900">Transcrição capturada:</h5>
                                <div className="flex gap-2">
                                  <Button size="sm" onClick={inserirTranscricao} className="bg-green-600 hover:bg-green-700">
                                    Inserir
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={descartarTranscricao}>
                                    Descartar
                                  </Button>
                                </div>
                              </div>
                              <p className="text-sm text-gray-700 italic">"{transcricaoTemp}"</p>
                              {campoGravacao && (
                                <p className="text-xs text-blue-600 mt-1">
                                  Será inserido em: {campoGravacao === 'queixa_principal' ? 'Queixa Principal' : 
                                                   campoGravacao === 'historico_doenca_atual' ? 'HDA' : 'Exame Físico'}
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* NOVO: SEÇÃO DE ANAMNESE DIRIGIDA (CHECKLIST) */}
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Anamnese Dirigida (Checklist)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2 mb-4">
                          <Input
                            placeholder="Adicionar pergunta (ex: Tem pressão alta?)"
                            value={novaPerguntaAnamnese}
                            onChange={(e) => setNovaPerguntaAnamnese(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleAdicionarPergunta()}
                          />
                          <Button type="button" onClick={handleAdicionarPergunta}><Plus className="w-4 h-4 mr-2" /> Adicionar</Button>
                        </div>
                        <div className="space-y-2">
                          {(dadosProntuario.anamnese_dirigida || []).map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  id={`check-${index}`}
                                  checked={item.checked}
                                  onCheckedChange={(checked) => handleCheckPergunta(index, checked)}
                                />
                                <Label htmlFor={`check-${index}`} className="font-normal cursor-pointer">
                                  {item.pergunta}
                                </Label>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="text-red-500 hover:text-red-700"
                                onClick={() => handleRemoverPergunta(index)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                           {(dadosProntuario.anamnese_dirigida || []).length === 0 && (
                                <p className="text-sm text-center text-gray-500 py-4">Nenhuma pergunta adicionada.</p>
                           )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Queixa Principal com IA */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="queixa_principal" className="font-medium">🗣️ Queixa Principal *</Label>
                        <Button
                          type="button"
                          onClick={organizarQueixaComIA}
                          disabled={organizandoQueixa || !dadosProntuario.queixa_principal?.trim() || dadosProntuario.queixa_principal?.trim().length < 10}
                          variant="outline"
                          size="sm"
                          className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        >
                          {organizandoQueixa ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Organizando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Organizar com IA
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-600">
                        Descreva os sintomas principais relatados pelo paciente. Use o botão "Organizar com IA" para estruturar suas anotações automaticamente.
                      </p>
                      <Textarea
                        id="queixa_principal"
                        value={dadosProntuario.queixa_principal}
                        onChange={(e) => handleInputChange('queixa_principal', e.target.value)}
                        placeholder="Motivo da consulta, sintomas relatados pelo paciente... Pode ser em formato livre - a IA ajudará a organizar."
                        rows={3}
                      />
                      {dadosProntuario.queixa_principal?.length > 0 && (
                        <div className="text-xs text-gray-500">
                          {dadosProntuario.queixa_principal.length} caracteres • 
                          {dadosProntuario.queixa_principal.length < 10 ? ' Adicione mais informações para usar a IA' : ' Pronto para organizar com IA'}
                        </div>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="hda">História da Doença Atual (HDA)</Label>
                      <Textarea
                        id="hda"
                        value={dadosProntuario.historico_doenca_atual}
                        onChange={(e) => handleInputChange('historico_doenca_atual', e.target.value)}
                        placeholder="Evolução dos sintomas, quando começaram, fatores que melhoram/pioram..."
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="exame">Exame Físico</Label>
                      <Textarea
                        id="exame"
                        value={dadosProntuario.exame_fisico}
                        onChange={(e) => handleInputChange('exame_fisico', e.target.value)}
                        placeholder="Achados do exame físico, sinais vitais, inspeção..."
                        rows={3}
                      />
                    </div>

                    <div>
                      <Label htmlFor="diagnostico">Hipótese Diagnóstica / CID</Label>
                      <Input
                        id="diagnostico"
                        value={dadosProntuario.hipotese_diagnostica}
                        onChange={(e) => handleInputChange('hipotese_diagnostica', e.target.value)}
                        placeholder="Diagnóstico provável, CID..."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="prescricao" className="mt-4">
                    
                    {/* Nova seção de Modelos de Prescrição */}
                    <Card className="mb-4 bg-blue-50 border-blue-200">
                      <CardHeader>
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-base text-blue-800">Modelos de Prescrição</CardTitle>
                          <Button size="sm" onClick={() => setMostrarFormModelo(!mostrarFormModelo)}>
                            <Plus className="w-4 h-4 mr-1" />
                            Novo Modelo
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {mostrarFormModelo && (
                          <div className="bg-white p-4 rounded border mb-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label>Medicamento *</Label>
                                <Input 
                                  value={novoModelo.medicamento}
                                  onChange={(e) => setNovoModelo({...novoModelo, medicamento: e.target.value})}
                                  placeholder="Ex: Dipirona"
                                />
                              </div>
                              <div>
                                <Label>Concentração</Label>
                                <Input 
                                  value={novoModelo.concentracao}
                                  onChange={(e) => setNovoModelo({...novoModelo, concentracao: e.target.value})}
                                  placeholder="Ex: 500mg, 50ml"
                                />
                              </div>
                              <div>
                                <Label>Posologia *</Label>
                                <Input 
                                  value={novoModelo.posologia}
                                  onChange={(e) => setNovoModelo({...novoModelo, posologia: e.target.value})}
                                  placeholder="Ex: 1 comprimido de 8/8h"
                                />
                              </div>
                              <div>
                                <Label>Duração</Label>
                                <Input 
                                  value={novoModelo.duracao}
                                  onChange={(e) => setNovoModelo({...novoModelo, duracao: e.target.value})}
                                  placeholder="Ex: por 7 dias"
                                />
                              </div>
                              <div className="col-span-1 sm:col-span-2">
                                <Label>Observações</Label>
                                <Input 
                                  value={novoModelo.observacoes}
                                  onChange={(e) => setNovoModelo({...novoModelo, observacoes: e.target.value})}
                                  placeholder="Ex: tomar com alimentos"
                                />
                              </div>
                              <div>
                                <Label>Tipo de Receituário</Label>
                                <Select value={novoModelo.tipo_receituario} onValueChange={(value) => setNovoModelo({...novoModelo, tipo_receituario: value})}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="simples">Receituário Simples</SelectItem>
                                    <SelectItem value="especial">Controle Especial</SelectItem>
                                    <SelectItem value="ambos">Ambos</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <Button size="sm" onClick={handleSalvarModelo}>Salvar Modelo</Button>
                              <Button size="sm" variant="outline" onClick={() => setMostrarFormModelo(false)}>Cancelar</Button>
                            </div>
                          </div>
                        )}
                        
                        <div className="space-y-2 mt-4">
                          {modelosPrescricao.length === 0 ? (
                            <p className="text-sm text-gray-500 text-center py-4">Nenhum modelo cadastrado. Crie seus primeiros modelos!</p>
                          ) : (
                            modelosPrescricao.map(modelo => (
                              <div key={modelo.id} className="bg-white p-3 rounded border flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-medium text-sm text-gray-800">{modelo.prescricao_completa}</p>
                                  <Badge variant="outline" className="mt-1">
                                    {modelo.tipo_receituario === 'simples' ? 'Receituário Simples' : 
                                     modelo.tipo_receituario === 'especial' ? 'Controle Especial' : 'Ambos'}
                                  </Badge>
                                </div>
                                <div className="flex gap-1 ml-3">
                                  {(modelo.tipo_receituario === 'simples' || modelo.tipo_receituario === 'ambos') && (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => inserirPrescricaoNoReceituario(modelo, 'simples')}
                                      className="text-xs h-8"
                                    >
                                      → Simples
                                    </Button>
                                  )}
                                  {(modelo.tipo_receituario === 'especial' || modelo.tipo_receituario === 'ambos') && (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      onClick={() => inserirPrescricaoNoReceituario(modelo, 'especial')}
                                      className="text-xs h-8"
                                    >
                                      → Especial
                                    </Button>
                                  )}
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => excluirModelo(modelo.id)}
                                    className="text-red-500 hover:text-red-700 h-8 w-8 p-0"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Tabs defaultValue="simples" className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="simples">Receituário Simples</TabsTrigger>
                        <TabsTrigger value="especial">Controle Especial</TabsTrigger>
                      </TabsList>
                      <TabsContent value="simples" className="space-y-4 mt-4">
                        <div className="flex justify-between items-center">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => adicionarReceituario('simples')}
                            className="gap-2"
                          >
                            <Pill className="w-4 h-4" />
                            Usar Template Simples
                          </Button>
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="secondary" 
                              size="sm"
                              onClick={() => iniciarAssinatura('receituario_simples')}
                              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                              disabled={!dadosProntuario.prescricao_simples}
                            >
                              <Shield className="w-4 h-4" />
                              Assinar Digitalmente
                            </Button>
                            <Button 
                              type="button" 
                              variant="secondary" 
                              size="sm"
                              onClick={() => baixarReceituario('simples')}
                              className="gap-2"
                              disabled={!dadosProntuario.prescricao_simples}
                            >
                              <Printer className="w-4 h-4" />
                              Imprimir
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={dadosProntuario.prescricao_simples}
                          onChange={(e) => handleInputChange('prescricao_simples', e.target.value)}
                          placeholder="Digite a prescrição simples ou use os modelos acima para preencher."
                          rows={12}
                          className="font-mono text-sm"
                        />
                      </TabsContent>
                      <TabsContent value="especial" className="space-y-4 mt-4">
                        <div className="flex justify-between items-center">
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm"
                            onClick={() => adicionarReceituario('especial')}
                            className="gap-2"
                          >
                            <AlertCircle className="w-4 h-4" />
                            Usar Template Especial
                          </Button>
                          <div className="flex gap-2">
                            <Button 
                              type="button" 
                              variant="secondary" 
                              size="sm"
                              onClick={() => iniciarAssinatura('receituario_especial')}
                              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                              disabled={!dadosProntuario.prescricao_especial}
                            >
                              <Shield className="w-4 h-4" />
                              Assinar Digitalmente
                            </Button>
                            <Button 
                              type="button" 
                              variant="secondary" 
                              size="sm"
                              onClick={() => baixarReceituario('especial')}
                              className="gap-2"
                              disabled={!dadosProntuario.prescricao_especial}
                            >
                              <Printer className="w-4 h-4" />
                              Imprimir
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={dadosProntuario.prescricao_especial}
                          onChange={(e) => handleInputChange('prescricao_especial', e.target.value)}
                          placeholder="Digite a prescrição de controle especial ou use os modelos acima para preencher."
                          rows={12}
                          className="font-mono text-sm"
                        />
                      </TabsContent>
                    </Tabs>
                  </TabsContent>

                  <TabsContent value="exames" className="space-y-4 mt-4">
                    <div className="flex items-center justify-between">
                      <Label>Solicitar Exames</Label>
                      <div className="flex gap-2">
                        {examesSelecionados.length > 0 && (
                          <>
                            <Button 
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={() => iniciarAssinatura('solicitacao_exames')}
                              className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                            >
                              <Shield className="w-4 h-4" />
                              Assinar Solicitação
                            </Button>
                            <Button 
                              type="button"
                              variant="outline" 
                              size="sm"
                              onClick={baixarSolicitacaoExames}
                              className="gap-2"
                            >
                              <Download className="w-4 h-4" />
                              Baixar Solicitação
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="border rounded-lg p-4">
                      <div className="mb-4">
                        <Select onValueChange={adicionarExame}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione um exame para adicionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {examesDisponiveis
                              .filter(exame => !dadosProntuario.exames_solicitados?.includes(exame.id))
                              .map(exame => (
                                <SelectItem key={exame.id} value={exame.id}>
                                  {exame.nome} {exame.tipo && `(${exame.tipo})`}
                                </SelectItem>
                              ))
                            }
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Exames Selecionados ({examesSelecionados.length})</Label>
                        {examesSelecionados.length === 0 ? (
                          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded">
                            <TestTube className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500">Nenhum exame selecionado</p>
                          </div>
                        ) : (
                          examesSelecionados.map(exame => (
                            <div key={exame.id} className="flex items-center justify-between p-2 bg-blue-50 rounded">
                              <div>
                                <span className="font-medium">{exame.nome}</span>
                                {exame.tipo && <span className="text-sm text-gray-500 ml-2">({exame.tipo})</span>}
                                {exame.preparo_necessario && (
                                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded ml-2">
                                    Requer preparo
                                  </span>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removerExame(exame.id)}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="solicitacao_exames">Observações da Solicitação</Label>
                      <Textarea
                        id="solicitacao_exames"
                        value={dadosProntuario.solicitacao_exames}
                        onChange={(e) => handleInputChange('solicitacao_exames', e.target.value)}
                        placeholder="Observações adicionais sobre os exames solicitados..."
                        rows={3}
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="arquivos" className="space-y-4 mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                          <Upload className="w-4 h-4" />
                          Anexar Novo Arquivo
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="file-upload-input">Arquivo</Label>
                            <Input 
                              id="file-upload-input" 
                              type="file" 
                              onChange={(e) => setNovoArquivo(e.target.files[0])}
                            />
                          </div>
                          <div>
                            <Label htmlFor="file-type-select">Tipo</Label>
                            <Select value={tipoNovoArquivo} onValueChange={setTipoNovoArquivo}>
                              <SelectTrigger id="file-type-select">
                                <SelectValue placeholder="Selecione o tipo" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Imagem">Imagem</SelectItem>
                                <SelectItem value="Documento">Documento</SelectItem>
                                <SelectItem value="Exame">Exame Antigo</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <Label htmlFor="file-description">Descrição</Label>
                          <Textarea 
                            id="file-description"
                            placeholder="Ex: Foto do rosto antes do procedimento, Raio-X de 2022..."
                            value={descricaoNovoArquivo}
                            onChange={(e) => setDescricaoNovoArquivo(e.target.value)}
                            rows={2}
                          />
                        </div>
                        <Button onClick={handleAdicionarArquivo} disabled={uploading || !novoArquivo}>
                          {uploading ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando...</>
                          ) : (
                            <><Plus className="w-4 h-4 mr-2" /> Adicionar Arquivo</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>

                    <Separator />

                    <div className="space-y-3">
                       <Label>Arquivos Anexados ({arquivosPaciente.length})</Label>
                       {arquivosPaciente.length === 0 ? (
                         <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded">
                           <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                           <p className="text-sm text-gray-500">Nenhum arquivo anexado a este paciente.</p>
                         </div>
                       ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {arquivosPaciente.map(arquivo => (
                            <Card key={arquivo.id} className="overflow-hidden">
                              {arquivo.tipo === 'Imagem' ? (
                                <img src={arquivo.file_url} alt={arquivo.descricao} className="w-full h-32 object-cover" />
                              ) : (
                                <div className="w-full h-32 bg-gray-100 flex items-center justify-center">
                                  <FileText className="w-12 h-12 text-gray-400" />
                                </div>
                              )}
                              <CardContent className="p-3 space-y-2">
                                <p className="text-sm font-medium truncate" title={arquivo.descricao}>
                                  {arquivo.descricao || "Sem descrição"}
                                </p>
                                <p className="text-xs text-gray-500 truncate" title={arquivo.nome_arquivo}>
                                  {arquivo.nome_arquivo}
                                </p>
                                <Badge variant="secondary">{arquivo.tipo}</Badge>
                                <div className="flex justify-between items-center pt-2 border-t mt-2">
                                  <span className="text-xs text-gray-500">
                                    {format(new Date(arquivo.created_date), "dd/MM/yy")}
                                  </span>
                                  <div className="flex gap-1">
                                    <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                                      <a href={arquivo.file_url} target="_blank" rel="noopener noreferrer">
                                        <Download className="w-4 h-4" />
                                      </a>
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 text-red-500 hover:text-red-700"
                                      onClick={() => handleExcluirArquivo(arquivo.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                       )}
                    </div>
                  </TabsContent>

                  <TabsContent value="conduta" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="conduta">Conduta Médica</Label>
                      <Textarea
                        id="conduta"
                        value={dadosProntuario.conduta}
                        onChange={(e) => handleInputChange('conduta', e.target.value)}
                        placeholder="Plano terapêutico, orientações gerais ao paciente..."
                        rows={4}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={onFechar}>
                <X className="w-4 h-4 mr-2" />
                Cancelar
              </Button>
              <Button 
                onClick={handleSalvarProntuario}
                disabled={salvando || !dadosProntuario.queixa_principal}
                className="bg-green-600 hover:bg-green-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {salvando ? 'Salvando...' : 'Finalizar Consulta'}
              </Button>
            </div>
          </div>
        </div>

        {/* Componente de Assinatura Digital */}
        <CapturaAssinatura
          aberto={mostrarAssinatura}
          onFechar={() => setMostrarAssinatura(false)}
          onAssinado={handleDocumentoAssinado}
          medico={medico}
          paciente={paciente}
          prontuario={{ id: agendamento?.id }}
          tipoDocumento={tipoDocumentoAssinar}
          conteudoDocumento={conteudoDocumentoAssinar}
        />
      </DialogContent>
    </Dialog>
  );
}
