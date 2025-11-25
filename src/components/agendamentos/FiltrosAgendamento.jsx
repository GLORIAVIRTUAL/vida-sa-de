
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";

export default function FiltrosAgendamento({ filtros, onFiltrosChange, medicos }) {
  const handleFiltroChange = (tipo, valor) => {
    onFiltrosChange(prev => ({
      ...prev,
      [tipo]: valor
    }));
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros:</span>
          </div>

          <Select 
            value={filtros.periodo} 
            onValueChange={(value) => handleFiltroChange("periodo", value)}
          >
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dia">Dia</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mês</SelectItem>
            </SelectContent>
          </Select>
          
          <Select 
            value={filtros.medico} 
            onValueChange={(value) => handleFiltroChange("medico", value)}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Todos os médicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os médicos</SelectItem>
              {medicos.map((medico) => (
                <SelectItem key={medico.id} value={medico.id}>
                  Dr(a). {medico.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select 
            value={filtros.status} 
            onValueChange={(value) => handleFiltroChange("status", value)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="Agendado">Agendado</SelectItem>
              <SelectItem value="Confirmado">Confirmado</SelectItem>
              <SelectItem value="Em Atendimento">Em Atendimento</SelectItem>
              <SelectItem value="Finalizado">Finalizado</SelectItem>
              <SelectItem value="Cancelado">Cancelado</SelectItem>
              <SelectItem value="Não Compareceu">Não Compareceu</SelectItem>
            </SelectContent>
          </Select>

          <Select 
            value={filtros.tipo} 
            onValueChange={(value) => handleFiltroChange("tipo", value)}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="Consulta">Consulta</SelectItem>
              <SelectItem value="Retorno">Retorno</SelectItem>
              <SelectItem value="Procedimento">Procedimento</SelectItem>
              <SelectItem value="Exame">Exame</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
