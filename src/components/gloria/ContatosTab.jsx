import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Phone, Calendar, FileText, RefreshCw, Loader2, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContatosTab() {
  const [contatos, setContatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('todos');

  const carregarContatos = async () => {
    setLoading(true);
    try {
      const dados = await base44.entities.Contato.list('-created_date', 100);
      setContatos(dados);
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarContatos();
  }, []);

  const formatarTelefone = (telefone) => {
    if (!telefone) return '-';
    const numeros = telefone.replace(/\D/g, '');
    if (numeros.length === 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    }
    return telefone;
  };

  const getMotivoBadge = (interesses) => {
    if (!interesses || interesses.length === 0) return <Badge variant="outline">Não informado</Badge>;
    
    const motivo = interesses[interesses.length - 1];
    
    if (motivo.toLowerCase().includes('consulta')) {
      return <Badge className="bg-blue-100 text-blue-800">{motivo}</Badge>;
    }
    if (motivo.toLowerCase().includes('laborat')) {
      return <Badge className="bg-green-100 text-green-800">Exames Laboratoriais</Badge>;
    }
    if (motivo.toLowerCase().includes('imagem')) {
      return <Badge className="bg-purple-100 text-purple-800">Exames de Imagem</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">{motivo}</Badge>;
  };

  const contatosFiltrados = contatos.filter(contato => {
    const matchBusca = !busca || 
      contato.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      contato.telefone?.includes(busca);
    
    const ultimoInteresse = contato.interesses?.[contato.interesses.length - 1]?.toLowerCase() || '';
    
    let matchMotivo = true;
    if (filtroMotivo === 'consulta') {
      matchMotivo = ultimoInteresse.includes('consulta');
    } else if (filtroMotivo === 'exame_lab') {
      matchMotivo = ultimoInteresse.includes('laborat');
    } else if (filtroMotivo === 'exame_imagem') {
      matchMotivo = ultimoInteresse.includes('imagem');
    } else if (filtroMotivo === 'outros') {
      matchMotivo = ultimoInteresse.includes('outro') || 
        (!ultimoInteresse.includes('consulta') && !ultimoInteresse.includes('laborat') && !ultimoInteresse.includes('imagem'));
    }
    
    return matchBusca && matchMotivo;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold">{contatos.length}</p>
              <p className="text-xs text-gray-600">Total</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {contatos.filter(c => c.interesses?.some(i => i.toLowerCase().includes('consulta'))).length}
              </p>
              <p className="text-xs text-gray-600">Consultas</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {contatos.filter(c => c.interesses?.some(i => i.toLowerCase().includes('laborat') || i.toLowerCase().includes('imagem'))).length}
              </p>
              <p className="text-xs text-gray-600">Exames</p>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-xl font-bold">
                {contatos.filter(c => {
                  const hoje = new Date();
                  const criado = new Date(c.created_date);
                  return criado.toDateString() === hoje.toDateString();
                }).length}
              </p>
              <p className="text-xs text-gray-600">Hoje</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome ou telefone..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="w-full md:w-48">
              <Select value={filtroMotivo} onValueChange={setFiltroMotivo}>
                <SelectTrigger>
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Filtrar por motivo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os motivos</SelectItem>
                  <SelectItem value="consulta">Consultas</SelectItem>
                  <SelectItem value="exame_lab">Exames Laboratoriais</SelectItem>
                  <SelectItem value="exame_imagem">Exames de Imagem</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={carregarContatos} variant="outline" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Contatos ({contatosFiltrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {contatosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum contato encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Origem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contatosFiltrados.map((contato) => (
                    <TableRow key={contato.id}>
                      <TableCell className="font-medium">
                        {contato.nome || 'Não informado'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          {formatarTelefone(contato.telefone)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contato.created_date ? 
                          format(new Date(new Date(contato.created_date).getTime() - (3 * 60 * 60 * 1000)), "dd/MM/yyyy HH:mm", { locale: ptBR }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        {getMotivoBadge(contato.interesses)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contato.origem || 'Site'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}