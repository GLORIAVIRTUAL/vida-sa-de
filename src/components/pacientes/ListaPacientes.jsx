import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Phone, MapPin, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import ConfirmacaoExclusao from "../shared/ConfirmacaoExclusao";

const prioridadeColors = {
  "Normal": "bg-gray-100 text-gray-800",
  "Idoso (60+ anos)": "bg-blue-100 text-blue-800",
  "Deficiente Físico": "bg-purple-100 text-purple-800", 
  "Gestante": "bg-pink-100 text-pink-800",
  "Lactante": "bg-green-100 text-green-800",
  "Criança de Colo": "bg-orange-100 text-orange-800",
  "Pessoa com Criança de Colo": "bg-red-100 text-red-800"
};

export default function ListaPacientes({ 
  pacientes, 
  onEdit, 
  onDelete, 
  loading,
  currentPage,
  totalPages,
  onPageChange,
  totalPacientes,
  pacientesPorPagina
}) {

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-pulse space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-20 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (pacientes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-xl font-medium text-gray-600">Nenhum paciente encontrado</p>
          <p className="text-gray-500 mt-2">
            Tente ajustar os filtros de busca ou cadastre um novo paciente.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com contadores */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            <span>Lista de Pacientes</span>
            <Badge variant="outline" className="text-sm">
              {pacientes.length} de {totalPacientes.toLocaleString()}
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Lista otimizada */}
      <div className="grid gap-4">
        {pacientes.map((paciente) => (
          <Card key={paciente.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-lg text-gray-900 truncate">
                      {paciente.nome}
                    </h3>
                    {paciente.prioridade && paciente.prioridade !== 'Normal' && (
                      <Badge className={`text-xs ${prioridadeColors[paciente.prioridade] || prioridadeColors.Normal}`}>
                        {paciente.prioridade}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs">
                      {paciente.convenio || 'Particular'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span className="truncate">{paciente.cpf || 'CPF não informado'}</span>
                    </div>
                    
                    {paciente.telefone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-4 h-4" />
                        <span>{paciente.telefone}</span>
                      </div>
                    )}
                    
                    {paciente.data_nascimento && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {format(new Date(paciente.data_nascimento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                        </span>
                      </div>
                    )}
                  </div>

                  {paciente.endereco?.cidade && (
                    <div className="flex items-center gap-1 mt-2 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      <span>{paciente.endereco.cidade}, {paciente.endereco.estado}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(paciente)}
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  
                  <ConfirmacaoExclusao
                    titulo="Excluir Paciente"
                    mensagem={`Tem certeza que deseja excluir o paciente "${paciente.nome}"?`}
                    onConfirm={() => onDelete(paciente.id)}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </ConfirmacaoExclusao>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}