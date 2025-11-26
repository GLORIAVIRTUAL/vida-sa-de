import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, User, Users } from "lucide-react";
import { VendaCartao, Paciente, CategoriaPreco } from "@/entities/all";
import { format, addYears } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { safeApiCall } from "@/components/shared/apiThrottle";

const LIMITES_DEPENDENTES = {
  "Individual à Vista": 0,
  "Individual Parcelado": 0,
  "Familiar à Vista": 4,
  "Familiar Parcelado": 4,
  "Grupo à Vista": 9,
  "Grupo Parcelado": 9
};

const VALORES_PLANOS = {
  "Individual à Vista": 273.90,
  "Individual Parcelado": 298.80,
  "Familiar à Vista": 438.90,
  "Familiar Parcelado": 478.80,
  "Grupo à Vista": 658.90,
  "Grupo Parcelado": 718.80
};

const CUSTO_CARTAO_FISICO = 5.00;

export default function FormularioVendaCartao({ venda, onClose, onSave }) { // NEW: Recebe venda como prop
  const { toast } = useToast();
  const [salvando, setSalvando] = useState(false);
  
  // NEW: Inicializar com dados da venda se estiver editando
  const [formData, setFormData] = useState(venda ? {
    tipo_plano: venda.tipo_plano || '',
    titular: venda.titular || {
      nome: '',
      cpf: '',
      data_nascimento: '',
      telefone: '',
      email: '',
      endereco: {
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: ''
      }
    },
    dependentes: venda.dependentes || [],
    quantidade_cartoes: venda.quantidade_cartoes || 1,
    valor_cartoes: venda.valor_cartoes || CUSTO_CARTAO_FISICO,
    valor_plano: venda.valor_plano || 0,
    valor_total: venda.valor_total || CUSTO_CARTAO_FISICO,
    forma_pagamento: venda.forma_pagamento || 'Dinheiro',
    numero_parcelas: venda.numero_parcelas || 1,
    valor_parcela: venda.valor_parcela || CUSTO_CARTAO_FISICO,
    data_venda: venda.data_venda || '',
    validade_cartao: venda.validade_cartao || '',
    observacoes: venda.observacoes || ''
  } : {
    tipo_plano: '',
    titular: {
      nome: '',
      cpf: '',
      data_nascimento: '',
      telefone: '',
      email: '',
      endereco: {
        cep: '',
        logradouro: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: ''
      }
    },
    dependentes: [],
    quantidade_cartoes: 1, // Default 1 for the titular
    valor_cartoes: CUSTO_CARTAO_FISICO, // Default cost for 1 card
    valor_plano: 0, // Base value of the selected plan
    valor_total: CUSTO_CARTAO_FISICO, // Initial total with 1 card
    forma_pagamento: 'Dinheiro',
    numero_parcelas: 1,
    valor_parcela: CUSTO_CARTAO_FISICO, // Initial parcel value for 1 card
    observacoes: ''
  });

  const calcularValorTotal = (valorPlano, quantidadeCartoes) => {
    const custoCartoes = quantidadeCartoes * CUSTO_CARTAO_FISICO;
    return (valorPlano || 0) + custoCartoes;
  };

  const handleChange = (field, value) => {
    // Se mudou o tipo de plano, atualizar valor automaticamente
    if (field === 'tipo_plano') {
      const valorPlanoBase = VALORES_PLANOS[value] || 0;
      const quantidadeCartoes = 1 + formData.dependentes.length; // Titular + current dependents
      const custoCartoes = quantidadeCartoes * CUSTO_CARTAO_FISICO;
      const valorTotalCalculado = valorPlanoBase + custoCartoes;
      const parcelas = value.includes('Parcelado') ? 12 : 1;
      const formaPagamento = value.includes('Parcelado') ? 'Cartão Crédito' : formData.forma_pagamento;

      setFormData(prev => ({
        ...prev,
        [field]: value,
        quantidade_cartoes: quantidadeCartoes,
        valor_cartoes: custoCartoes,
        valor_plano: valorPlanoBase,
        valor_total: valorTotalCalculado,
        numero_parcelas: parcelas,
        valor_parcela: valorTotalCalculado / parcelas,
        forma_pagamento: formaPagamento
      }));
      
      return;
    }

    // Se mudou a quantidade de cartões, recalcular
    if (field === 'quantidade_cartoes') {
      const quantidadeCartoes = parseInt(value) || 0;
      const valorTotalCalculado = calcularValorTotal(formData.valor_plano, quantidadeCartoes);
      const parcelas = formData.numero_parcelas > 0 ? formData.numero_parcelas : 1;
      
      setFormData(prev => ({
        ...prev,
        quantidade_cartoes: quantidadeCartoes,
        valor_cartoes: quantidadeCartoes * CUSTO_CARTAO_FISICO,
        valor_total: valorTotalCalculado,
        valor_parcela: valorTotalCalculado / parcelas
      }));
      
      return;
    }
    
    // Calcular valor da parcela automaticamente se mudar numero_parcelas ou valor_total
    if (field === 'numero_parcelas') {
      const parcelas = parseInt(value) || 1;
      setFormData(prev => ({
        ...prev,
        numero_parcelas: parcelas,
        valor_parcela: prev.valor_total / parcelas
      }));
      return;
    }

    if (field === 'valor_total') {
        const novoValorTotal = parseFloat(value) || 0;
        const parcelas = formData.numero_parcelas > 0 ? formData.numero_parcelas : 1;
        setFormData(prev => ({
            ...prev,
            valor_total: novoValorTotal,
            valor_parcela: novoValorTotal / parcelas
        }));
        return;
    }

    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleTitularChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      titular: { ...prev.titular, [field]: value }
    }));
  };

  const handleEnderecoChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      titular: {
        ...prev.titular,
        endereco: { ...prev.titular.endereco, [field]: value }
      }
    }));
  };

  const handleAdicionarDependente = () => {
    const limite = LIMITES_DEPENDENTES[formData.tipo_plano] || 0;
    
    if (formData.dependentes.length >= limite) {
      toast({
        title: "Limite atingido",
        description: `Este plano permite no máximo ${limite} dependente(s)`,
        variant: "destructive"
      });
      return;
    }
    
    const novosDependentes = [...formData.dependentes, { nome: '', cpf: '', data_nascimento: '' }];
    const novaQuantidadeCartoes = 1 + novosDependentes.length; // Titular + novos dependentes
    const novoValorTotal = calcularValorTotal(formData.valor_plano, novaQuantidadeCartoes);
    const parcelas = formData.numero_parcelas > 0 ? formData.numero_parcelas : 1;
    
    setFormData(prev => ({
      ...prev,
      dependentes: novosDependentes,
      quantidade_cartoes: novaQuantidadeCartoes,
      valor_cartoes: novaQuantidadeCartoes * CUSTO_CARTAO_FISICO,
      valor_total: novoValorTotal,
      valor_parcela: novoValorTotal / parcelas
    }));
  };

  const handleRemoverDependente = (index) => {
    const novosDependentes = formData.dependentes.filter((_, i) => i !== index);
    const novaQuantidadeCartoes = 1 + novosDependentes.length; // Titular + novos dependentes
    const novoValorTotal = calcularValorTotal(formData.valor_plano, novaQuantidadeCartoes);
    const parcelas = formData.numero_parcelas > 0 ? formData.numero_parcelas : 1;
    
    setFormData(prev => ({
      ...prev,
      dependentes: novosDependentes,
      quantidade_cartoes: novaQuantidadeCartoes,
      valor_cartoes: novaQuantidadeCartoes * CUSTO_CARTAO_FISICO,
      valor_total: novoValorTotal,
      valor_parcela: novoValorTotal / parcelas
    }));
  };

  const handleDependenteChange = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      dependentes: prev.dependentes.map((dep, i) => 
        i === index ? { ...dep, [field]: value } : dep
      )
    }));
  };

  const buscarCEP = async () => {
    const cep = formData.titular.endereco.cep.replace(/\D/g, '');
    
    if (cep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "O CEP deve conter 8 dígitos",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      
      if (data.erro) {
        toast({
          title: "CEP não encontrado",
          variant: "destructive"
        });
        return;
      }

      setFormData(prev => ({
        ...prev,
        titular: {
          ...prev.titular,
          endereco: {
            ...prev.titular.endereco,
            logradouro: data.logradouro,
            bairro: data.bairro,
            cidade: data.localidade,
            estado: data.uf
          }
        }
      }));

      toast({
        title: "Endereço encontrado!",
        description: "Complete o número e complemento"
      });
    } catch (error) {
      toast({
        title: "Erro ao buscar CEP",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validações
    if (!formData.tipo_plano || !formData.titular.nome || !formData.titular.cpf || !formData.valor_total) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos obrigatórios",
        variant: "destructive"
      });
      return;
    }

    setSalvando(true);
    try {
      // NEW: Verificar se está editando
      if (venda) {
        console.log('✏️ Atualizando venda existente:', venda.id);
        
        // Verificar se a validade foi alterada e atualizar status
        let novoStatus = venda.status;
        if (formData.validade_cartao) {
          const hoje = new Date();
          hoje.setHours(0, 0, 0, 0);
          const novaValidade = new Date(formData.validade_cartao);
          novaValidade.setHours(0, 0, 0, 0);
          
          // Se a nova validade é no futuro e o status era Vencido, mudar para Ativo
          if (novaValidade >= hoje && venda.status === 'Vencido') {
            novoStatus = 'Ativo';
          }
          // Se a nova validade é no passado, marcar como Vencido
          else if (novaValidade < hoje && venda.status !== 'Cancelado') {
            novoStatus = 'Vencido';
          }
        }

        // Atualizar a venda
        await safeApiCall(() => VendaCartao.update(venda.id, {
          tipo_plano: formData.tipo_plano,
          titular: formData.titular,
          dependentes: formData.dependentes,
          quantidade_cartoes: formData.quantidade_cartoes,
          valor_cartoes: formData.valor_cartoes,
          valor_plano: formData.valor_plano,
          valor_total: parseFloat(formData.valor_total),
          forma_pagamento: formData.forma_pagamento,
          numero_parcelas: parseInt(formData.numero_parcelas),
          valor_parcela: parseFloat(formData.valor_parcela),
          data_venda: formData.data_venda,
          validade_cartao: formData.validade_cartao,
          status: novoStatus,
          observacoes: formData.observacoes
        }));

        console.log('✅ Venda atualizada com sucesso!');

        toast({
          title: "Venda atualizada! ✏️",
          description: `Dados de ${formData.titular.nome} atualizados com sucesso`,
          duration: 5000
        });

        await onSave();
        onClose();
        return;
      }

      // Código original para NOVA venda
      console.log('💳 Processando venda do cartão...');
      
      // 1. Buscar categoria "Cartão Mais Vida"
      const categorias = await safeApiCall(() => CategoriaPreco.list());
      const categoriaCartao = categorias.find(c => 
        c.nome.toLowerCase().includes('cartão') && 
        c.nome.toLowerCase().includes('mais') &&
        c.nome.toLowerCase().includes('vida')
      ) || categorias.find(c => c.nome.toLowerCase().includes('cartão'));

      if (!categoriaCartao) {
        throw new Error('Categoria "Cartão Mais Vida" não encontrada. Crie-a primeiro na página de Procedimentos.');
      }

      console.log('✅ Categoria encontrada:', categoriaCartao.nome);

      // 2. Cadastrar titular como paciente
      console.log('👤 Cadastrando titular como paciente...');
      const pacienteTitular = await safeApiCall(() => Paciente.create({
        nome: formData.titular.nome,
        cpf: formData.titular.cpf,
        data_nascimento: formData.titular.data_nascimento,
        telefone: formData.titular.telefone,
        endereco: formData.titular.endereco,
        convenio: categoriaCartao.nome,
        observacoes: `Cliente do Cartão Mais Vida - ${formData.tipo_plano}`
      }));
      
      console.log('✅ Titular cadastrado:', pacienteTitular.id);

      // 3. Cadastrar dependentes como pacientes
      const dependentesIds = [];
      if (formData.dependentes.length > 0) {
        console.log(`👨‍👩‍👧‍👦 Cadastrando ${formData.dependentes.length} dependente(s)...`);
        
        for (const dependente of formData.dependentes) {
          const pacienteDependente = await safeApiCall(() => Paciente.create({
            nome: dependente.nome,
            cpf: dependente.cpf,
            data_nascimento: dependente.data_nascimento,
            telefone: formData.titular.telefone, // Usar telefone do titular
            endereco: formData.titular.endereco, // Usar endereço do titular
            convenio: categoriaCartao.nome,
            observacoes: `Dependente de ${formData.titular.nome} - Cartão Mais Vida ${formData.tipo_plano}`
          }));
          
          dependentesIds.push(pacienteDependente.id);
          console.log('✅ Dependente cadastrado:', pacienteDependente.id);
        }
      }

      // 4. Gerar número da venda
      const numeroVenda = `CMV-${Date.now()}`;
      
      // 5. Calcular validade (1 ano)
      const dataVenda = format(new Date(), 'yyyy-MM-dd');
      const validadeCartao = format(addYears(new Date(), 1), 'yyyy-MM-dd');

      // 6. Criar registro da venda
      console.log('💾 Salvando venda...');
      await safeApiCall(() => VendaCartao.create({
        numero_venda: numeroVenda,
        tipo_plano: formData.tipo_plano,
        titular: formData.titular,
        dependentes: formData.dependentes,
        paciente_titular_id: pacienteTitular.id,
        pacientes_dependentes_ids: dependentesIds,
        quantidade_cartoes: formData.quantidade_cartoes,
        valor_cartoes: formData.valor_cartoes,
        valor_plano: formData.valor_plano,
        valor_total: parseFloat(formData.valor_total),
        forma_pagamento: formData.forma_pagamento,
        numero_parcelas: parseInt(formData.numero_parcelas),
        valor_parcela: parseFloat(formData.valor_parcela),
        data_venda: dataVenda,
        validade_cartao: validadeCartao,
        status: 'Ativo',
        observacoes: formData.observacoes
      }));

      console.log('✅ Venda registrada com sucesso!');

      toast({
        title: "Venda realizada com sucesso! 🎉",
        description: `${formData.quantidade_cartoes} cartão(ões) emitido(s) para ${formData.titular.nome}`,
        duration: 5000
      });

      await onSave();
      onClose();

    } catch (error) {
      console.error('❌ Erro:', error);
      toast({
        title: "Erro ao processar venda",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSalvando(false);
    }
  };

  // +1 for the titular, limitAtual for dependents
  const limiteMaximoCartoes = formData.tipo_plano ? (LIMITES_DEPENDENTES[formData.tipo_plano] || 0) + 1 : 1;
  const limiteAtualDependentes = formData.tipo_plano ? (LIMITES_DEPENDENTES[formData.tipo_plano] || 0) : 0;


  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png"
              alt="Cartão Mais Vida"
              className="h-10"
            />
            {venda ? 'Editar Venda - Cartão Mais Vida' : 'Nova Venda - Cartão Mais Vida'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seleção do Plano */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Plano Contratado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="tipo_plano">Tipo de Plano *</Label>
                  <Select
                    value={formData.tipo_plano}
                    onValueChange={(value) => handleChange('tipo_plano', value)}
                    disabled={!!venda} // Disable if editing, plan type should generally not change
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Individual à Vista">
                        💳 Individual à Vista - R$ {VALORES_PLANOS["Individual à Vista"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                      <SelectItem value="Individual Parcelado">
                        💳 Individual Parcelado (12x) - R$ {VALORES_PLANOS["Individual Parcelado"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                      <SelectItem value="Familiar à Vista">
                        👨‍👩‍👧 Familiar à Vista (até 4 dependentes) - R$ {VALORES_PLANOS["Familiar à Vista"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                      <SelectItem value="Familiar Parcelado">
                        👨‍👩‍👧 Familiar Parcelado (12x, até 4 dependentes) - R$ {VALORES_PLANOS["Familiar Parcelado"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                      <SelectItem value="Grupo à Vista">
                        👨‍👩‍👧‍👦 Grupo à Vista (até 9 dependentes) - R$ {VALORES_PLANOS["Grupo à Vista"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                      <SelectItem value="Grupo Parcelado">
                        👨‍👩‍👧‍👦 Grupo Parcelado (12x, até 9 dependentes) - R$ {VALORES_PLANOS["Grupo Parcelado"].toFixed(2).replace('.', ',')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* NOVO: Seção de Cartões Físicos */}
                <div className="col-span-2 bg-blue-50 p-4 rounded-lg border-2 border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                    💳 Cartões Físicos
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="quantidade_cartoes">Quantidade de Cartões</Label>
                      <Input
                        id="quantidade_cartoes"
                        type="number"
                        min="1"
                        max={limiteMaximoCartoes}
                        value={formData.quantidade_cartoes}
                        onChange={(e) => handleChange('quantidade_cartoes', e.target.value)}
                        className="font-semibold"
                      />
                      <p className="text-xs text-blue-600 mt-1">
                        {formData.quantidade_cartoes} cartão(ões) × R$ {CUSTO_CARTAO_FISICO.toFixed(2).replace('.', ',')}
                      </p>
                    </div>
                    <div>
                      <Label>Custo dos Cartões</Label>
                      <Input
                        value={`R$ ${formData.valor_cartoes.toFixed(2).replace('.', ',')}`}
                        disabled
                        className="bg-blue-100 font-semibold text-blue-900"
                      />
                    </div>
                    <div>
                      <Label>Valor do Plano Base</Label>
                      <Input
                        value={`R$ ${formData.valor_plano.toFixed(2).replace('.', ',')}`}
                        disabled
                        className="bg-gray-100 font-semibold"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-blue-700 mt-3">
                    💡 <strong>Cálculo:</strong> Plano Base (R$ {formData.valor_plano.toFixed(2).replace('.', ',')}) + {formData.quantidade_cartoes} Cartão(ões) (R$ {formData.valor_cartoes.toFixed(2).replace('.', ',')}) = <strong>R$ {formData.valor_total.toFixed(2).replace('.', ',')}</strong>
                  </p>
                </div>

                <div>
                  <Label htmlFor="valor_total">Valor Total *</Label>
                  <Input
                    id="valor_total"
                    type="number"
                    step="0.01"
                    value={formData.valor_total}
                    onChange={(e) => handleChange('valor_total', e.target.value)}
                    placeholder="R$ 0,00"
                    className="font-semibold text-green-700 text-lg"
                  />
                </div>

                <div>
                  <Label htmlFor="forma_pagamento">Forma de Pagamento *</Label>
                  <Select
                    value={formData.forma_pagamento}
                    onValueChange={(value) => handleChange('forma_pagamento', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                      <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                      <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                      <SelectItem value="PIX">PIX</SelectItem>
                      <SelectItem value="Transferência">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formData.tipo_plano.includes('Parcelado') && (
                  <>
                    <div>
                      <Label htmlFor="numero_parcelas">Número de Parcelas</Label>
                      <Input
                        id="numero_parcelas"
                        type="number"
                        min="1"
                        max="12"
                        value={formData.numero_parcelas}
                        onChange={(e) => handleChange('numero_parcelas', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Valor da Parcela</Label>
                      <Input
                        value={`R$ ${formData.valor_parcela.toFixed(2).replace('.', ',')}`}
                        disabled
                        className="bg-gray-100 font-semibold"
                      />
                    </div>
                  </>
                )}

                {/* Campos de Data - apenas para edição */}
                {venda && (
                  <>
                    <div>
                      <Label htmlFor="data_venda">Data da Venda</Label>
                      <Input
                        id="data_venda"
                        type="date"
                        value={formData.data_venda}
                        onChange={(e) => handleChange('data_venda', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="validade_cartao">Validade do Cartão</Label>
                      <Input
                        id="validade_cartao"
                        type="date"
                        value={formData.validade_cartao}
                        onChange={(e) => handleChange('validade_cartao', e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dados do Titular */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Dados do Titular
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="titular_nome">Nome Completo *</Label>
                  <Input
                    id="titular_nome"
                    value={formData.titular.nome}
                    onChange={(e) => handleTitularChange('nome', e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>

                <div>
                  <Label htmlFor="titular_cpf">CPF *</Label>
                  <Input
                    id="titular_cpf"
                    value={formData.titular.cpf}
                    onChange={(e) => handleTitularChange('cpf', e.target.value)}
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <Label htmlFor="titular_data_nascimento">Data de Nascimento</Label>
                  <Input
                    id="titular_data_nascimento"
                    type="date"
                    value={formData.titular.data_nascimento}
                    onChange={(e) => handleTitularChange('data_nascimento', e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="titular_telefone">Telefone</Label>
                  <Input
                    id="titular_telefone"
                    value={formData.titular.telefone}
                    onChange={(e) => handleTitularChange('telefone', e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="titular_email">Email</Label>
                  <Input
                    id="titular_email"
                    type="email"
                    value={formData.titular.email || ''}
                    onChange={(e) => handleTitularChange('email', e.target.value)}
                    placeholder="email@exemplo.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="cep">CEP</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cep"
                      value={formData.titular.endereco.cep}
                      onChange={(e) => handleEnderecoChange('cep', e.target.value)}
                      placeholder="00000-000"
                    />
                    <Button type="button" variant="outline" onClick={buscarCEP}>
                      Buscar
                    </Button>
                  </div>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="logradouro">Logradouro</Label>
                  <Input
                    id="logradouro"
                    value={formData.titular.endereco.logradouro}
                    onChange={(e) => handleEnderecoChange('logradouro', e.target.value)}
                    placeholder="Rua, Avenida..."
                  />
                </div>

                <div>
                  <Label htmlFor="numero">Número</Label>
                  <Input
                    id="numero"
                    value={formData.titular.endereco.numero}
                    onChange={(e) => handleEnderecoChange('numero', e.target.value)}
                    placeholder="Nº"
                  />
                </div>

                <div>
                  <Label htmlFor="complemento">Complemento</Label>
                  <Input
                    id="complemento"
                    value={formData.titular.endereco.complemento}
                    onChange={(e) => handleEnderecoChange('complemento', e.target.value)}
                    placeholder="Apto, Bloco..."
                  />
                </div>

                <div>
                  <Label htmlFor="bairro">Bairro</Label>
                  <Input
                    id="bairro"
                    value={formData.titular.endereco.bairro}
                    onChange={(e) => handleEnderecoChange('bairro', e.target.value)}
                    placeholder="Bairro"
                  />
                </div>

                <div>
                  <Label htmlFor="cidade">Cidade</Label>
                  <Input
                    id="cidade"
                    value={formData.titular.endereco.cidade}
                    onChange={(e) => handleEnderecoChange('cidade', e.target.value)}
                    placeholder="Cidade"
                  />
                </div>

                <div>
                  <Label htmlFor="estado">Estado</Label>
                  <Input
                    id="estado"
                    value={formData.titular.endereco.estado}
                    onChange={(e) => handleEnderecoChange('estado', e.target.value)}
                    placeholder="UF"
                    maxLength={2}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Dependentes */}
          {limiteAtualDependentes > 0 && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Dependentes ({formData.dependentes.length}/{limiteAtualDependentes})
                  </CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAdicionarDependente}
                    disabled={formData.dependentes.length >= limiteAtualDependentes}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar Dependente
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {formData.dependentes.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>Nenhum dependente adicionado</p>
                    <p className="text-sm">Clique em "Adicionar Dependente" para incluir</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {formData.dependentes.map((dep, index) => (
                      <div key={index} className="p-4 border rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                          <h4 className="font-semibold">Dependente {index + 1}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoverDependente(index)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label>Nome Completo</Label>
                            <Input
                              value={dep.nome}
                              onChange={(e) => handleDependenteChange(index, 'nome', e.target.value)}
                              placeholder="Nome completo"
                            />
                          </div>
                          <div>
                            <Label>CPF</Label>
                            <Input
                              value={dep.cpf}
                              onChange={(e) => handleDependenteChange(index, 'cpf', e.target.value)}
                              placeholder="000.000.000-00"
                            />
                          </div>
                          <div>
                            <Label>Data de Nascimento</Label>
                            <Input
                              type="date"
                              value={dep.data_nascimento}
                              onChange={(e) => handleDependenteChange(index, 'data_nascimento', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Informações adicionais sobre a venda..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando} className="bg-teal-600 hover:bg-teal-700">
              {salvando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {venda ? 'Atualizando...' : 'Processando Venda...'}
                </>
              ) : (
                venda ? 'Atualizar Venda' : 'Finalizar Venda'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}