
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter } from "lucide-react";

const especialidades = ["Cardiologia", "Dermatologia", "Eletrocardiograma", "Ginecologia", "Pediatria", "Ortopedia", "Neurologia", "Psiquiatria", "Oftalmologia", "Urologia", "Endocrinologia", "Gastroenterologia", "Pneumologia", "Clínico Geral", "Pilates"];

export default function FiltrosMedicos({ filtros, onFiltrosChange }) {
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
              placeholder="Buscar por nome ou CRM..."
              value={filtros.busca}
              onChange={(e) => handleFiltroChange("busca", e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select 
              value={filtros.especialidade} 
              onValueChange={(value) => handleFiltroChange("especialidade", value)}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Especialidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as especialidades</SelectItem>
                {especialidades.map(esp => <SelectItem key={esp} value={esp}>{esp}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

           <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select 
              value={filtros.status} 
              onValueChange={(value) => handleFiltroChange("status", value)}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="Ativo">Ativo</SelectItem>
                <SelectItem value="Inativo">Inativo</SelectItem>
                <SelectItem value="Férias">Férias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
