import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Save, Info } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function CadastroRapidoPaciente({ open, onClose, nomeInicial, telefoneInicial }) {
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    convenio: 'Particular'
  });
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setFormData({
        nome: nomeInicial || '',
        cpf: '',
        telefone: telefoneInicial || '',
        convenio: 'Particular'
      });
      carregarCategorias();
    }
  }, [open, nomeInicial, telefoneInicial]);

  const carregarCategorias = async () => {
    setLoading(true);
    try {
      const cats = await base44.entities.CategoriaPreco.filter({ status: 'Ativo' });
      setCategorias(Array.isArray(cats) ? cats : []);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSalvar = async () => {
    if (!formData.nome || !formData.cpf || !formData.telefone) {
      alert('Nome, CPF e telefone são obrigatórios');
      return;
    }

    setSalvando(true);
    try {
      const paciente = await base44.entities.Paciente.create({
        nome: formData.nome,
        cpf: formData.cpf,
        telefone: formData.telefone,
        convenio: formData.convenio,
        prioridade: 'Normal',
        status: 'Ativo'
      });

      // Fechar modal e navegar para a página de pacientes para completar cadastro
      onClose();
      navigate(createPageUrl('Pacientes') + '?cadastroRapido=concluido');
    } catch (error) {
      console.error('Erro ao salvar:', error);
      alert('Erro ao salvar paciente: ' + error.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleCompletarDepois = () => {
    onClose();
    const params = new URLSearchParams();
    params.set('nome', formData.nome);
    params.set('telefone', formData.telefone);
    params.set('abrirForm', 'true');
    navigate(createPageUrl('Pacientes') + '?' + params.toString());
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">👤</span>
            Cadastro Rápido de Paciente
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-gray-600 mb-4">
          Cadastre apenas o essencial agora. Complete os dados depois na página de Pacientes.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="nome">Nome Completo *</Label>
            <Input
              id="nome"
              value={formData.nome}
              onChange={(e) => handleChange('nome', e.target.value)}
              placeholder="Ex: João da Silva"
              required
            />
          </div>

          <div>
            <Label htmlFor="cpf">CPF *</Label>
            <Input
              id="cpf"
              value={formData.cpf}
              onChange={(e) => handleChange('cpf', e.target.value)}
              placeholder="Ex: 123.456.789-00"
              required
            />
          </div>

          <div>
            <Label htmlFor="telefone">Telefone *</Label>
            <Input
              id="telefone"
              value={formData.telefone}
              onChange={(e) => handleChange('telefone', e.target.value)}
              placeholder="Ex: (51) 99999-9999"
              required
            />
          </div>

          <div>
            <Label htmlFor="convenio">Convênio *</Label>
            <Select 
              value={formData.convenio} 
              onValueChange={(value) => handleChange('convenio', value)}
              disabled={loading}
            >
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
            <p className="text-xs text-gray-500 mt-1">
              💡 O convênio define automaticamente a categoria de preço nos agendamentos
            </p>
          </div>

          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription>
              Após salvar, complete o cadastro com endereço e outras informações na página{' '}
              <strong>Pacientes</strong>.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSalvar} 
              disabled={salvando || !formData.nome || !formData.cpf || !formData.telefone}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {salvando ? (
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}