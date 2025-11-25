
import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Phone, Mail, Stethoscope, Calendar, Printer } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const statusColors = {
  "Ativo": "bg-green-100 text-green-800",
  "Inativo": "bg-gray-100 text-gray-800",
  "Férias": "bg-yellow-100 text-yellow-800"
};

const diasSemanaMap = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

export default function ListaMedicos({ medicos, loading, onEdit, onDelete }) {
  
  const handleImprimirHorarios = (medico) => {
    const horariosOrdenados = (medico.horarios_atendimento || []).sort((a, b) => {
      if (a.dia_semana !== b.dia_semana) return a.dia_semana - b.dia_semana;
      return a.horario_inicio.localeCompare(b.horario_inicio);
    });

    const conteudoImpressao = `
      <html>
      <head>
        <title>Horários - Dr(a). ${medico.nome}</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            padding: 30px;
            max-width: 800px;
            margin: 0 auto;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 20px;
          }
          h1 { 
            color: #1e40af;
            margin-bottom: 5px;
            font-size: 28px;
          }
          h2 {
            color: #64748b;
            font-size: 20px;
            font-weight: normal;
            margin: 5px 0;
          }
          .medico-info {
            background-color: #f1f5f9;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
          }
          .info-item {
            margin: 8px 0;
            font-size: 14px;
          }
          .info-label {
            font-weight: bold;
            color: #475569;
            display: inline-block;
            width: 150px;
          }
          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-top: 20px;
          }
          th, td { 
            border: 1px solid #cbd5e1; 
            padding: 12px; 
            text-align: left;
          }
          th { 
            background-color: #3b82f6; 
            color: white;
            font-weight: bold;
          }
          tr:nth-child(even) { 
            background-color: #f8fafc; 
          }
          .dia-semana {
            font-weight: bold;
            color: #1e40af;
          }
          .horario {
            font-family: 'Courier New', monospace;
            font-size: 16px;
            color: #0f172a;
          }
          .recorrencia {
            font-size: 12px;
            color: #64748b;
            font-style: italic;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            color: #64748b;
            font-size: 12px;
          }
          .no-horarios {
            text-align: center;
            padding: 40px;
            color: #64748b;
            font-style: italic;
          }
          @media print {
            body { padding: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🏥 Centro Vida Saúde</h1>
          <h2>Horários de Atendimento</h2>
        </div>
        
        <div class="medico-info">
          <div class="info-item">
            <span class="info-label">Médico:</span>
            Dr(a). ${medico.nome}
          </div>
          <div class="info-item">
            <span class="info-label">CRM:</span>
            ${medico.crm || 'N/A'}
          </div>
          <div class="info-item">
            <span class="info-label">Especialidade:</span>
            ${medico.especialidade}
          </div>
          <div class="info-item">
            <span class="info-label">Tipo de Atendimento:</span>
            ${medico.tipo_atendimento || 'Horários Marcados'}
          </div>
          <div class="info-item">
            <span class="info-label">Duração da Consulta:</span>
            ${medico.tempo_consulta_minutos || 30} minutos
          </div>
          ${medico.telefone ? `
          <div class="info-item">
            <span class="info-label">Telefone:</span>
            ${medico.telefone}
          </div>
          ` : ''}
        </div>
        
        ${horariosOrdenados.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Dia da Semana</th>
                <th>Horário de Atendimento</th>
                <th>Recorrência</th>
              </tr>
            </thead>
            <tbody>
              ${horariosOrdenados.map(h => `
                <tr>
                  <td class="dia-semana">${diasSemanaMap[h.dia_semana]}</td>
                  <td class="horario">${h.horario_inicio} às ${h.horario_fim}</td>
                  <td class="recorrencia">${h.recorrencia || 'Toda Semana'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : `
          <div class="no-horarios">
            ⚠️ Nenhum horário de atendimento configurado para este médico.
          </div>
        `}
        
        <div class="footer">
          <p>Impresso em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
          <p><strong>Centro Vida Saúde</strong> - Sistema de Gestão Clínica</p>
          <p>Este documento serve apenas como referência dos horários de atendimento configurados no sistema.</p>
        </div>
      </body>
      </html>
    `;

    const janelaImpressao = window.open('', '_blank');
    janelaImpressao.document.write(conteudoImpressao);
    janelaImpressao.document.close();
    janelaImpressao.focus();
    
    setTimeout(() => {
      janelaImpressao.print();
    }, 250);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array(6).fill(0).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-56 w-full" />
            <CardContent className="p-4">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (medicos.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Stethoscope className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-gray-500">Nenhum médico encontrado</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {medicos.map((medico) => (
        <Card key={medico.id} className="overflow-hidden hover:shadow-xl transition-all duration-300 group">
          {/* Foto do Médico */}
          <div className="relative h-56 bg-gradient-to-br from-blue-500 to-purple-600 overflow-hidden">
            {medico.foto_url ? (
              <img 
                src={medico.foto_url} 
                alt={medico.nome}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Stethoscope className="w-24 h-24 text-white opacity-50" />
              </div>
            )}
            
            {/* Badge de Status */}
            <div className="absolute top-3 right-3">
              <Badge className={`${statusColors[medico.status]} shadow-lg`}>
                {medico.status}
              </Badge>
            </div>

            {/* Badge de Tipo de Atendimento */}
            {medico.tipo_atendimento === "Ordem de Chegada" && (
              <div className="absolute top-3 left-3">
                <Badge variant="outline" className="bg-white/90 backdrop-blur-sm text-xs">
                  Ordem de Chegada
                </Badge>
              </div>
            )}
          </div>

          {/* Informações do Médico */}
          <CardContent className="p-5">
            <div className="mb-3">
              <h3 className="font-bold text-lg text-gray-900 mb-1 line-clamp-1">
                Dr(a). {medico.nome}
              </h3>
              <div className="flex items-center gap-2 text-blue-600">
                <Stethoscope className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm font-medium line-clamp-1">{medico.especialidade}</span>
              </div>
              {medico.crm && (
                <p className="text-xs text-gray-500 mt-1">CRM: {medico.crm}</p>
              )}
            </div>

            <div className="space-y-2 mb-4 text-sm text-gray-600">
              {medico.telefone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <span className="line-clamp-1">{medico.telefone}</span>
                </div>
              )}

              {medico.email && (
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <span className="line-clamp-1 text-xs">{medico.email}</span>
                </div>
              )}

              {medico.horarios_atendimento && medico.horarios_atendimento.length > 0 && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <span className="text-xs">{medico.horarios_atendimento.length} período(s) de atendimento</span>
                </div>
              )}
            </div>

            {/* Botões de Ação - Agora com mais espaço */}
            <div className="grid grid-cols-3 gap-2 pt-3 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleImprimirHorarios(medico)}
                className="text-purple-600 border-purple-200 hover:bg-purple-50 flex flex-col items-center justify-center h-auto py-2"
                title="Imprimir horários"
              >
                <Printer className="w-4 h-4 mb-1" />
                <span className="text-xs">Imprimir</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(medico)}
                className="text-blue-600 border-blue-200 hover:bg-blue-50 flex flex-col items-center justify-center h-auto py-2"
                title="Editar médico"
              >
                <Edit className="w-4 h-4 mb-1" />
                <span className="text-xs">Editar</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm(`Tem certeza que deseja excluir o médico "${medico.nome}"? Esta ação não pode ser desfeita.`)) {
                    onDelete(medico.id);
                  }
                }}
                className="text-red-600 border-red-200 hover:bg-red-50 flex flex-col items-center justify-center h-auto py-2"
                title="Excluir médico"
              >
                <Trash2 className="w-4 h-4 mb-1" />
                <span className="text-xs">Excluir</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
