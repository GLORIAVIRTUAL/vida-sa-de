import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, Save, AlertCircle } from "lucide-react";
import { Lancamento } from "@/entities/all";
import { base44 } from '@/api/base44Client';
import { isDiaFechado, podeAlterarDiaFechado } from './SenhaRetroativaDialog';

const categoriasEntrada = ["Receita Consultas", "Receita Procedimentos", "Receita Exames", "Outros"];
const categoriasSaida = ["Repasse Médico", "Repasse Laboratório", "Aluguel", "Água/Luz", "Material Médico", "Equipamentos", "Marketing", "Salários", "Impostos", "Outros"];

export default function FormularioLancamento({ onSalvar, onCancelar, tipoInicial = "Entrada" }) {
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  
  useEffect(() => {
    base44.auth.me().then(u => setCurrentUserEmail(u?.email || '')).catch(() => {});
  }, []);

  const [formData, setFormData] = useState({
    tipo: tipoInicial,
    categoria: tipoInicial === "Entrada" ? categoriasEntrada[0] : categoriasSaida[0],
    descricao: "",
    valor: 0,
    data_lancamento: new Date().toISOString().split('T')[0],
    forma_pagamento: "Dinheiro",
    observacoes: ""
  });

  // Verifica se data selecionada é de dia fechado e usuário não é autorizado
  const dataPassadaBloqueada = isDiaFechado(formData.data_lancamento) && !podeAlterarDiaFechado(currentUserEmail);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSalvar(formData);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTipoChange = (novoTipo) => {
    setFormData(prev => ({
      ...prev,
      tipo: novoTipo,
      categoria: novoTipo === "Entrada" ? categoriasEntrada[0] : categoriasSaida[0]
    }));
  };

  const categorias = formData.tipo === "Entrada" ? categoriasEntrada : categoriasSaida;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <CardTitle>Novo Lançamento Financeiro</CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancelar}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo *</Label>
                <Select value={formData.tipo} onValueChange={handleTipoChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entrada">Entrada (Receita)</SelectItem>
                    <SelectItem value="Saída">Saída (Despesa)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <Select value={formData.categoria} onValueChange={(value) => handleInputChange("categoria", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="descricao">Descrição *</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => handleInputChange("descricao", e.target.value)}
                  placeholder="Descrição do lançamento"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$) *</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.valor}
                  onChange={(e) => handleInputChange("valor", parseFloat(e.target.value) || 0)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="data_lancamento">Data *</Label>
                <Input
                  id="data_lancamento"
                  type="date"
                  value={formData.data_lancamento}
                  onChange={(e) => handleInputChange("data_lancamento", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="forma_pagamento">Forma de Pagamento</Label>
                <Select value={formData.forma_pagamento} onValueChange={(value) => handleInputChange("forma_pagamento", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="Cartão Débito">Cartão Débito</SelectItem>
                    <SelectItem value="Cartão Crédito">Cartão Crédito</SelectItem>
                    <SelectItem value="PIX">PIX</SelectItem>
                    <SelectItem value="Transferência">Transferência</SelectItem>
                    <SelectItem value="Boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => handleInputChange("observacoes", e.target.value)}
                placeholder="Observações adicionais..."
                className="h-20"
              />
            </div>
          </CardContent>
          
          <CardFooter className="border-t p-6 flex flex-col gap-3">
            {dataPassadaBloqueada && (
              <Alert variant="destructive" className="w-full">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ⛔ Você não pode lançar em dias anteriores. Apenas o responsável financeiro pode alterar dados de dias fechados.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-3 w-full">
              <Button type="button" variant="outline" onClick={onCancelar}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={dataPassadaBloqueada}>
                <Save className="w-4 h-4 mr-2" />
                Salvar Lançamento
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}