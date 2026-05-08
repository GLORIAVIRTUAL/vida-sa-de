import React, { useState, useEffect, useMemo } from 'react';
import { AuditoriaOS } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ClipboardList, RefreshCw, Filter, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import ProtectedRoute from '../components/auth/ProtectedRoute';

const NOMES_CAMPOS = {
  status_pagamento: 'Status do Pagamento',
  valor_final: 'Valor Final',
  valor_total: 'Valor Total',
  desconto: 'Desconto',
  valor_repasse_medico: 'Repasse Médico',
  forma_pagamento: 'Forma de Pagamento',
  repasse_realizado: 'Repasse Realizado',
  observacoes: 'Observações'
};

const CORES_EVENTO = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  cancel: 'bg-red-100 text-red-800',
  delete: 'bg-red-200 text-red-900'
};

const LABELS_EVENTO = {
  create: 'Criada',
  update: 'Editada',
  cancel: 'CANCELADA',
  delete: 'Excluída'
};

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return <span className="text-gray-400 italic">vazio</span>;
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Não';
  if (typeof valor === 'number') return `R$ ${valor.toFixed(2)}`;
  return String(valor);
}

function LinhaAuditoria({ registro }) {
  const [expandido, setExpandido] = useState(false);
  const totalCampos = registro.campos_alterados?.length || 0;
  const isCancel = registro.tipo_evento === 'cancel';

  return (
    <>
      <TableRow 
        className={`cursor-pointer hover:bg-gray-50 ${isCancel ? 'bg-red-50' : ''}`} 
        onClick={() => setExpandido(!expandido)}
      >
        <TableCell>
          {totalCampos > 0 && (
            expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
          )}
        </TableCell>
        <TableCell className="text-sm whitespace-nowrap">
          {registro.created_date ? format(parseISO(registro.created_date), "dd/MM/yy HH:mm", { locale: ptBR }) : '-'}
        </TableCell>
        <TableCell className="font-mono text-xs">{registro.numero_os || '-'}</TableCell>
        <TableCell className="font-medium">{registro.paciente_nome || '-'}</TableCell>
        <TableCell>
          <Badge className={CORES_EVENTO[registro.tipo_evento] || ''}>
            {isCancel && <AlertTriangle className="w-3 h-3 mr-1" />}
            {LABELS_EVENTO[registro.tipo_evento] || registro.tipo_evento}
          </Badge>
        </TableCell>
        <TableCell className="text-sm font-semibold text-red-700">
          {registro.alterado_por_email || registro.created_by || '-'}
        </TableCell>
        <TableCell className="text-right">
          {registro.valor_final ? `R$ ${registro.valor_final.toFixed(2)}` : '-'}
        </TableCell>
      </TableRow>
      {expandido && totalCampos > 0 && (
        <TableRow>
          <TableCell colSpan={7} className="bg-blue-50 p-4">
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
                        {formatarValor(c.valor_antigo)}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-green-600 font-medium block mb-1">DEPOIS:</span>
                      <div className="bg-green-50 p-2 rounded border border-green-100">
                        {formatarValor(c.valor_novo)}
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

export default function AuditoriaOSPage() {
  const [loading, setLoading] = useState(true);
  const [registros, setRegistros] = useState([]);
  const [filtroEvento, setFiltroEvento] = useState('todos');
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [busca, setBusca] = useState('');

  const carregar = async () => {
    setLoading(true);
    try {
      const dados = await AuditoriaOS.list('-created_date', 1000);
      setRegistros(dados || []);
    } catch (e) {
      console.error('Erro ao carregar auditoria de OS:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const usuarios = useMemo(() => {
    const set = new Set();
    registros.forEach(r => {
      const email = r.alterado_por_email || r.created_by;
      if (email) set.add(email);
    });
    return Array.from(set).sort();
  }, [registros]);

  const registrosFiltrados = useMemo(() => {
    return registros.filter(r => {
      if (filtroEvento !== 'todos' && r.tipo_evento !== filtroEvento) return false;
      const userEmail = r.alterado_por_email || r.created_by;
      if (filtroUsuario !== 'todos' && userEmail !== filtroUsuario) return false;
      if (filtroDataInicio && r.created_date && r.created_date < filtroDataInicio) return false;
      if (busca) {
        const buscaLower = busca.toLowerCase();
        const matches = 
          (r.numero_os || '').toLowerCase().includes(buscaLower) ||
          (r.paciente_nome || '').toLowerCase().includes(buscaLower);
        if (!matches) return false;
      }
      return true;
    });
  }, [registros, filtroEvento, filtroUsuario, filtroDataInicio, busca]);

  const totalCancelamentos = useMemo(() => 
    registrosFiltrados.filter(r => r.tipo_evento === 'cancel').length,
    [registrosFiltrados]
  );

  return (
    <ProtectedRoute requiredRole="admin" fallbackMessage="Apenas administradores podem acessar a auditoria.">
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                <ClipboardList className="w-8 h-8 text-blue-600" />
                Auditoria de Ordens de Serviço
              </h1>
              <p className="text-gray-600">
                Histórico de criações, edições e <strong>cancelamentos</strong> de OS — com identificação do responsável.
              </p>
            </div>
            <Button variant="outline" onClick={carregar}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Total de Eventos</p>
                <p className="text-2xl font-bold">{registrosFiltrados.length}</p>
              </CardContent>
            </Card>
            <Card className="border-red-200">
              <CardContent className="p-4">
                <p className="text-xs text-red-600">Cancelamentos</p>
                <p className="text-2xl font-bold text-red-700">{totalCancelamentos}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500">Usuários distintos</p>
                <p className="text-2xl font-bold">{usuarios.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Tipo de Evento</Label>
                  <Select value={filtroEvento} onValueChange={setFiltroEvento}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="create">Criada</SelectItem>
                      <SelectItem value="update">Editada</SelectItem>
                      <SelectItem value="cancel">Cancelada</SelectItem>
                      <SelectItem value="delete">Excluída</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Usuário</Label>
                  <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {usuarios.map(u => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>A partir de</Label>
                  <Input type="date" value={filtroDataInicio} onChange={(e) => setFiltroDataInicio(e.target.value)} />
                </div>
                <div>
                  <Label>Buscar (OS / Paciente)</Label>
                  <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº OS ou nome..." />
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
                  <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Nenhum registro de auditoria encontrado.</p>
                  <p className="text-sm mt-1">As alterações futuras em OS aparecerão aqui automaticamente.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[70vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Nº OS</TableHead>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Responsável</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
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