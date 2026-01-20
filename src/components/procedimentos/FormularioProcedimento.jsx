import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Procedimento, TabelaPreco } from '@/entities/all'; // TabelaPreco is already here, CategoriaPreco is not used in the outline, Procedimento is
import { Loader2, Plus, Trash2, Package } from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";

const especialidades = [
  "Cardiologia", "Clínico Geral", "Dermatologia", "Eletrocardiograma", "Endocrinologia", "Fisioterapeuta",
  "Gastroenterologia", "Geral", "Geriatria", "Ginecologia", "Hidroginástica", "Hidroterapia",
  "Massoterapia", "Neurologia", "Neuropediatra", "Nutricionista", "Odontologia", "Oftalmologia",
  "Optometrista", "Ortopedia", "Otorrinolaringologia", "Pediatria", "Pilates", "Pneumologia",
  "Psicologia", "Psicopedagoga", "Psiquiatria", "Quiropraxia", "Traumatologia", "Urologia"
];

export default function FormularioProcedimento({ procedimento, categorias, precosExistentes, onClose, onSave, todosProcedimentos = [] }) {
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    especialidade: '',
    duracao_minutos: '',
    valor_repasse_medico: '',
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
        valor_repasse_medico: procedimento.valor_repasse_medico !== null ? String(procedimento.valor_repasse_medico) : '',
        descricao: procedimento.descricao || '',
        status: procedimento.status || 'Ativo',
        is_pacote: procedimento.is_pacote || false,
        itens_pacote: procedimento.itens_pacote || [],
        desconto_pacote: procedimento.desconto_pacote !== null ? String(procedimento.desconto_pacote) : ''
      });
      const precosIniciais = {};
      categorias.forEach(cat => {
        const precoExistente = precosExistentes.find(p => p.categoria_id === cat.id);
        precosIniciais[cat.id] = precoExistente ? String(precoExistente.valor) : '';
      });
      setPrecos(precosIniciais);
    }
  }, [procedimento, categorias, precosExistentes]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePrecoChange = (categoriaId, value) => {
    setPrecos(prev => ({ ...prev, [categoriaId]: value }));
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
      // CORREÇÃO: Converte strings vazias para null para campos numéricos
      const dataToSave = {
        ...formData,
        duracao_minutos: formData.duracao_minutos ? Number(formData.duracao_minutos) : null,
        valor_repasse_medico: formData.valor_repasse_medico ? Number(formData.valor_repasse_medico) : null,
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
        const novoPreco = precos[cat.id];

        if (novoPreco && novoPreco !== '') {
          const valorNumerico = parseFloat(novoPreco);
          if (precoExistente) {
            // Atualizar preço
            return TabelaPreco.update(precoExistente.id, { valor: valorNumerico });
          } else {
            // Criar novo preço
            return TabelaPreco.create({
              procedimento_id: procedimentoId,
              categoria_id: cat.id,
              valor: valorNumerico
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
            Preencha os detalhes do procedimento e defina os preços para cada categoria.
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
              <div>
                <Label htmlFor="valor_repasse_medico">Repasse Médico (R$)</Label>
                <Input type="number" id="valor_repasse_medico" name="valor_repasse_medico" value={formData.valor_repasse_medico} onChange={handleChange} placeholder="0.00" />
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
            <div>
              <Label htmlFor="descricao">Descrição</Label>
              <Textarea id="descricao" name="descricao" value={formData.descricao} onChange={handleChange} />
            </div>
          </div>

          {/* Coluna da Tabela de Preços */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Tabela de Preços (R$)</h3>
            {categorias.map(cat => (
              <div key={cat.id}>
                <Label htmlFor={`preco-${cat.id}`}>{cat.nome}</Label>
                <Input
                  type="number"
                  id={`preco-${cat.id}`}
                  value={precos[cat.id] || ''}
                  onChange={(e) => handlePrecoChange(cat.id, e.target.value)}
                  placeholder="Defina o valor"
                />
              </div>
            ))}
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