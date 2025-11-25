
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Save } from "lucide-react";

const tiposExame = ["Sangue", "Urina", "Fezes", "Imagem", "Cardiológico", "Neurológico", "Outros"];

export default function FormularioExame({ exame, onSalvar, onCancelar }) {
  const [formData, setFormData] = useState({
    nome: "",
    codigo: "",
    tipo: "Sangue",
    laboratorio_parceiro: "",
    valor_particular: 0,
    valor_convenio: 0,
    percentual_repasse_laboratorio: 0,
    tempo_resultado: "",
    preparo_necessario: false,
    instrucoes_preparo: "",
    status: "Ativo"
  });

  useEffect(() => {
    if (exame) {
      setFormData(exame);
    }
  }, [exame]);

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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b"><div className="flex justify-between items-center">
          <CardTitle>{exame ? "Editar Exame" : "Novo Exame"}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onCancelar}><X className="w-4 h-4" /></Button>
        </div></CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2"> {/* Removed md:col-span-2 */}
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={formData.nome} onChange={(e) => handleInputChange("nome", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="codigo">Código</Label>
                <Input id="codigo" value={formData.codigo} onChange={(e) => handleInputChange("codigo", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={formData.tipo} onValueChange={(value) => handleInputChange("tipo", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{tiposExame.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2"> {/* Removed md:col-span-2 */}
                <Label htmlFor="laboratorio_parceiro">Laboratório Parceiro</Label>
                <Input id="laboratorio_parceiro" value={formData.laboratorio_parceiro} onChange={(e) => handleInputChange("laboratorio_parceiro", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor_particular">Valor Particular (R$)</Label> {/* Removed '*' */}
                <Input 
                  id="valor_particular" 
                  type="number" 
                  step="0.01" 
                  value={formData.valor_particular} 
                  onChange={(e) => handleInputChange("valor_particular", parseFloat(parseFloat(e.target.value || 0).toFixed(2)))} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor_convenio">Valor Convênio (R$)</Label>
                <Input 
                  id="valor_convenio" 
                  type="number" 
                  step="0.01" 
                  value={formData.valor_convenio} 
                  onChange={(e) => handleInputChange("valor_convenio", parseFloat(parseFloat(e.target.value || 0).toFixed(2)))} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="percentual_repasse_laboratorio">Repasse Lab. (%)</Label>
                <Input id="percentual_repasse_laboratorio" type="number" min="0" max="100" value={formData.percentual_repasse_laboratorio} onChange={(e) => handleInputChange("percentual_repasse_laboratorio", parseFloat(e.target.value) || 0)} />
              </div>
               <div className="space-y-2">
                <Label htmlFor="tempo_resultado">Tempo p/ Resultado</Label>
                <Input id="tempo_resultado" value={formData.tempo_resultado} onChange={(e) => handleInputChange("tempo_resultado", e.target.value)} placeholder="Ex: 24h, 3 dias" />
              </div>
              <div className="md:col-span-2 space-y-2"> {/* New wrapper div and reordered */}
                 <div className="flex items-center space-x-2 pt-6">
                   <Checkbox id="preparo_necessario" checked={formData.preparo_necessario} onCheckedChange={(checked) => handleInputChange("preparo_necessario", checked)} />
                   <Label htmlFor="preparo_necessario">Requer preparo especial</Label>
                </div>
              </div>
               <div className="space-y-2 md:col-span-2"> {/* Added md:col-span-2 and reordered */}
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formData.preparo_necessario && (
              <div className="space-y-2">
                <Label htmlFor="instrucoes_preparo">Instruções de Preparo</Label>
                <Textarea id="instrucoes_preparo" value={formData.instrucoes_preparo} onChange={(e) => handleInputChange("instrucoes_preparo", e.target.value)} />
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t p-6 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700"><Save className="w-4 h-4 mr-2" />Salvar</Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
