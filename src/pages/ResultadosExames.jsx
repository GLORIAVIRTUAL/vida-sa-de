import React, { useState, useEffect } from 'react';
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, FileText, Upload, Loader2, RefreshCw, Trash2, Eye, Plus, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ResultadosExames() {
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoResultado, setNovoResultado] = useState({
    paciente_nome: '',
    paciente_cpf: '',
    descricao: '',
    data_exame: ''
  });
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null);
  const [pacientes, setPacientes] = useState([]);
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [carregandoPacientes, setCarregandoPacientes] = useState(false);

  // Buscar pacientes ao digitar
  useEffect(() => {
    if (buscaPaciente.length < 2) {
      setPacientes([]);
      return;
    }
    const timer = setTimeout(async () => {
      setCarregandoPacientes(true);
      try {
        const todos = await base44.entities.Paciente.list('-created_date', 500);
        const termo = buscaPaciente.toLowerCase();
        const filtrados = todos.filter(p => p.nome?.toLowerCase().includes(termo));
        setPacientes(filtrados.slice(0, 10));
      } catch (e) {
        console.error('Erro ao buscar pacientes:', e);
      } finally {
        setCarregandoPacientes(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaPaciente]);

  const selecionarPaciente = (paciente) => {
    setNovoResultado({
      ...novoResultado,
      paciente_nome: paciente.nome,
      paciente_cpf: formatarCPF(paciente.cpf || '')
    });
    setBuscaPaciente(paciente.nome);
    setMostrarSugestoes(false);
  };

  const carregarResultados = async () => {
    setLoading(true);
    try {
      const dados = await base44.entities.ResultadoExame.list('-created_date', 100);
      setResultados(dados);
    } catch (error) {
      console.error('Erro ao carregar resultados:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarResultados();
  }, []);

  const formatarCPF = (valor) => {
    const numeros = valor.replace(/\D/g, '');
    if (numeros.length <= 3) return numeros;
    if (numeros.length <= 6) return `${numeros.slice(0, 3)}.${numeros.slice(3)}`;
    if (numeros.length <= 9) return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6)}`;
    return `${numeros.slice(0, 3)}.${numeros.slice(3, 6)}.${numeros.slice(6, 9)}-${numeros.slice(9, 11)}`;
  };

  const handleSalvar = async () => {
    if (!novoResultado.paciente_nome || !novoResultado.paciente_cpf || !arquivoSelecionado) {
      alert('Preencha nome, CPF e selecione um arquivo PDF');
      return;
    }

    setSalvando(true);
    try {
      // Upload do arquivo
      const { file_url } = await base44.integrations.Core.UploadFile({ file: arquivoSelecionado });

      // Criar registro
      await base44.entities.ResultadoExame.create({
        paciente_nome: novoResultado.paciente_nome,
        paciente_cpf: novoResultado.paciente_cpf.replace(/\D/g, ''),
        descricao: novoResultado.descricao,
        data_exame: novoResultado.data_exame || null,
        arquivo_url: file_url,
        nome_arquivo: arquivoSelecionado.name
      });

      setModalAberto(false);
      setNovoResultado({ paciente_nome: '', paciente_cpf: '', descricao: '', data_exame: '' });
      setArquivoSelecionado(null);
      setBuscaPaciente('');
      await carregarResultados();
    } catch (error) {
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleExcluir = async (id) => {
    if (!confirm('Deseja excluir este resultado?')) return;
    try {
      await base44.entities.ResultadoExame.delete(id);
      await carregarResultados();
    } catch (error) {
      alert('Erro ao excluir: ' + error.message);
    }
  };

  const resultadosFiltrados = resultados.filter(r => 
    !busca || 
    r.paciente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    r.paciente_cpf?.includes(busca.replace(/\D/g, ''))
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="w-7 h-7 text-blue-600" />
            Resultados de Exames
          </h1>
          <p className="text-gray-600">Arquivos PDF de resultados de pacientes</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={carregarResultados} variant="outline" disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Dialog open={modalAberto} onOpenChange={setModalAberto}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Novo Resultado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Resultado de Exame</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="relative">
                  <Label>Nome do Paciente *</Label>
                  <div className="relative">
                    <Input
                      placeholder="Digite para buscar paciente..."
                      value={buscaPaciente || novoResultado.paciente_nome}
                      onChange={(e) => {
                        setBuscaPaciente(e.target.value);
                        setNovoResultado({...novoResultado, paciente_nome: e.target.value});
                        setMostrarSugestoes(true);
                      }}
                      onFocus={() => buscaPaciente.length >= 2 && setMostrarSugestoes(true)}
                    />
                    {novoResultado.paciente_nome && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => {
                          setNovoResultado({...novoResultado, paciente_nome: '', paciente_cpf: ''});
                          setBuscaPaciente('');
                        }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {mostrarSugestoes && buscaPaciente.length >= 2 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {carregandoPacientes ? (
                        <div className="flex items-center gap-2 p-3 text-sm text-gray-500">
                          <Loader2 className="w-3 h-3 animate-spin" /> Buscando...
                        </div>
                      ) : pacientes.length > 0 ? (
                        pacientes.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b last:border-0"
                            onClick={() => selecionarPaciente(p)}
                          >
                            <span className="font-medium">{p.nome}</span>
                            {p.cpf && p.cpf !== 'NÃO INFORMADO' && (
                              <span className="text-gray-500 ml-2">CPF: {formatarCPF(p.cpf)}</span>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-gray-500">Nenhum paciente encontrado</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <Label>CPF do Paciente *</Label>
                  <Input
                    placeholder="000.000.000-00"
                    value={novoResultado.paciente_cpf}
                    onChange={(e) => setNovoResultado({...novoResultado, paciente_cpf: formatarCPF(e.target.value)})}
                  />
                </div>
                <div>
                  <Label>Descrição do Exame</Label>
                  <Input
                    placeholder="Ex: Hemograma completo"
                    value={novoResultado.descricao}
                    onChange={(e) => setNovoResultado({...novoResultado, descricao: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Data do Exame</Label>
                  <Input
                    type="date"
                    value={novoResultado.data_exame}
                    onChange={(e) => setNovoResultado({...novoResultado, data_exame: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Arquivo PDF *</Label>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setArquivoSelecionado(e.target.files[0])}
                  />
                  {arquivoSelecionado && (
                    <p className="text-sm text-green-600 mt-1">✓ {arquivoSelecionado.name}</p>
                  )}
                </div>
                <Button onClick={handleSalvar} disabled={salvando} className="w-full">
                  {salvando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Salvar Resultado
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar por nome ou CPF..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Resultados ({resultadosFiltrados.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : resultadosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nenhum resultado encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Data Exame</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Adicionado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultadosFiltrados.map((resultado) => (
                    <TableRow key={resultado.id}>
                      <TableCell className="font-medium">
                        {resultado.paciente_nome}
                      </TableCell>
                      <TableCell>
                        {formatarCPF(resultado.paciente_cpf || '')}
                      </TableCell>
                      <TableCell>
                        {resultado.descricao || '-'}
                      </TableCell>
                      <TableCell>
                        {resultado.data_exame ? 
                          format(new Date(resultado.data_exame), "dd/MM/yyyy", { locale: ptBR }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-blue-600">
                          <FileText className="w-3 h-3 mr-1" />
                          PDF
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {resultado.created_date ? 
                          format(new Date(resultado.created_date), "dd/MM/yyyy", { locale: ptBR }) 
                          : '-'
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(resultado.arquivo_url, '_blank')}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleExcluir(resultado.id)}
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
    </div>
  );
}