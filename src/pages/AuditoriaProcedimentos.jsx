import React, { useState, useEffect, useMemo } from 'react';
import { AuditoriaProcedimento, Procedimento } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Shield, RefreshCw, Filter, ChevronDown, ChevronRight } from "lucide-react";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ProtectedRoute from '../components/auth/ProtectedRoute';

const NOMES_CAMPOS = {
  nome: 'Nome',
  codigo: 'Código',
  especialidade: 'Especialidade',
  status: 'Status',
  duracao_minutos: 'Duração (min)',
  tipo_repasse: 'Tipo de Repasse',
  valor_repasse_medico: 'Valor Repasse (R$)',
  percentual_repasse_medico: 'Percentual Repasse (%)',
  is_pacote: 'É Pacote',
  itens_pacote: 'Itens do Pacote',
  desconto_pacote: 'Desconto do Pacote (%)'
};

const CORES_EVENTO = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  delete: 'bg-red-100 text-red-800'
};

function formatarValorDetalhado(valor) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-gray-400 italic">vazio</span>;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (Array.isArray(valor)) {
    if (valor.length === 0) return <span className="text-gray-400 italic">lista vazia</span>;
    if (valor[0]?.nome !== undefined) {
      return (
        <ul className="text-xs space-y-0.5">
          {valor.map((item, i) => (
            <li key={i}>• {item.nome} (x{item.quantidade || 1})</li>
          ))}
        </ul>
      );
    }
    return <span className="text-xs">{valor.length} item(ns)</span>;
  }
  if (typeof valor === 'object') return <span className="text-xs">{JSON.stringify(valor).substring(0, 80)}</span>;
  return String(valor);
}

function LinhaAuditoria({ registro }) {
  const [expandido, setExpandido] = useState(false);
  const totalCampos = registro.campos_alterados?.length || 0;

  return (
    <>
      <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandido(!expandido)}>
        <TableCell>
          {totalCampos > 0 && (
            expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          )}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {registro.created_date ? format(parseISO(registro.created_date), "dd/MM/yy HH:mm", { locale: ptBR }) : '-'}
        </TableCell>
        <TableCell className="font-medium">{registro.procedimento_nome || '-'}</TableCell>
        <TableCell>
          <Badge className={CORES_EVENTO[registro.tipo_evento] || ''}>
            {registro.tipo_evento === 'create' ? 'Criado' : registro.tipo_evento === 'update' ? 'Editado' : 'Excluído'}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">{registro.alterado_por_email || registro.created_by || '-'}</TableCell>
        <TableCell className="text-center">{totalCampos}</TableCell>
      </TableRow>
      {expandido && totalCampos > 0 && (
        <TableRow>
          <TableCell colSpan={6} className="bg-blue-50 p-4">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-blue-900">Detalhes das alterações:</h4>
              {registro.campos_alterados.map((c, i) => (
                <div key={i} className="bg-white p-3 rounded border border-blue-200">
                  <div className="font-medium text-sm text-gray-800 mb-2">
                    {NOMES_CAMPOS[c.campo] || c.campo}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-red-600 font-medium block mb-1">ANTES:</span>
                      <div className="bg-red-50 p-2 rounded border border-red-100">
                        {formatarValorDetalhado(c.valor_antigo)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-green-600 font-medium block mb-1">DEPOIS:</span>
                      <div className="bg-green-50 p-2 rounded border border-green-100">
                        {formatarValorDetalhado(c.valor_novo)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AuditoriaProcedimentos() {
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [procedimentos, setProcedimentos] = useState([]);
  const [filtroProcedimento, setFiltroProcedimento] = useState('todos');
  const [filtroEvento, setFiltroEvento] = useState('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const [audData, procData] = await Promise.all([
        AuditoriaProcedimento.list('-created_date', 500),
        Procedimento.list()
      ]);
      setRegistros(audData || []);
      setProcedimentos(procData || []);
    } catch (e) {
      console.error('Erro ao carregar auditoria:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (filtroProcedimento !== 'todos' && r.procedimento_id !== filtroProcedimento) return false;
      if (filtroEvento !== 'todos' && r.tipo_evento !== filtroEvento) return false;
      if (filtroDataInicio && r.created_date && r.created_date < filtroDataInicio) return false;
      return true;
    });
  }, [registros, filtroProcedimento, filtroEvento, filtroDataInicio]);

  return (
    <ProtectedRoute requiredRole="admin" fallbackMessage="Apenas administradores podem acessar a auditoria.">
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Shield className="w-8 h-8 text-blue-600" />
                Auditoria de Procedimentos
              </h1>
              <p className="text-gray-600">
                Histórico de todas as alterações nos valores e repasses dos procedimentos.
              </p>
            </div>
            <Button variant="outline" onClick={carregar}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Procedimento</Label>
                  <Select value={filtroProcedimento} onValueChange={setFiltroProcedimento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {procedimentos.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de Evento</Label>
                  <Select value={filtroEvento} onValueChange={setFiltroEvento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="create">Criado</SelectItem>
                      <SelectItem value="update">Editado</SelectItem>
                      <SelectItem value="delete">Excluído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>A partir de</Label>
                  <Input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registros ({registrosFiltrados.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : registrosFiltrados.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhum registro de auditoria encontrado.</p>
                  <p className="text-sm mt-1">As alterações futuras nos cadastros de procedimentos aparecerão aqui.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Procedimento</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Alterado por</TableHead>
                        <TableHead className="text-center">Campos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrosFiltrados.map(r => (
                        <LinhaAuditoria key={r.id} registro={r} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}