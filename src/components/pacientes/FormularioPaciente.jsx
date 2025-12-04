import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Printer } from "lucide-react";
import { CategoriaPreco } from "@/entities/all";

export default function FormularioPaciente({ paciente, onSalvar, onCancelar }) {
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    telefone: '',
    telefone_secundario: '',
    email: '',
    endereco: {
      cep: '',
      logradouro: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: ''
    },
    convenio: 'Particular',
    numero_carteira: '',
    prioridade: 'Normal',
    observacoes: '',
    como_conheceu: '',
    como_conheceu_outro: ''
  });
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState([]);

  // Carregar categorias de preço
  useEffect(() => {
    const carregarCategorias = async () => {
      try {
        const categoriasData = await CategoriaPreco.list();
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      } catch (error) {
        console.error('Erro ao carregar categorias:', error);
        setCategorias([]);
      }
    };
    carregarCategorias();
  }, []);

  useEffect(() => {
    if (paciente) {
      setFormData({
        nome: paciente.nome || '',
        cpf: paciente.cpf || '',
        rg: paciente.rg || '',
        data_nascimento: paciente.data_nascimento || '',
        telefone: paciente.telefone || '',
        telefone_secundario: paciente.telefone_secundario || '',
        email: paciente.email || '',
        endereco: paciente.endereco || {
          cep: '',
          logradouro: '',
          numero: '',
          complemento: '',
          bairro: '',
          cidade: '',
          estado: ''
        },
        convenio: paciente.convenio || 'Particular',
        numero_carteira: paciente.numero_carteira || '',
        prioridade: paciente.prioridade || 'Normal',
        observacoes: paciente.observacoes || '',
        como_conheceu: paciente.como_conheceu || '',
        como_conheceu_outro: paciente.como_conheceu_outro || ''
      });
    }
  }, [paciente]);

  const handleChange = (field, value) => {
    if (field.startsWith('endereco.')) {
      const enderecoField = field.split('.')[1];
      setFormData(prev => ({
        ...prev,
        endereco: {
          ...prev.endereco,
          [enderecoField]: value
        }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const handleCPFChange = (valor) => {
    const numeros = valor.replace(/\D/g, '');
    const limitado = numeros.substring(0, 11);
    const cpfFormatado = limitado
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    handleChange('cpf', cpfFormatado);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSalvar(formData);
    } catch (error) {
      console.error("Erro ao salvar paciente:", error);
      alert("Erro ao salvar paciente: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const comoConheceuOpcoes = [
    "Google", "Facebook", "Instagram", "Panfleto", "Rádio", "TV", "Indicação", "Passou na frente", "Tik Tok", "Outro"
  ];

  const handleImprimir = () => {
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Ficha do Paciente - ${formData.nome}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 10px; line-height: 1.2; color: #333; font-size: 11px; }
          .header { text-align: center; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 5px; }
          .logo { font-size: 16px; font-weight: bold; color: #0d9488; }
          .title { font-size: 13px; margin-top: 5px; font-weight: bold; }
          .section { margin-bottom: 8px; border: 1px solid #ddd; padding: 8px; border-radius: 8px; }
          .section-title { font-weight: bold; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 5px; }
          .row { display: flex; margin-bottom: 3px; }
          .label { font-weight: bold; width: 130px; color: #444; }
          .value { flex: 1; }
          .footer { margin-top: 15px; text-align: center; font-size: 9px; color: #666; border-top: 1px solid #eee; padding-top: 5px; }
          @media print {
            body { padding: 0; }
            .section { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
            <div class="logo">Centro Vida Saúde</div>
            <div class="title">Ficha de Cadastro do Paciente</div>
        </div>

        <div class="section">
            <div class="section-title">Dados Pessoais</div>
            <div class="row"><span class="label">Nome:</span><span class="value">${formData.nome || '-'}</span></div>
            <div class="row"><span class="label">CPF:</span><span class="value">${formData.cpf || '-'}</span></div>
            <div class="row"><span class="label">RG:</span><span class="value">${formData.rg || '-'}</span></div>
            <div class="row"><span class="label">Data Nascimento:</span><span class="value">${formData.data_nascimento ? new Date(formData.data_nascimento).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : '-'}</span></div>
            <div class="row"><span class="label">Telefone:</span><span class="value">${formData.telefone || '-'}</span></div>
            <div class="row"><span class="label">Telefone Secundário:</span><span class="value">${formData.telefone_secundario || '-'}</span></div>
            <div class="row"><span class="label">Email:</span><span class="value">${formData.email || '-'}</span></div>
        </div>

        <div class="section">
            <div class="section-title">Convênio e Prioridade</div>
            <div class="row"><span class="label">Convênio:</span><span class="value">${formData.convenio || '-'}</span></div>
            <div class="row"><span class="label">Carteirinha:</span><span class="value">${formData.numero_carteira || '-'}</span></div>
            <div class="row"><span class="label">Prioridade:</span><span class="value">${formData.prioridade || 'Normal'}</span></div>
        </div>

        <div class="section">
            <div class="section-title">Endereço</div>
            <div class="row"><span class="label">Logradouro:</span><span class="value">${formData.endereco?.logradouro || ''}, ${formData.endereco?.numero || ''}</span></div>
            <div class="row"><span class="label">Complemento:</span><span class="value">${formData.endereco?.complemento || '-'}</span></div>
            <div class="row"><span class="label">Bairro:</span><span class="value">${formData.endereco?.bairro || '-'}</span></div>
            <div class="row"><span class="label">Cidade/UF:</span><span class="value">${formData.endereco?.cidade || '-'} / ${formData.endereco?.estado || '-'}</span></div>
            <div class="row"><span class="label">CEP:</span><span class="value">${formData.endereco?.cep || '-'}</span></div>
        </div>

        <div class="section">
            <div class="section-title">Outras Informações</div>
             <div class="row"><span class="label">Como conheceu:</span><span class="value">${formData.como_conheceu || '-'}${formData.como_conheceu === 'Outro' ? ` (${formData.como_conheceu_outro})` : ''}</span></div>
        </div>

        ${formData.observacoes ? `
        <div class="section">
            <div class="section-title">Observações</div>
            <div>${formData.observacoes}</div>
        </div>
        ` : ''}

        <div class="footer">
            Documento gerado em ${dataAtual}
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
    <Dialog open onOpenChange={onCancelar}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{paciente ? 'Editar Paciente' : 'Novo Paciente'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados Pessoais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">Nome Completo *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                placeholder="Nome completo do paciente"
                required
              />
            </div>

            <div>
              <Label htmlFor="cpf">CPF * (11 dígitos)</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                onChange={(e) => handleCPFChange(e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Digite apenas os 11 números do CPF
              </p>
            </div>

            <div>
              <Label htmlFor="rg">RG</Label>
              <Input
                id="rg"
                value={formData.rg}
                onChange={(e) => handleChange('rg', e.target.value)}
                placeholder="00.000.000-0"
              />
            </div>

            <div>
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input
                id="data_nascimento"
                type="date"
                value={formData.data_nascimento}
                onChange={(e) => handleChange('data_nascimento', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="telefone">Telefone Principal *</Label>
              <Input
                id="telefone"
                value={formData.telefone}
                onChange={(e) => handleChange('telefone', e.target.value)}
                placeholder="(11) 99999-9999"
                required
              />
            </div>

            <div>
              <Label htmlFor="telefone_secundario">Telefone Secundário</Label>
              <Input
                id="telefone_secundario"
                value={formData.telefone_secundario}
                onChange={(e) => handleChange('telefone_secundario', e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="como_conheceu">Como você conheceu a clínica?</Label>
              <Select
                value={formData.como_conheceu}
                onValueChange={(value) => handleChange('como_conheceu', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma opção" />
                </SelectTrigger>
                <SelectContent>
                  {comoConheceuOpcoes.map(opcao => (
                    <SelectItem key={opcao} value={opcao}>{opcao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.como_conheceu === 'Outro' && (
                <div className="mt-2">
                  <Input
                    id="como_conheceu_outro"
                    value={formData.como_conheceu_outro || ''}
                    onChange={(e) => handleChange('como_conheceu_outro', e.target.value)}
                    placeholder="Por favor, especifique qual..."
                  />
                </div>
              )}
            </div>
          </div>

          {/* Prioridade */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <Label htmlFor="prioridade" className="text-base font-medium">
              Tipo de Prioridade (Lei 10.048/2000)
            </Label>
            <Select 
              value={formData.prioridade}
              onValueChange={(value) => handleChange('prioridade', value)}
            >
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Normal">Normal</SelectItem>
                <SelectItem value="Idoso (60+ anos)">🧓 Idoso (60+ anos)</SelectItem>
                <SelectItem value="Deficiente Físico">♿ Deficiente Físico</SelectItem>
                <SelectItem value="Gestante">🤱 Gestante</SelectItem>
                <SelectItem value="Lactante">🍼 Lactante</SelectItem>
                <SelectItem value="Criança de Colo">👶 Criança de Colo</SelectItem>
                <SelectItem value="Pessoa com Criança de Colo">👨‍👶 Pessoa com Criança de Colo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Convênio */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="convenio">Convênio</Label>
              <Select value={formData.convenio} onValueChange={(value) => handleChange('convenio', value)}>
                <SelectTrigger id="convenio">
                  <SelectValue placeholder="Selecione o convênio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Particular">Particular</SelectItem>
                  {categorias
                    .filter(c => c.nome !== 'Particular' && c.nome !== 'PARTICULAR')
                    .map(categoria => (
                      <SelectItem key={categoria.id} value={categoria.nome}>
                        {categoria.nome}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="numero_carteira">Número da Carteira</Label>
              <Input
                id="numero_carteira"
                value={formData.numero_carteira}
                onChange={(e) => handleChange('numero_carteira', e.target.value)}
                placeholder="Número da carteirinha"
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="cep">CEP</Label>
                <Input
                  id="cep"
                  value={formData.endereco?.cep || ""}
                  onChange={(e) => handleChange('endereco.cep', e.target.value)}
                  placeholder="00000-000"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="logradouro">Logradouro</Label>
                <Input
                  id="logradouro"
                  value={formData.endereco?.logradouro || ""}
                  onChange={(e) => handleChange('endereco.logradouro', e.target.value)}
                  placeholder="Rua, Avenida, etc."
                />
              </div>

              <div>
                <Label htmlFor="numero">Número</Label>
                <Input
                  id="numero"
                  value={formData.endereco?.numero || ""}
                  onChange={(e) => handleChange('endereco.numero', e.target.value)}
                  placeholder="123"
                />
              </div>

              <div>
                <Label htmlFor="complemento">Complemento</Label>
                <Input
                  id="complemento"
                  value={formData.endereco?.complemento || ""}
                  onChange={(e) => handleChange('endereco.complemento', e.target.value)}
                  placeholder="Apto, Casa, etc."
                />
              </div>

              <div>
                <Label htmlFor="bairro">Bairro</Label>
                <Input
                  id="bairro"
                  value={formData.endereco?.bairro || ""}
                  onChange={(e) => handleChange('endereco.bairro', e.target.value)}
                  placeholder="Bairro"
                />
              </div>

              <div>
                <Label htmlFor="cidade">Cidade</Label>
                <Input
                  id="cidade"
                  value={formData.endereco?.cidade || ""}
                  onChange={(e) => handleChange('endereco.cidade', e.target.value)}
                  placeholder="Cidade"
                />
              </div>

              <div>
                <Label htmlFor="estado">Estado</Label>
                <Input
                  id="estado"
                  value={formData.endereco?.estado || ""}
                  onChange={(e) => handleChange('endereco.estado', e.target.value)}
                  placeholder="SP"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={formData.observacoes}
              onChange={(e) => handleChange('observacoes', e.target.value)}
              placeholder="Observações importantes sobre o paciente..."
              rows={3}
            />
          </div>

          {/* Botões */}
          <DialogFooter className="gap-2 sm:gap-0">
            {paciente && (
              <Button type="button" variant="secondary" onClick={handleImprimir} className="mr-auto bg-gray-200 hover:bg-gray-300 text-gray-800">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Ficha
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}