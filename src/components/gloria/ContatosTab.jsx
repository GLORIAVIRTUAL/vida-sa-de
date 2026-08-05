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
import { Search, Users, Phone, Calendar, FileText, RefreshCw, Loader2, Filter, UserPlus, MessageCircle, FolderOpen, Download, Image, File, Trash2, AlertCircle, Printer } from "lucide-react";
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
  const [filtroEspecialidade, setFiltroEspecialidade] = useState('todas');
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
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(null);
  const [limpando, setLimpando] = useState(false);

  const carregarContatos = async () => {
    setLoading(true);
    try {
      // Carrega apenas os mais recentes para abrir rápido; a busca por texto
      // consulta o banco diretamente (ver buscarNoBanco).
      const lote = await base44.entities.Contato.list('-created_date', 1000);
      setContatos(lote || []);
    } catch (error) {
      console.error('Erro ao carregar contatos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarContatos();
  }, []);

  const handleFiltrarEspecialidade = async (especialidade) => {
    setFiltroEspecialidade(especialidade);
    if (especialidade === 'todas') return;

    setLoading(true);
    try {
      const resultados = await base44.entities.Contato.filter(
        { tags: especialidade }, '-created_date', 500
      );
      setContatos(prev => {
        const mapa = new Map(prev.map(contato => [contato.id, contato]));
        (resultados || []).forEach(contato => mapa.set(contato.id, contato));
        return Array.from(mapa.values());
      });
    } finally {
      setLoading(false);
    }
  };

  // Busca sob demanda no banco quando o usuário digita (nome ou telefone),
  // para encontrar contatos que não estão entre os 1.000 mais recentes.
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const numeros = termo.replace(/\D/g, '');
        const resultados = [];
        // Busca por nome (case-insensitive parcial)
        const porNome = await base44.entities.Contato.filter(
          { nome: { $regex: termo, $options: 'i' } }, '-created_date', 200
        ).catch(() => []);
        resultados.push(...porNome);
        // Busca por telefone, se o termo parece um número
        if (numeros.length >= 4) {
          const porTel = await base44.entities.Contato.filter(
            { telefone: { $regex: numeros } }, '-created_date', 200
          ).catch(() => []);
          resultados.push(...porTel);
        }
        if (resultados.length > 0) {
          setContatos(prev => {
            const mapa = new Map(prev.map(c => [c.id, c]));
            resultados.forEach(c => mapa.set(c.id, c));
            return Array.from(mapa.values());
          });
        }
      } catch (error) {
        console.error('Erro na busca sob demanda:', error);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [busca]);

  const [erroDuplicado, setErroDuplicado] = useState(null);

  const handleAdicionarContato = async () => {
    if (!novoContato.nome || !novoContato.telefone) {
      alert('Por favor, preencha nome e telefone');
      return;
    }
    setErroDuplicado(null);
    setSalvando(true);
    try {
      let telLimpo = novoContato.telefone.replace(/\D/g, '');
      if (!telLimpo.startsWith('55')) {
        telLimpo = '55' + telLimpo;
      }
      // Verificar se já existe contato com este telefone
      const ultimos8 = telLimpo.slice(-8);
      const contatoExistente = contatos.find(c => {
        const tel = (c.telefone || '').replace(/\D/g, '');
        return tel.length >= 8 && tel.slice(-8) === ultimos8;
      });
      if (contatoExistente) {
        setErroDuplicado(`Já existe um contato com este telefone: "${contatoExistente.nome}"`);
        setSalvando(false);
        return;
      }
      await base44.entities.Contato.create({
        nome: novoContato.nome,
        telefone: telLimpo,
        data_nascimento: novoContato.data_nascimento || undefined,
        interesses: novoContato.motivo ? [novoContato.motivo] : [],
        origem: 'Manual',
        status: 'Novo',
        atendimento_humano: false,
        historico_mensagens: []
      });
      setModalAberto(false);
      setNovoContato({ nome: '', telefone: '', data_nascimento: '', motivo: '' });
      setErroDuplicado(null);
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

  const limparHistorico = async (contato) => {
    setLimpando(true);
    try {
      // Limpar o contato principal
      await base44.entities.Contato.update(contato.id, {
        historico_mensagens: [],
        ultima_mensagem: null,
        ultima_resposta: null,
        mensagens_pendentes: [],
        total_mensagens: 0,
        conversa_finalizada: true,
        processando_ia_lock: null
      });

      // Também limpar contatos duplicados com o mesmo telefone
      // (a tela de chat mescla históricos de todos os contatos com o mesmo número)
      const telNorm = (contato.telefone || '').replace(/\D/g, '');
      const ultimos8 = telNorm.slice(-8);
      if (ultimos8.length === 8) {
        const duplicados = contatos.filter(c => {
          if (c.id === contato.id) return false;
          const tel = (c.telefone || '').replace(/\D/g, '');
          return tel.length >= 8 && tel.slice(-8) === ultimos8;
        });
        for (const dup of duplicados) {
          try {
            await base44.entities.Contato.update(dup.id, {
              historico_mensagens: [],
              ultima_mensagem: null,
              ultima_resposta: null,
              mensagens_pendentes: [],
              total_mensagens: 0,
              conversa_finalizada: true,
              processando_ia_lock: null
            });
          } catch (e) {
            console.warn('Erro ao limpar duplicado:', dup.id, e);
          }
        }
      }

      setConfirmandoLimpeza(null);
      await carregarContatos();
    } catch (error) {
      console.error('Erro ao limpar hist\u00f3rico:', error);
      alert('Erro ao limpar hist\u00f3rico: ' + (error?.message || 'Erro desconhecido'));
    } finally {
      setLimpando(false);
    }
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

  const especialidadesDisponiveis = React.useMemo(() => {
    const tags = contatos.flatMap(contato => contato.tags || [])
      .map(tag => tag?.trim())
      .filter(Boolean);
    return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [contatos]);

  const contatosFiltrados = contatos.filter(contato => {
    const buscaNumeros = busca.replace(/\D/g, '');
    const telNumeros = (contato.telefone || '').replace(/\D/g, '');
    
    const matchBusca = !busca || 
      contato.nome?.toLowerCase().includes(busca.toLowerCase()) ||
      contato.telefone?.includes(busca) ||
      (buscaNumeros.length >= 8 && telNumeros.length >= 8 && telNumeros.slice(-8) === buscaNumeros.slice(-8));
    
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
    
    const matchEspecialidade = filtroEspecialidade === 'todas' ||
      (contato.tags || []).some(tag => tag?.trim().toLowerCase() === filtroEspecialidade.toLowerCase());

    return matchBusca && matchMotivo && matchEspecialidade;
  });

  const imprimirContatosFiltrados = () => {
    const escapar = (valor) => String(valor || '-').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[caractere]);
    const linhas = contatosFiltrados.map(contato => {
      const data = contato.created_date
        ? format(new Date(new Date(contato.created_date).getTime() - (3 * 60 * 60 * 1000)), 'dd/MM/yyyy HH:mm', { locale: ptBR })
        : '-';
      const motivo = contato.interesses?.[contato.interesses.length - 1] || 'Não informado';
      const especialidades = contato.tags?.length ? contato.tags.join(', ') : '-';
      return `<tr><td>${escapar(contato.nome || 'Não informado')}</td><td>${escapar(formatarTelefone(contato.telefone))}</td><td>${escapar(data)}</td><td>${escapar(motivo)}</td><td>${escapar(especialidades)}</td><td>${escapar(contato.origem || 'Site')}</td></tr>`;
    }).join('');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('data-testid', 'contatos-print-frame');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const documento = iframe.contentWindow.document;
    documento.open();
    documento.write(`<!doctype html><html><head><title>Lista de Contatos</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin:0 0 6px}p{font-size:12px;color:#555;margin:0 0 18px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:7px;border:1px solid #ccc;text-align:left;vertical-align:top}th{background:#f1f5f9}@page{size:landscape;margin:12mm}</style></head><body><h1>Lista de Contatos</h1><p>${contatosFiltrados.length} contato(s) conforme os filtros selecionados</p><table><thead><tr><th>Nome</th><th>Telefone</th><th>Data</th><th>Motivo</th><th>Especialidades</th><th>Origem</th></tr></thead><tbody>${linhas}</tbody></table></body></html>`);
    documento.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => iframe.remove(), 1000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4 min-w-0 max-w-full">
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
            <div className="w-full md:w-56">
              <Select value={filtroEspecialidade} onValueChange={handleFiltrarEspecialidade}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por especialidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as especialidades</SelectItem>
                  {especialidadesDisponiveis.map(especialidade => (
                    <SelectItem key={especialidade} value={especialidade}>{especialidade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={carregarContatos} variant="outline" disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              onClick={imprimirContatosFiltrados}
              variant="outline"
              disabled={contatosFiltrados.length === 0}
              data-testid="imprimir-contatos"
            >
              <Printer className="w-4 h-4 mr-2" />
              Imprimir lista
            </Button>
            <Button onClick={() => setModalAberto(true)} className="bg-green-600 hover:bg-green-700">
              <UserPlus className="w-4 h-4 mr-2" />
              Adicionar Contato
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="min-w-0 max-w-full overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Contatos ({contatosFiltrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
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
                    <TableHead>Especialidades</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="w-24"></TableHead>
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
                        {contato.tags && contato.tags.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {contato.tags.map((tag, i) => (
                              <Badge key={i} className="bg-emerald-100 text-emerald-800 text-[10px]">{tag}</Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{contato.origem || 'Site'}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            onClick={() => onIniciarConversa && onIniciarConversa(contato)}
                            title="Iniciar conversa"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                            onClick={() => abrirArquivos(contato)}
                            title="Ver arquivos"
                          >
                            <FolderOpen className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-800 hover:bg-red-50"
                            onClick={() => setConfirmandoLimpeza(contato)}
                            title="Limpar histórico de conversa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Arquivos */}
      <Dialog open={modalArquivosAberto} onOpenChange={setModalArquivosAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-amber-600" />
              Arquivos de {contatoArquivos?.nome || 'Cliente'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {arquivosContato.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Nenhum arquivo encontrado</p>
                <p className="text-sm text-gray-400 mt-1">Arquivos enviados na conversa aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {arquivosContato.map((arquivo, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition"
                  >
                    <div className="flex items-center gap-3">
                      {arquivo.tipo === 'image' ? (
                        <img 
                          src={arquivo.url} 
                          alt={arquivo.nome}
                          className="w-12 h-12 rounded object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition"
                          onClick={() => window.open(arquivo.url, '_blank')}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      {arquivo.tipo === 'image' ? (
                        <div className="w-12 h-12 bg-blue-100 rounded items-center justify-center hidden">
                          <Image className="w-5 h-5 text-blue-600" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 bg-amber-100 rounded flex items-center justify-center">
                          <File className="w-5 h-5 text-amber-600" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-sm truncate max-w-[200px]">{arquivo.nome}</p>
                        <p className="text-xs text-gray-500">
                          {arquivo.remetente} • {arquivo.data ? format(new Date(arquivo.data), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                        </p>
                      </div>
                    </div>
                    <a 
                      href={arquivo.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-gray-200 rounded-full transition"
                      title="Abrir arquivo"
                    >
                      <Download className="w-4 h-4 text-gray-600" />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalArquivosAberto(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmar Limpeza de Histórico */}
      <Dialog open={!!confirmandoLimpeza} onOpenChange={(open) => { if (!open) setConfirmandoLimpeza(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Limpar Histórico de Conversa
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-700">
              Tem certeza que deseja apagar todo o histórico de conversa de <strong>{confirmandoLimpeza?.nome || 'este contato'}</strong>?
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Esta ação não pode ser desfeita. A IA começará uma nova conversa do zero.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoLimpeza(null)} disabled={limpando}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => limparHistorico(confirmandoLimpeza)} 
              disabled={limpando}
            >
              {limpando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Limpar Histórico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                onChange={(e) => {
                  setNovoContato({...novoContato, telefone: e.target.value});
                  setErroDuplicado(null);
                }}
              />
              {erroDuplicado && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-2 rounded-md border border-red-200">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{erroDuplicado}</span>
                </div>
              )}
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