import React, { useState, useEffect } from 'react';
import { Medico, User, CategoriaPreco } from '@/entities/all';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Upload, Lock, Unlock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { UploadFile } from "@/integrations/Core";

const diasSemana = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' }
];

const recorrenciaOptions = [
  { value: 'Apenas uma vez', label: 'Apenas uma vez' },
  { value: 'Toda Semana', label: 'Toda Semana' },
  { value: '1ª e 3ª Semana do Mês', label: '1ª e 3ª Semana do Mês' },
  { value: '2ª e 4ª Semana do Mês', label: '2ª e 4ª Semana do Mês' },
  { value: 'Apenas 1ª Semana do Mês', label: 'Apenas 1ª Semana do Mês' },
  { value: 'Apenas 2ª Semana do Mês', label: 'Apenas 2ª Semana do Mês' },
  { value: 'Apenas 3ª Semana do Mês', label: 'Apenas 3ª Semana do Mês' },
  { value: 'Apenas 4ª Semana do Mês', label: 'Apenas 4ª Semana do Mês' }
];

export default function FormularioMedico({ medico, open, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    user_id: '',
    nome: '',
    crm: '',
    especialidade: '',
    telefone: '',
    email: '',
    foto_url: '',
    tipo_repasse: 'percentual',
    percentual_repasse: 0,
    percentual_repasse_convenio: 0,
    valor_repasse_fixo: 0,
    valor_repasse_fixo_convenio: 0,
    repasses_por_categoria: [],
    tempo_consulta_minutos: 30,
    tempo_consulta_minutos_2: '',
    horarios_atendimento: [],
    status: 'Ativo',
    tipo_atendimento: 'Horários Marcados',
    limite_ordem_chegada: 1,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => {
    if (open) {
      carregarUsuarios();
      carregarCategorias();
      
      if (medico) {
        console.log('📝 Carregando dados do médico para edição:', medico);
        setFormData({
          user_id: medico.user_id || '',
          nome: medico.nome || '',
          crm: medico.crm || '',
          especialidade: medico.especialidade || '',
          telefone: medico.telefone || '',
          email: medico.email || '',
          foto_url: medico.foto_url || '',
          tipo_repasse: medico.tipo_repasse || 'percentual',
          percentual_repasse: medico.percentual_repasse || 0,
          percentual_repasse_convenio: medico.percentual_repasse_convenio || 0,
          valor_repasse_fixo: medico.valor_repasse_fixo || 0,
          valor_repasse_fixo_convenio: medico.valor_repasse_fixo_convenio || 0,
          repasses_por_categoria: medico.repasses_por_categoria || [],
          tempo_consulta_minutos: medico.tempo_consulta_minutos || 30,
          tempo_consulta_minutos_2: medico.tempo_consulta_minutos_2 || '',
          horarios_atendimento: medico.horarios_atendimento || [],
          status: medico.status || 'Ativo',
          tipo_atendimento: medico.tipo_atendimento || 'Horários Marcados',
          limite_ordem_chegada: medico.limite_ordem_chegada || 1,
        });
      } else {
        setFormData({
          user_id: '',
          nome: '',
          crm: '',
          especialidade: '',
          telefone: '',
          email: '',
          foto_url: '',
          tipo_repasse: 'percentual',
          percentual_repasse: 0,
          percentual_repasse_convenio: 0,
          valor_repasse_fixo: 0,
          valor_repasse_fixo_convenio: 0,
          repasses_por_categoria: [],
          tempo_consulta_minutos: 30,
          tempo_consulta_minutos_2: '',
          horarios_atendimento: [],
          status: 'Ativo',
          tipo_atendimento: 'Horários Marcados',
          limite_ordem_chegada: 1,
        });
      }
    }
  }, [open, medico]);

  const carregarUsuarios = async () => {
    try {
      setLoadingUsuarios(true);
      const users = await User.list();
      console.log('👥 Usuários carregados:', users);
      setUsuarios(Array.isArray(users) ? users : []);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
      setUsuarios([]);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const carregarCategorias = async () => {
    try {
      const cats = await CategoriaPreco.list();
      // Mostrar TODAS as categorias ativas (incluindo Particular)
      const categoriasAtivas = (Array.isArray(cats) ? cats : []).filter(c => 
        c.status === 'Ativo'
      );
      // Ordenar para Particular aparecer primeiro
      categoriasAtivas.sort((a, b) => {
        if (a.nome?.toUpperCase() === 'PARTICULAR') return -1;
        if (b.nome?.toUpperCase() === 'PARTICULAR') return 1;
        return (a.nome || '').localeCompare(b.nome || '');
      });
      setCategorias(categoriasAtivas);
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
      setCategorias([]);
    }
  };

  const handleInputChange = (field, value) => {
    console.log(`🔄 Atualizando campo ${field}:`, value);
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUploadFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingFoto(true);
    try {
      const { file_url } = await UploadFile({ file });
      handleInputChange('foto_url', file_url);
    } catch (error) {
      console.error("Erro ao fazer upload da foto:", error);
      setError("Erro ao fazer upload da foto. Tente novamente.");
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleAdicionarHorario = () => {
    const novoHorario = {
      dia_semana: 1,
      horario_inicio: '08:00',
      horario_fim: '12:00',
      recorrencia: 'Toda Semana',
      data_especifica: null
    };
    handleInputChange('horarios_atendimento', [...formData.horarios_atendimento, novoHorario]);
  };

  const handleRemoverHorario = (index) => {
    const novosHorarios = formData.horarios_atendimento.filter((_, i) => i !== index);
    handleInputChange('horarios_atendimento', novosHorarios);
  };

  const handleHorarioChange = (index, field, value) => {
    const novosHorarios = [...formData.horarios_atendimento];
    novosHorarios[index] = {
      ...novosHorarios[index],
      [field]: field === 'dia_semana' ? parseInt(value) : value
    };
    handleInputChange('horarios_atendimento', novosHorarios);
  };

  const handleSave = async () => {
    console.log('🔍 Verificando campos obrigatórios...');
    console.log('Nome:', formData.nome);
    console.log('CRM:', formData.crm);
    console.log('Especialidade:', formData.especialidade);
    console.log('Horários:', formData.horarios_atendimento);

    if (!formData.nome || !formData.crm || !formData.especialidade) {
      setError("Preencha todos os campos obrigatórios: Nome, CRM e Especialidade");
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // Preparar dados para salvar
      // Sincronizar campos legados a partir do repasses_por_categoria
      const repasses = (formData.repasses_por_categoria || []).map((repasse) => ({
        categoria_id: repasse.categoria_id,
        tipo_repasse: repasse.tipo_repasse,
        valor: parseFloat(repasse.valor) || 0,
        valor_procedimento: parseFloat(repasse.valor_procedimento) || 0,
      }));

      // Encontrar a categoria Particular para sincronizar os campos legados
      const categoriaParticular = categorias.find(c => c.nome?.toUpperCase() === 'PARTICULAR');
      const repasseParticular = categoriaParticular 
        ? repasses.find(r => r.categoria_id === categoriaParticular.id) 
        : null;

      // Calcular valores legados de convênio (maior valor entre convênios, ou 0)
      const repassesConvenio = repasses.filter(r => 
        r.categoria_id !== categoriaParticular?.id
      );
      const maiorRepasseConvenio = repassesConvenio.length > 0 
        ? repassesConvenio.reduce((max, r) => r.valor > max.valor ? r : max, repassesConvenio[0])
        : null;

      const tipoRepasse = formData.tipo_repasse || 'percentual';

      // Capturar usuário logado para a auditoria registrar quem alterou
      let usuarioLogado = null;
      try {
        usuarioLogado = await User.me();
      } catch (e) {
        console.warn('Não foi possível identificar o usuário logado:', e.message);
      }

      const dadosParaSalvar = {
        user_id: formData.user_id || null,
        alterado_por_email: usuarioLogado?.email || null,
        alterado_por_nome: usuarioLogado?.full_name || usuarioLogado?.email || null,
        nome: formData.nome,
        crm: formData.crm,
        especialidade: formData.especialidade,
        telefone: formData.telefone || null,
        email: formData.email || null,
        foto_url: formData.foto_url || null,
        tipo_repasse: tipoRepasse,
        // Sincronizar campos legados com o repasses_por_categoria
        percentual_repasse: tipoRepasse === 'percentual' ? (repasseParticular?.valor || 0) : 0,
        percentual_repasse_convenio: tipoRepasse === 'percentual' ? (maiorRepasseConvenio?.valor || 0) : 0,
        percentual_repasse_procedimento: 0,
        percentual_repasse_procedimento_convenio: 0,
        valor_repasse_fixo: tipoRepasse === 'valor_fixo' ? (repasseParticular?.valor || 0) : 0,
        valor_repasse_fixo_convenio: tipoRepasse === 'valor_fixo' ? (maiorRepasseConvenio?.valor || 0) : 0,
        valor_repasse_fixo_procedimento: 0,
        valor_repasse_fixo_procedimento_convenio: 0,
        repasses_por_categoria: repasses,
        tempo_consulta_minutos: parseInt(formData.tempo_consulta_minutos) || 30,
        tempo_consulta_minutos_2: parseInt(formData.tempo_consulta_minutos_2) || null,
        horarios_atendimento: formData.horarios_atendimento || [],
        status: formData.status || 'Ativo',
        tipo_atendimento: formData.tipo_atendimento || 'Horários Marcados',
        limite_ordem_chegada: parseInt(formData.limite_ordem_chegada) || 1,
      };

      console.log('💾 Salvando médico com dados:', dadosParaSalvar);
      console.log('📋 Total de horários a salvar:', dadosParaSalvar.horarios_atendimento.length);

      if (medico) {
        const resultado = await Medico.update(medico.id, dadosParaSalvar);
        console.log('✅ Médico atualizado com sucesso! Resultado:', resultado);
      } else {
        const resultado = await Medico.create(dadosParaSalvar);
        console.log('✅ Médico criado com sucesso! Resultado:', resultado);
      }

      setSuccess(medico ? 'Médico atualizado com sucesso!' : 'Médico cadastrado com sucesso!');
      
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1500);

    } catch (error) {
      console.error("❌ Erro ao salvar médico:", error);
      console.error("❌ Detalhes do erro:", error.stack);
      setError(`Erro ao salvar: ${error.message || 'Erro desconhecido'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{medico ? `Editar Médico - ${medico.nome}` : 'Novo Médico'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basico" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basico">Dados Básicos</TabsTrigger>
            <TabsTrigger value="horarios">Horários</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="basico" className="space-y-4 mt-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="border-green-500 text-green-700 bg-green-50">
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            {/* Upload de Foto */}
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-gray-50">
              {formData.foto_url ? (
                <img 
                  src={formData.foto_url} 
                  alt="Foto do médico" 
                  className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-400 text-4xl">👨‍⚕️</span>
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingFoto}
                  onClick={() => document.getElementById('foto-upload').click()}
                >
                  {uploadingFoto ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      {formData.foto_url ? 'Trocar Foto' : 'Adicionar Foto'}
                    </>
                  )}
                </Button>
                <input
                  id="foto-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadFoto}
                />
              </div>
            </div>

            {/* Usuário do Sistema */}
            <div>
              <Label htmlFor="user_id">
                Usuário do Sistema (Login) *
                <span className="text-xs text-gray-500 ml-2">- Para acesso ao Portal do Médico</span>
              </Label>
              <Select 
                value={formData.user_id || "sem-usuario"} 
                onValueChange={(value) => handleInputChange('user_id', value === "sem-usuario" ? '' : value)}
                disabled={loadingUsuarios}
              >
                <SelectTrigger id="user_id">
                  <SelectValue placeholder={loadingUsuarios ? "Carregando usuários..." : "Selecione um usuário"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem-usuario">
                    <span className="text-gray-500">Sem usuário associado</span>
                  </SelectItem>
                  {usuarios.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.full_name || user.email}</span>
                        <Badge variant="outline" className="text-xs">{user.email}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-600 mt-1">
                O usuário poderá acessar o Portal do Médico com este email. 
                Se não ver o email na lista, peça para a pessoa fazer login no sistema primeiro.
              </p>
              {formData.user_id && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm text-green-800">
                    ✅ Usuário selecionado: {usuarios.find(u => u.id === formData.user_id)?.email || 'Carregando...'}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => handleInputChange('nome', e.target.value)}
                  placeholder="Dr(a). Nome Completo"
                />
              </div>

              <div>
                <Label htmlFor="crm">CRM *</Label>
                <Input
                  id="crm"
                  value={formData.crm}
                  onChange={(e) => handleInputChange('crm', e.target.value)}
                  placeholder="12345/UF"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="especialidade">Especialidade *</Label>
              <Select value={formData.especialidade} onValueChange={(value) => handleInputChange('especialidade', value)}>
                <SelectTrigger id="especialidade">
                  <SelectValue placeholder="Selecione a especialidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cardiologia">Cardiologia</SelectItem>
                  <SelectItem value="Clínico Geral">Clínico Geral</SelectItem>
                  <SelectItem value="Dermatologia">Dermatologia</SelectItem>
                  <SelectItem value="Eletrocardiograma">Eletrocardiograma</SelectItem>
                  <SelectItem value="Endocrinologia">Endocrinologia</SelectItem>
                  <SelectItem value="Fisioterapeuta">Fisioterapeuta</SelectItem>
                  <SelectItem value="Gastroenterologia">Gastroenterologia</SelectItem>
                  <SelectItem value="Geriatria">Geriatria</SelectItem>
                  <SelectItem value="Ginecologia">Ginecologia</SelectItem>
                  <SelectItem value="Hidroginástica">Hidroginástica</SelectItem>
                  <SelectItem value="Hidroterapia">Hidroterapia</SelectItem>
                  <SelectItem value="Massoterapia">Massoterapia</SelectItem>
                  <SelectItem value="Natação">Natação</SelectItem>
                  <SelectItem value="Neurologia">Neurologia</SelectItem>
                  <SelectItem value="Neuropediatra">Neuropediatra</SelectItem>
                  <SelectItem value="Nutricionista">Nutricionista</SelectItem>
                  <SelectItem value="Odontologia">Odontologia</SelectItem>
                  <SelectItem value="Oftalmologia">Oftalmologia</SelectItem>
                  <SelectItem value="Optometrista">Optometrista</SelectItem>
                  <SelectItem value="Ortopedia">Ortopedia</SelectItem>
                  <SelectItem value="Otorrinolaringologia">Otorrinolaringologia</SelectItem>
                  <SelectItem value="Pediatria">Pediatria</SelectItem>
                  <SelectItem value="Pilates">Pilates</SelectItem>
                  <SelectItem value="Pneumologia">Pneumologia</SelectItem>
                  <SelectItem value="Psicologia">Psicologia</SelectItem>
                  <SelectItem value="Psicopedagoga">Psicopedagoga</SelectItem>
                  <SelectItem value="Psiquiatria">Psiquiatria</SelectItem>
                  <SelectItem value="Quiropraxia">Quiropraxia</SelectItem>
                  <SelectItem value="Traumatologia">Traumatologia</SelectItem>
                  <SelectItem value="Urologia">Urologia</SelectItem>
                  <SelectItem value="Vendas Cartão">Vendas Cartão</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={formData.telefone}
                  onChange={(e) => handleInputChange('telefone', e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="medico@email.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tipo_atendimento">Tipo de Atendimento</Label>
                <Select value={formData.tipo_atendimento} onValueChange={(value) => handleInputChange('tipo_atendimento', value)}>
                  <SelectTrigger id="tipo_atendimento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Horários Marcados">Horários Marcados</SelectItem>
                    <SelectItem value="Ordem de Chegada">Ordem de Chegada</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.tipo_atendimento === 'Ordem de Chegada' && (
                <div>
                  <Label htmlFor="limite_ordem_chegada">Pacientes por Horário</Label>
                  <Input
                    id="limite_ordem_chegada"
                    type="number"
                    min="1"
                    value={formData.limite_ordem_chegada}
                    onChange={(e) => handleInputChange('limite_ordem_chegada', e.target.value)}
                  />
                </div>
              )}

              <div>
                <Label htmlFor="tempo_consulta">Duração da Consulta (minutos)</Label>
                <Input
                  id="tempo_consulta"
                  type="number"
                  value={formData.tempo_consulta_minutos}
                  onChange={(e) => handleInputChange('tempo_consulta_minutos', e.target.value)}
                  placeholder="30"
                />
              </div>

              <div>
                <Label htmlFor="tempo_consulta_2">2ª Duração da Consulta (minutos)</Label>
                <Input
                  id="tempo_consulta_2"
                  type="number"
                  value={formData.tempo_consulta_minutos_2}
                  onChange={(e) => handleInputChange('tempo_consulta_minutos_2', e.target.value)}
                  placeholder="Opcional (ex: 20)"
                />
                <p className="text-xs text-gray-500 mt-1">Se preenchido, poderá escolher qual duração usar em cada horário de atendimento.</p>
              </div>

              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange('status', value)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                    <SelectItem value="Férias">Férias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="horarios" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horários de Atendimento</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.horarios_atendimento.map((horario, index) => (
                  <div key={index} className={`flex gap-2 items-end p-3 border rounded-lg ${horario.bloqueado ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
                    <div className="flex-1 space-y-2">
                      {horario.bloqueado && (
                        <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
                          <Lock className="w-3 h-3" /> AGENDA BLOQUEADA
                        </div>
                      )}
                      <div className={`grid ${formData.tempo_consulta_minutos_2 ? 'grid-cols-6' : 'grid-cols-5'} gap-2`}>
                        <div>
                          <Label className="text-xs">Dia da Semana</Label>
                          <Select 
                            value={(horario.dia_semana ?? 1).toString()} 
                            onValueChange={(value) => handleHorarioChange(index, 'dia_semana', value)}
                            disabled={!!horario.data_especifica}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {diasSemana.map(dia => (
                                <SelectItem key={dia.value} value={dia.value.toString()}>
                                  {dia.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Início</Label>
                          <Input
                            type="time"
                            value={horario.horario_inicio}
                            onChange={(e) => handleHorarioChange(index, 'horario_inicio', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Fim</Label>
                          <Input
                            type="time"
                            value={horario.horario_fim}
                            onChange={(e) => handleHorarioChange(index, 'horario_fim', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Recorrência</Label>
                          <Select 
                            value={horario.recorrencia || 'Toda Semana'} 
                            onValueChange={(value) => handleHorarioChange(index, 'recorrencia', value)}
                            disabled={!!horario.data_especifica}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {recorrenciaOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Data Específica</Label>
                          <Input
                            type="date"
                            value={horario.data_especifica || ''}
                            onChange={(e) => handleHorarioChange(index, 'data_especifica', e.target.value || null)}
                            placeholder="Opcional"
                          />
                        </div>
                        {formData.tempo_consulta_minutos_2 && (
                          <div>
                            <Label className="text-xs">Duração</Label>
                            <Select
                              value={horario.tempo_consulta ? horario.tempo_consulta.toString() : 'padrao'}
                              onValueChange={(value) => handleHorarioChange(index, 'tempo_consulta', value === 'padrao' ? null : parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="padrao">{formData.tempo_consulta_minutos || 30} min (padrão)</SelectItem>
                                <SelectItem value={formData.tempo_consulta_minutos_2.toString()}>{formData.tempo_consulta_minutos_2} min</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {horario.data_especifica && (
                        <p className="text-xs text-blue-600">
                          ℹ️ Este horário é para a data específica: {new Date(horario.data_especifica + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        type="button"
                        variant={horario.bloqueado ? "outline" : "secondary"}
                        size="icon"
                        title={horario.bloqueado ? "Desbloquear agenda" : "Bloquear agenda"}
                        onClick={() => {
                          const novosHorarios = [...formData.horarios_atendimento];
                          novosHorarios[index] = { ...novosHorarios[index], bloqueado: !horario.bloqueado };
                          handleInputChange('horarios_atendimento', novosHorarios);
                        }}
                        className={horario.bloqueado ? "border-green-500 text-green-600 hover:bg-green-50" : "text-red-600 hover:bg-red-50"}
                      >
                        {horario.bloqueado ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => handleRemoverHorario(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAdicionarHorario}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Horário
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="financeiro" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração de Repasses de Consulta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertDescription>
                    O cadastro do médico define repasses de consulta. Repasses de procedimentos devem ser configurados no menu Procedimentos.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="tipo_repasse">Tipo de Repasse</Label>
                  <Select 
                    value={formData.tipo_repasse} 
                    onValueChange={(value) => handleInputChange('tipo_repasse', value)}
                  >
                    <SelectTrigger id="tipo_repasse">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentual">Percentual (%)</SelectItem>
                      <SelectItem value="valor_fixo">Valor Fixo (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.tipo_repasse === 'percentual' 
                      ? 'O médico receberá um percentual do valor da consulta'
                      : 'O médico receberá um valor fixo por consulta'
                    }
                  </p>
                </div>

                <Separator className="my-4" />

                {/* Lista ÚNICA de todas as categorias */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3">Repasse por Categoria</h4>
                  <p className="text-xs text-gray-500 mb-4">
                    Configure o repasse de consulta para cada categoria. Todos os campos são obrigatórios — o valor configurado aqui será usado no cálculo da OS.
                  </p>

                  <div className="space-y-3">
                    {categorias.map((categoria) => {
                      const repasseCategoria = formData.repasses_por_categoria?.find(
                        r => r.categoria_id === categoria.id
                      );
                      const valorAtual = repasseCategoria?.valor ?? '';
                      const tipoRepasseCategoria = repasseCategoria?.tipo_repasse || formData.tipo_repasse;
                      const isParticular = categoria.nome?.toUpperCase() === 'PARTICULAR';

                      return (
                        <div 
                          key={categoria.id} 
                          className={`flex items-center gap-3 p-3 border rounded-lg ${isParticular ? 'bg-blue-50 border-blue-200' : 'bg-white hover:bg-gray-50'}`}
                        >
                          <div className="flex-1">
                            <Label className={`font-medium ${isParticular ? 'text-blue-800' : 'text-gray-800'}`}>
                              {categoria.nome}
                              {isParticular && <span className="ml-2 text-xs font-normal text-blue-600">(Principal)</span>}
                            </Label>
                            {categoria.descricao && (
                              <p className="text-xs text-gray-500">{categoria.descricao}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Select
                              value={tipoRepasseCategoria}
                              onValueChange={(value) => {
                                const novosRepasses = [...(formData.repasses_por_categoria || [])];
                                const index = novosRepasses.findIndex(r => r.categoria_id === categoria.id);
                                if (index >= 0) {
                                  novosRepasses[index] = { ...novosRepasses[index], tipo_repasse: value };
                                } else {
                                  novosRepasses.push({ categoria_id: categoria.id, tipo_repasse: value, valor: 0, valor_procedimento: 0 });
                                }
                                handleInputChange('repasses_por_categoria', novosRepasses);
                              }}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentual">%</SelectItem>
                                <SelectItem value="valor_fixo">R$</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              max={tipoRepasseCategoria === 'percentual' ? 100 : undefined}
                              value={valorAtual}
                              onChange={(e) => {
                                const valor = parseFloat(e.target.value) || 0;
                                const novosRepasses = [...(formData.repasses_por_categoria || [])];
                                const index = novosRepasses.findIndex(r => r.categoria_id === categoria.id);
                                if (index >= 0) {
                                  novosRepasses[index] = { ...novosRepasses[index], valor };
                                } else {
                                  novosRepasses.push({ 
                                    categoria_id: categoria.id, 
                                    tipo_repasse: tipoRepasseCategoria, 
                                    valor,
                                    valor_procedimento: 0
                                  });
                                }
                                handleInputChange('repasses_por_categoria', novosRepasses);
                              }}
                              placeholder="0"
                              className="w-24"
                            />
                            <span className="text-xs text-gray-500 w-6">
                              {tipoRepasseCategoria === 'percentual' ? '%' : 'R$'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {categorias.length === 0 && (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        Nenhuma categoria cadastrada. Cadastre categorias de preço primeiro.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <h4 className="font-semibold text-blue-900 mb-2">💡 Como funciona</h4>
                  <div className="text-sm text-blue-800 space-y-1">
                    <p>• O valor configurado em cada categoria é usado diretamente no cálculo da OS.</p>
                    <p>• Se uma categoria não estiver configurada (valor 0), o repasse será R$ 0,00.</p>
                    <p>• Para procedimentos, configure os repasses no menu <strong>Procedimentos → Tabela de Preços</strong>.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar Médico'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}