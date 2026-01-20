import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Users, Phone, Calendar, FileText, RefreshCw, Loader2, Filter, UserPlus, MessageCircle, FolderOpen, Download, Image, File } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const LISTA_MOTIVOS = [
  "Agendamento de Consulta",
  "Agendamento de Exame",
  "Cancelamento",
  "Orçamento",
  "Cartão Mais Vida",
  "Resultado de Exames",
  "Procedimentos",
  "Turmas (Hidroginástica/Pilates)",
  "Informações Gerais",
  "Outro"
];

export default function ContatosTab({ onIniciarConversa }) {
  const [contatos, setContatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroMotivo, setFiltroMotivo] = useState('todos');
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoContato, setNovoContato] = useState({
    nome: '',
    telefone: '',
    data_nascimento: '',
    motivo: ''
  });
  const [modalArquivosAberto, setModalArquivosAberto] = useState(false);
  const [contatoArquivos, setContatoArquivos] = useState(null);
  const [arquivosContato, setArquivosContato] = useState([]);

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

  const handleAdicionarContato = async () => {
    if (!novoContato.nome || !novoContato.telefone) {
      alert('Por favor, preencha nome e telefone');
      return;
    }
    setSalvando(true);
    try {
      await base44.entities.Contato.create({
        nome: novoContato.nome,
        telefone: novoContato.telefone.replace(/\D/g, ''),
        data_nascimento: novoContato.data_nascimento || undefined,
        interesses: novoContato.motivo ? [novoContato.motivo] : [],
        origem: 'Manual',
        status: 'Novo'
      });
      setModalAberto(false);
      setNovoContato({ nome: '', telefone: '', data_nascimento: '', motivo: '' });
      carregarContatos();
    } catch (error) {
      console.error('Erro ao adicionar contato:', error);
      alert('Erro ao adicionar contato');
    } finally {
      setSalvando(false);
    }
  };

  const formatarTelefone = (telefone) => {
    if (!telefone) return '-';
    const numeros = telefone.replace(/\D/g, '');
    if (numeros.length === 11) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
    }
    return telefone;
  };

  // Extrair arquivos do histórico de mensagens
  const extrairArquivosDoContato = (contato) => {
    if (!contato?.historico_mensagens) return [];
    
    const arquivos = [];
    contato.historico_mensagens.forEach((msg, index) => {
      // Verificar se tem mediaUrl
      if (msg.mediaUrl) {
        arquivos.push({
          url: msg.mediaUrl,
          tipo: msg.mediaType || 'document',
          nome: msg.content?.match(/📄\s*([^:]+):/)?.[1] || msg.content?.match(/\[Documento:\s*([^\]]+)\]/)?.[1] || 'Arquivo',
          data: msg.timestamp,
          remetente: msg.role === 'user' ? 'Cliente' : 'Clínica'
        });
      }
      
      // Verificar URLs no conteúdo
      const urlMatch = msg.content?.match(/(https?:\/\/[^\s\]]+\.(jpg|jpeg|png|gif|webp|pdf|doc|docx)(\?[^\s\]]*)?)/i);
      if (urlMatch && !msg.mediaUrl) {
        const ext = urlMatch[2].toLowerCase();
        arquivos.push({
          url: urlMatch[1],
          tipo: ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' : 'document',
          nome: msg.content?.match(/📄\s*([^:]+):/)?.[1] || msg.content?.match(/\[Documento:\s*([^\]]+)\]/)?.[1] || `Arquivo.${ext}`,
          data: msg.timestamp,
          remetente: msg.role === 'user' ? 'Cliente' : 'Clínica'
        });
      }
    });
    
    return arquivos;
  };

  const abrirArquivos = (contato) => {
    setContatoArquivos(contato);
    const arquivos = extrairArquivosDoContato(contato);
    setArquivosContato(arquivos);
    setModalArquivosAberto(true);
  };

  const getMotivoBadge = (interesses) => {
    if (!interesses || interesses.length === 0) return <Badge variant="outline">Não informado</Badge>;
    
    const motivo = interesses[interesses.length - 1].toLowerCase();
    
    if (motivo.includes('agendamento') || motivo.includes('agendar') || motivo.includes('marcar')) {
      return <Badge className="bg-blue-100 text-blue-800">Agendamento</Badge>;
    }
    if (motivo.includes('cancelamento') || motivo.includes('cancelar') || motivo.includes('desmarcar')) {
      return <Badge className="bg-red-100 text-red-800">Cancelamento</Badge>;
    }
    if (motivo.includes('orçamento') || motivo.includes('orcamento') || motivo.includes('preço') || motivo.includes('valor')) {
      return <Badge className="bg-yellow-100 text-yellow-800">Orçamento</Badge>;
    }
    if (motivo.includes('cartão') || motivo.includes('cartao') || motivo.includes('mais vida')) {
      return <Badge className="bg-purple-100 text-purple-800">Cartão Mais Vida</Badge>;
    }
    if (motivo.includes('resultado') || motivo.includes('laudo')) {
      return <Badge className="bg-green-100 text-green-800">Resultado de Exames</Badge>;
    }
    if (motivo.includes('procedimento')) {
      return <Badge className="bg-orange-100 text-orange-800">Procedimentos</Badge>;
    }
    if (motivo.includes('turma') || motivo.includes('hidrogin') || motivo.includes('pilates')) {
      return <Badge className="bg-cyan-100 text-cyan-800">Turmas</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-800">{interesses[interesses.length - 1]}</Badge>;
  };

  const contatosFiltrados = contatos.filter(contato => {
    const matchBusca = !busca || 
      contato.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      contato.telefone?.includes(busca);
    
    const ultimoInteresse = contato.interesses?.[contato.interesses.length - 1]?.toLowerCase() || '';
    
    let matchMotivo = true;
    if (filtroMotivo === 'agendamento') {
      matchMotivo = ultimoInteresse.includes('agendamento') || ultimoInteresse.includes('agendar') || ultimoInteresse.includes('marcar');
    } else if (filtroMotivo === 'cancelamento') {
      matchMotivo = ultimoInteresse.includes('cancelamento') || ultimoInteresse.includes('cancelar') || ultimoInteresse.includes('desmarcar');
    } else if (filtroMotivo === 'orcamento') {
      matchMotivo = ultimoInteresse.includes('orçamento') || ultimoInteresse.includes('orcamento') || ultimoInteresse.includes('preço') || ultimoInteresse.includes('valor');
    } else if (filtroMotivo === 'cartao_mais_vida') {
      matchMotivo = ultimoInteresse.includes('cartão') || ultimoInteresse.includes('cartao') || ultimoInteresse.includes('mais vida');
    } else if (filtroMotivo === 'resultado_exames') {
      matchMotivo = ultimoInteresse.includes('resultado') || ultimoInteresse.includes('laudo');
    } else if (filtroMotivo === 'procedimentos') {
      matchMotivo = ultimoInteresse.includes('procedimento');
    } else if (filtroMotivo === 'turmas') {
      matchMotivo = ultimoInteresse.includes('turma') || ultimoInteresse.includes('hidrogin') || ultimoInteresse.includes('pilates');
    } else if (filtroMotivo === 'outros') {
      matchMotivo = !ultimoInteresse.includes('agendamento') && !ultimoInteresse.includes('cancelamento') && 
        !ultimoInteresse.includes('orçamento') && !ultimoInteresse.includes('cartão') && 
        !ultimoInteresse.includes('resultado') && !ultimoInteresse.includes('procedimento') && !ultimoInteresse.includes('turma');
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
                  <SelectItem value="agendamento">Agendamento</SelectItem>
                  <SelectItem value="cancelamento">Cancelamento</SelectItem>
                  <SelectItem value="orcamento">Orçamento</SelectItem>
                  <SelectItem value="cartao_mais_vida">Cartão Mais Vida</SelectItem>
                  <SelectItem value="resultado_exames">Resultado de Exames</SelectItem>
                  <SelectItem value="procedimentos">Procedimentos</SelectItem>
                  <SelectItem value="turmas">Turmas</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={carregarContatos} variant="outline" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button onClick={() => setModalAberto(true)} className="bg-green-600 hover:bg-green-700">
              <UserPlus className="w-4 h-4 mr-2" />
              Adicionar Contato
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
                    <TableHead className="w-12"></TableHead>
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
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => onIniciarConversa && onIniciarConversa(contato)}
                          title="Iniciar conversa"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Adicionar Contato */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-600" />
              Adicionar Contato
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                placeholder="Nome completo"
                value={novoContato.nome}
                onChange={(e) => setNovoContato({...novoContato, nome: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <Input
                id="telefone"
                placeholder="(00) 00000-0000"
                value={novoContato.telefone}
                onChange={(e) => setNovoContato({...novoContato, telefone: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="data_nascimento">Data de Nascimento</Label>
              <Input
                id="data_nascimento"
                type="date"
                value={novoContato.data_nascimento}
                onChange={(e) => setNovoContato({...novoContato, data_nascimento: e.target.value})}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="motivo">Motivo do Contato</Label>
              <Select 
                value={novoContato.motivo} 
                onValueChange={(value) => setNovoContato({...novoContato, motivo: value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {LISTA_MOTIVOS.map((motivo) => (
                    <SelectItem key={motivo} value={motivo}>{motivo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAberto(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleAdicionarContato} disabled={salvando} className="bg-green-600 hover:bg-green-700">
              {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}