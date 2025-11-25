import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

export default function FiltrosPacientes({ filtros, onFiltrosChange }) {
  const handleFiltroChange = (tipo, valor) => {
    onFiltrosChange(prev => ({
      ...prev,
      [tipo]: valor
    }));
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <Input
              placeholder="Buscar por nome, CPF ou telefone..."
              value={filtros.busca}
              onChange={(e) => handleFiltroChange("busca", e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select 
              value={filtros.convenio} 
              onValueChange={(value) => handleFiltroChange("convenio", value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por convênio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                <SelectItem value="Particular">Particular</SelectItem>
                <SelectItem value="Unimed">Unimed</SelectItem>
                <SelectItem value="Bradesco Saúde">Bradesco Saúde</SelectItem>
                <SelectItem value="SulAmérica">SulAmérica</SelectItem>
                <SelectItem value="Amil">Amil</SelectItem>
                <SelectItem value="Golden Cross">Golden Cross</SelectItem>
                <SelectItem value="Porto Seguro">Porto Seguro</SelectItem>
                <SelectItem value="Outros">Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}