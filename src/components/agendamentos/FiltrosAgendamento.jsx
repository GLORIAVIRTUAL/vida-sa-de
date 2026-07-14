import React, { useMemo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Função para normalizar strings (remover acentos e converter para maiúsculas)
const normalizeString = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

export default function FiltrosAgendamento({ filtros, onFiltrosChange, medicos }) {
  // Agrupar médicos - odontologia e Dr. Ruben viram opções únicas
  const medicosAgrupados = useMemo(() => {
    const medicosOdontologia = medicos.filter(m => normalizeString(m.especialidade) === 'ODONTOLOGIA');
    const medicosRuben = medicos.filter(m => normalizeString(m.nome).includes('RUBEN'));
    const medicosDelazeri = medicos.filter(m => normalizeString(m.nome).includes('DELAZERI'));
    const outrosMedicos = medicos.filter(m => 
      normalizeString(m.especialidade) !== 'ODONTOLOGIA' &&
      !normalizeString(m.nome).includes('RUBEN') &&
      !normalizeString(m.nome).includes('DELAZERI')
    );
    
    const resultado = [];
    
    // Se tem dentistas, criar opção única de Odontologia
    if (medicosOdontologia.length > 0) {
      resultado.push({
        id: medicosOdontologia[0].id, // Usar o ID do primeiro para o filtro
        nome: '🦷 Odontologia',
        especialidade: 'Odontologia',
        isAgrupado: true,
        grupoIds: medicosOdontologia.map(m => m.id)
      });
    }
    
    // Se tem múltiplos "Dr. Ruben", criar opção única
    if (medicosRuben.length > 1) {
      resultado.push({
        id: medicosRuben[0].id, // Usar o ID do primeiro para o filtro
        nome: '🩺 Dr. Ruben Hurtado',
        especialidade: 'Múltiplas',
        isAgrupado: true,
        grupoIds: medicosRuben.map(m => m.id)
      });
    } else if (medicosRuben.length === 1) {
      // Se só tem 1, adicionar normalmente
      resultado.push({
        ...medicosRuben[0],
        isAgrupado: false
      });
    }
    
    // Se tem múltiplos "Dr. Delazeri", criar opção única
    if (medicosDelazeri.length > 1) {
      resultado.push({
        id: medicosDelazeri[0].id, // Usar o ID do primeiro para o filtro
        nome: '🧠 Dr. Marco A. Delazeri',
        especialidade: 'Múltiplas',
        isAgrupado: true,
        grupoIds: medicosDelazeri.map(m => m.id)
      });
    } else if (medicosDelazeri.length === 1) {
      resultado.push({
        ...medicosDelazeri[0],
        isAgrupado: false
      });
    }

    // Adicionar outros médicos normalmente
    outrosMedicos.forEach(m => {
      resultado.push({
        ...m,
        isAgrupado: false
      });
    });
    
    return resultado;
  }, [medicos]);

  const handleFiltroChange = (tipo, valor) => {
    onFiltrosChange(prev => ({
      ...prev,
      [tipo]: valor
    }));
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4 space-y-3">
        {/* Barra de busca por nome ou telefone */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar agendamento por nome do paciente ou telefone..."
            value={filtros.busca || ''}
            onChange={(e) => handleFiltroChange('busca', e.target.value)}
            className="pl-10 pr-10"
          />
          {filtros.busca && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleFiltroChange('busca', '')}
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>

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
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Todos os médicos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os médicos</SelectItem>
              {medicosAgrupados.map((medico) => (
                <SelectItem key={medico.id} value={medico.id}>
                  {medico.isAgrupado ? medico.nome : `Dr(a). ${medico.nome}`}
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