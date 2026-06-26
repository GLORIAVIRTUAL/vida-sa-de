import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Procedimento, TabelaPreco, User } from '@/entities/all';
import { Loader2, Plus, Trash2, Package } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";

const especialidades = [
  "Cardiologia", "Clínico Geral", "Dermatologia", "Eletrocardiograma", "Endocrinologia", "Fisioterapeuta",
  "Gastroenterologia", "Geral", "Geriatria", "Ginecologia", "Hidroginástica", "Hidroterapia",
  "Massoterapia", "Natação", "Neurologia", "Neuropediatra", "Nutricionista", "Odontologia", "Oftalmologia",
  "Optometrista", "Ortopedia", "Otorrinolaringologia", "Pediatria", "Pilates", "Pneumologia",
  "Psicologia", "Psicopedagoga", "Psiquiatria", "Quiropraxia", "Traumatologia", "Urologia"
];

export default function FormularioProcedimento({ procedimento, categorias, precosExistentes, onClose, onSave, todosProcedimentos = [] }) {
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    especialidade: '',
    duracao_minutos: '',
    tipo_repasse: 'valor_fixo',
    valor_repasse_medico: '',
    percentual_repasse_medico: '',
    descricao: '',
    status: 'Ativo',
    is_pacote: false,
    itens_pacote: [],
    desconto_pacote: ''
  });
  const [precos, setPrecos] = useState({});
  const [loading, setLoading] = useState(false);
  const [procedimentoSelecionado, setProcedimentoSelecionado] = useState('');

  useEffect(() => {
    if (procedimento) {
      setFormData({
        nome: procedimento.nome || '',
        codigo: procedimento.codigo || '',
        especialidade: procedimento.especialidade || '',
        duracao_minutos: procedimento.duracao_minutos !== null ? String(procedimento.duracao_minutos) : '',
        tipo_repasse: procedimento.tipo_repasse || 'valor_fixo',
        valor_repasse_medico: procedimento.valor_repasse_medico !== null ? String(procedimento.valor_repasse_medico) : '',
        percentual_repasse_medico: procedimento.percentual_repasse_medico !== null ? String(procedimento.percentual_repasse_medico) : '',
        descricao: procedimento.descricao || '',
        status: procedimento.status || 'Ativo',
        is_pacote: procedimento.is_pacote || false,
        itens_pacote: procedimento.itens_pacote || [],
        desconto_pacote: procedimento.desconto_pacote !== null ? String(procedimento.desconto_pacote) : ''
      });
      const precosIniciais = {};
      categorias.forEach(cat => {
        const precoExistente = precosExistentes.find(p => p.categoria_id === cat.id);
        precosIniciais[cat.id] = {
          valor: precoExistente ? String(precoExistente.valor) : '',
          tipo_repasse: precoExistente?.tipo_repasse || 'valor_fixo',
          valor_repasse: precoExistente?.valor_repasse !== null && precoExistente?.valor_repasse !== undefined ? String(precoExistente.valor_repasse) : '',
          percentual_repasse: precoExistente?.percentual_repasse !== null && precoExistente?.percentual_repasse !== undefined ? String(precoExistente.percentual_repasse) : ''
        };
      });
      setPrecos(precosIniciais);
    }
  }, [procedimento, categorias, precosExistentes]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePrecoChange = (categoriaId, field, value) => {
    setPrecos(prev => ({ 
      ...prev, 
      [categoriaId]: {
        ...(prev[categoriaId] || { valor: '', tipo_repasse: 'valor_fixo', valor_repasse: '', percentual_repasse: '' }),
        [field]: value
      }
    }));
  };

  const adicionarItemPacote = () => {
    if (!procedimentoSelecionado) return;
    const proc = todosProcedimentos.find(p => p.id === procedimentoSelecionado);
    if (!proc) return;
    
    // Verificar se já existe
    if (formData.itens_pacote.some(item => item.procedimento_id === proc.id)) {
      alert('Este serviço já está no pacote');
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      itens_pacote: [...prev.itens_pacote, {
        procedimento_id: proc.id,
        nome: proc.nome,
        quantidade: 1
      }]
    }));
    setProcedimentoSelecionado('');
  };

  const removerItemPacote = (index) => {
    setFormData(prev => ({
      ...prev,
      itens_pacote: prev.itens_pacote.filter((_, i) => i !== index)
    }));
  };

  const atualizarQuantidadeItem = (index, quantidade) => {
    setFormData(prev => ({
      ...prev,
      itens_pacote: prev.itens_pacote.map((item, i) => 
        i === index ? { ...item, quantidade: Math.max(1, parseInt(quantidade) || 1) } : item
      )
    }));
  };

  // Filtrar procedimentos disponíveis (excluindo pacotes e o próprio procedimento)
  const procedimentosDisponiveis = todosProcedimentos.filter(p => 
    !p.is_pacote && p.id !== procedimento?.id && p.status === 'Ativo'
  );

  const handleSave = async () => {
    setLoading(true);
    try {
      // Capturar usuário logado para a auditoria registrar quem alterou
      let usuarioLogado = null;
      try {
        usuarioLogado = await User.me();
      } catch (e) {
        console.warn('Não foi possível identificar o usuário logado:', e.message);
      }

      // CORREÇÃO: Converte strings vazias para null para campos numéricos
      const dataToSave = {
        ...formData,
        duracao_minutos: formData.duracao_minutos ? Number(formData.duracao_minutos) : null,
        tipo_repasse: formData.tipo_repasse,
        valor_repasse_medico: formData.tipo_repasse === 'valor_fixo' && formData.valor_repasse_medico ? Number(formData.valor_repasse_medico) : null,
        percentual_repasse_medico: formData.tipo_repasse === 'percentual' && formData.percentual_repasse_medico ? Number(formData.percentual_repasse_medico) : null,
        desconto_pacote: formData.desconto_pacote ? Number(formData.desconto_pacote) : null,
        itens_pacote: formData.is_pacote ? formData.itens_pacote : [],
        alterado_por_email: usuarioLogado?.email || null,
        alterado_por_nome: usuarioLogado?.full_name || usuarioLogado?.email || null,
      };

      // 1. Salvar ou atualizar o procedimento principal
      let procedimentoSalvo;
      if (procedimento) {
        procedimentoSalvo = await Procedimento.update(procedimento.id, dataToSave);
      } else {
        procedimentoSalvo = await Procedimento.create(dataToSave);
      }
      const procedimentoId = procedimento ? procedimento.id : procedimentoSalvo.id;

      // 2. Salvar, atualizar ou deletar preços
      const pricePromises = categorias.map(async (cat) => {
        const precoExistente = precosExistentes.find(p => p.categoria_id === cat.id);
        const novoPrecoData = precos[cat.id];
        const novoPreco = novoPrecoData?.valor;

        if (novoPreco && novoPreco !== '') {
          const valorNumerico = parseFloat(novoPreco);
          const tipo_repasse = novoPrecoData.tipo_repasse;
          const valor_repasse = tipo_repasse === 'valor_fixo' && novoPrecoData.valor_repasse ? parseFloat(novoPrecoData.valor_repasse) : null;
          const percentual_repasse = tipo_repasse === 'percentual' && novoPrecoData.percentual_repasse ? parseFloat(novoPrecoData.percentual_repasse) : null;

          if (precoExistente) {
            // Atualizar preço
            return TabelaPreco.update(precoExistente.id, { 
              valor: valorNumerico,
              tipo_repasse,
              valor_repasse,
              percentual_repasse
            });
          } else {
            // Criar novo preço
            return TabelaPreco.create({
              procedimento_id: procedimentoId,
              categoria_id: cat.id,
              valor: valorNumerico,
              tipo_repasse,
              valor_repasse,
              percentual_repasse
            });
          }
        } else if (precoExistente) {
          // Deletar preço se o campo for esvaziado
          return TabelaPreco.delete(precoExistente.id);
        }
        return Promise.resolve();
      });

      await Promise.all(pricePromises);
      onSave();
    } catch (error) {
      console.error("Erro ao salvar procedimento:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{procedimento ? "Editar Procedimento" : "Novo Procedimento"}</DialogTitle>
          <DialogDescription>
            Preencha os detalhes do procedimento, defina o repasse do procedimento e os preços para cada categoria.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 max-h-[70vh] overflow-y-auto pr-2">
          {/* Coluna de Dados Gerais */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Dados Gerais</h3>
            <div>
              <Label htmlFor="nome">Nome do Procedimento</Label>
              <Input id="nome" name="nome" value={formData.nome} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="codigo">Código (TUSS, etc.)</Label>
              <Input id="codigo" name="codigo" value={formData.codigo} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="especialidade">Especialidade</Label>
              <Select name="especialidade" value={formData.especialidade} onValueChange={(v) => setFormData(p => ({...p, especialidade: v}))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {especialidades.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="duracao_minutos">Duração (min)</Label>
                <Input type="number" id="duracao_minutos" name="duracao_minutos" value={formData.duracao_minutos} onChange={handleChange} />
              </div>
              <div className="space-y-1">
                <Label>Repasse do Procedimento</Label>
                <div className="flex w-full gap-2">
                  <Select name="tipo_repasse" value={formData.tipo_repasse} onValueChange={(v) => setFormData(p => ({...p, tipo_repasse: v}))}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="valor_fixo">Fixo (R$)</SelectItem>
                      <SelectItem value="percentual">Percent (%)</SelectItem>
                    </SelectContent>
                  </Select>
                  {formData.tipo_repasse === 'valor_fixo' ? (
                    <Input type="number" id="valor_repasse_medico" name="valor_repasse_medico" value={formData.valor_repasse_medico} onChange={handleChange} placeholder="0.00" className="flex-1 min-w-[80px]" />
                  ) : (
                    <Input type="number" id="percentual_repasse_medico" name="percentual_repasse_medico" value={formData.percentual_repasse_medico} onChange={handleChange} placeholder="0 a 100" min="0" max="100" className="flex-1 min-w-[80px]" />
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Todo repasse de procedimento deve ser configurado aqui, não no cadastro do médico.
                </p>
              </div>
            </div>
             <div>
              <Label htmlFor="status">Status</Label>
              <Select name="status" value={formData.status} onValueChange={(v) => setFormData(p => ({...p, status: v}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="is_pacote" 
                checked={formData.is_pacote} 
                onCheckedChange={(checked) => setFormData(p => ({...p, is_pacote: checked}))}
              />
              <Label htmlFor="is_pacote" className="text-sm font-normal cursor-pointer">
                Este é um pacote (ex: consulta + preventivo)
              </Label>
            </div>
            <div>
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" name="descricao" value={formData.descricao} onChange={handleChange} />
            </div>
          </div>

          {/* Coluna da Tabela de Preços */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Tabela de Preços (R$) e Repasse</h3>
            {categorias.map(cat => {
              const precoData = precos[cat.id] || { valor: '', tipo_repasse: 'valor_fixo', valor_repasse: '', percentual_repasse: '' };
              return (
              <div key={cat.id} className="p-3 bg-gray-50 rounded-lg border space-y-3">
                <Label className="font-bold text-base">{cat.nome}</Label>
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label htmlFor={`preco-${cat.id}`} className="text-xs text-gray-500">Valor do Procedimento (R$)</Label>
                    <Input
                      type="number"
                      id={`preco-${cat.id}`}
                      value={precoData.valor}
                      onChange={(e) => handlePrecoChange(cat.id, 'valor', e.target.value)}
                      placeholder="Ex: 150.00"
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Repasse Específico para este plano</Label>
                    <div className="flex w-full gap-2">
                      <Select value={precoData.tipo_repasse} onValueChange={(v) => handlePrecoChange(cat.id, 'tipo_repasse', v)}>
                        <SelectTrigger className="w-[120px] bg-white">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="valor_fixo">Fixo (R$)</SelectItem>
                          <SelectItem value="percentual">Percent (%)</SelectItem>
                        </SelectContent>
                      </Select>
                      {precoData.tipo_repasse === 'valor_fixo' ? (
                        <Input 
                          type="number" 
                          value={precoData.valor_repasse} 
                          onChange={(e) => handlePrecoChange(cat.id, 'valor_repasse', e.target.value)} 
                          placeholder="0.00" 
                          className="flex-1 bg-white" 
                        />
                      ) : (
                        <Input 
                          type="number" 
                          value={precoData.percentual_repasse} 
                          onChange={(e) => handlePrecoChange(cat.id, 'percentual_repasse', e.target.value)} 
                          placeholder="0 a 100" 
                          min="0" max="100" 
                          className="flex-1 bg-white" 
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )})}

            {/* Seção de Pacote */}
            {formData.is_pacote && (
              <div className="mt-6 pt-4 border-t">
                <h3 className="font-semibold text-lg border-b pb-2 flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  Serviços do Pacote
                </h3>
                
                <div className="mt-4 space-y-3">
                  {/* Adicionar serviço */}
                  <div className="flex gap-2">
                    <Select value={procedimentoSelecionado} onValueChange={setProcedimentoSelecionado}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione um serviço..." />
                      </SelectTrigger>
                      <SelectContent>
                        {procedimentosDisponiveis.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="icon" onClick={adicionarItemPacote} disabled={!procedimentoSelecionado}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Lista de itens do pacote */}
                  {formData.itens_pacote.length > 0 ? (
                    <div className="space-y-2">
                      {formData.itens_pacote.map((item, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                          <span className="flex-1 text-sm">{item.nome}</span>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => atualizarQuantidadeItem(index, e.target.value)}
                            className="w-16 h-8 text-center"
                          />
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-500 hover:text-red-700"
                            onClick={() => removerItemPacote(index)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-3">
                      Nenhum serviço adicionado ao pacote
                    </p>
                  )}

                  {/* Desconto do pacote */}
                  <div className="pt-3 border-t mt-3">
                    <Label htmlFor="desconto_pacote">Desconto do Pacote (%)</Label>
                    <Input
                      type="number"
                      id="desconto_pacote"
                      name="desconto_pacote"
                      min="0"
                      max="100"
                      value={formData.desconto_pacote}
                      onChange={handleChange}
                      placeholder="Ex: 10"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Desconto aplicado sobre o valor total dos serviços
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</> : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}