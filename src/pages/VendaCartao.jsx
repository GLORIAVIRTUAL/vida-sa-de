import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, CreditCard, Search, Eye, Filter, Loader2, X, AlertTriangle, Printer, Edit, Upload } from "lucide-react";
import { VendaCartao } from "@/entities/all";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { safeApiCall } from "@/components/shared/apiThrottle";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import FormularioVendaCartao from "../components/venda-cartao/FormularioVendaCartao";
import ReciboVenda from "../components/venda-cartao/ReciboVenda";
import ContratoAdesao from "../components/venda-cartao/ContratoAdesao";
import GeradorCartoes from "../components/venda-cartao/GeradorCartoes";
import RelatorioVendaCartao from "../components/venda-cartao/RelatorioVendaCartao";

const SENHA_CANCELAMENTO = "123123";

const formatDateSafe = (dateString) => {
  if (!dateString) return "N/A";
  try {
    // Corrigir problema de timezone: datas no formato 'YYYY-MM-DD' são interpretadas como UTC
    // Adicionamos 'T12:00:00' para garantir que seja tratado corretamente no fuso local
    let date;
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // Formato ISO sem hora - tratar como data local
      const [year, month, day] = dateString.split('-');
      date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } else {
      date = new Date(dateString);
    }
    if (isNaN(date.getTime())) return "Data Inválida";
    return format(date, 'dd/MM/yyyy');
  } catch (e) {
    return "Erro Data";
  }
};

const statusColors = {
  "Ativo": "bg-green-100 text-green-800 border-green-200",
  "Vencido": "bg-red-100 text-red-800 border-red-200",
  "Cancelado": "bg-gray-100 text-gray-800 border-gray-200"
};

export default function VendaCartaoPage() {
  const { toast } = useToast();
  const [vendas, setVendas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [reciboAberto, setReciboAberto] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState(null);
  const [vendaParaEditar, setVendaParaEditar] = useState(null);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  
  const [modalCancelarAberto, setModalCancelarAberto] = useState(false);
  const [vendaParaCancelar, setVendaParaCancelar] = useState(null);
  const [senhaCancelamento, setSenhaCancelamento] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState('');

  const [contratoAberto, setContratoAberto] = useState(false);
  const [cartoesAberto, setCartoesAberto] = useState(false);

  useEffect(() => {
    carregarVendas();
  }, []);

  const carregarVendas = async () => {
    setLoading(true);
    try {
      const vendasData = await safeApiCall(() => VendaCartao.list('-created_date'));
      setVendas(vendasData || []);
      
      await verificarCartõesVencidos(vendasData || []);
    } catch (error) {
      console.error("Erro ao carregar vendas:", error);
    } finally {
      setLoading(false);
    }
  };

  const verificarCartõesVencidos = async (vendas) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const cartoesParaAtualizar = [];

    for (const venda of vendas) {
      if (venda.status === 'Vencido' || venda.status === 'Cancelado') {
        continue;
      }

      const validadeCartao = new Date(venda.validade_cartao);
      validadeCartao.setHours(0, 0, 0, 0);

      if (validadeCartao < hoje) {
        cartoesParaAtualizar.push(venda.id);
      }
    }

    if (cartoesParaAtualizar.length > 0) {
      console.log(`⏰ Atualizando ${cartoesParaAtualizar.length} cartão(ões) vencido(s)...`);
      
      for (const vendaId of cartoesParaAtualizar) {
        try {
          await safeApiCall(() => VendaCartao.update(vendaId, { status: 'Vencido' }));
          console.log(`✅ Cartão ${vendaId} marcado como vencido`);
        } catch (error) {
          console.error(`❌ Erro ao atualizar cartão ${vendaId}:`, error);
        }
      }

      const vendasAtualizadas = await safeApiCall(() => VendaCartao.list('-created_date'));
      setVendas(vendasAtualizadas || []);
    }
  };

  const getStatusCartao = (venda) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const validadeCartao = new Date(venda.validade_cartao);
    validadeCartao.setHours(0, 0, 0, 0);

    const diffTime = validadeCartao.getTime() - hoje.getTime();
    const diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (venda.status === 'Cancelado') {
      return { status: 'Cancelado', cor: statusColors['Cancelado'], aviso: null };
    }

    if (validadeCartao < hoje || venda.status === 'Vencido') {
      return { status: 'Vencido', cor: statusColors['Vencido'], aviso: null };
    }

    if (diasRestantes <= 30) {
      return { 
        status: 'Ativo',
        cor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        aviso: `⚠️ Vence em ${diasRestantes} dia(s)`
      };
    }

    return { status: 'Ativo', cor: statusColors['Ativo'], aviso: null };
  };

  const handleAbrirFormulario = () => {
    setVendaSelecionada(null);
    setVendaParaEditar(null);
    setFormularioAberto(true);
  };

  const handleEditarVenda = (venda) => {
    if (venda.status === 'Cancelado') {
      toast({
        title: "Aviso",
        description: "Não é possível editar uma venda cancelada.",
        variant: "default",
      });
      return;
    }
    
    setVendaParaEditar(venda);
    setFormularioAberto(true);
  };

  const handleSalvar = async () => {
    await carregarVendas();
    setFormularioAberto(false);
    setVendaParaEditar(null);
  };

  const handleVisualizarRecibo = (venda) => {
    setVendaSelecionada(venda);
    setReciboAberto(true);
  };

  const handleVisualizarContrato = (venda) => {
    setVendaSelecionada(venda);
    setContratoAberto(true);
  };

  const handleAbrirCartoes = (venda) => {
    setVendaSelecionada(venda);
    setCartoesAberto(true);
  };

  const handleAbrirModalCancelar = (venda) => {
    if (venda.status === 'Cancelado') {
      toast({
        title: "Aviso",
        description: "Esta venda já está cancelada.",
        variant: "default",
      });
      return;
    }

    setVendaParaCancelar(venda);
    setSenhaCancelamento('');
    setErroCancelamento('');
    setModalCancelarAberto(true);
  };

  const handleCancelarVenda = async () => {
    setErroCancelamento('');

    if (!senhaCancelamento) {
      setErroCancelamento('Digite a senha de cancelamento');
      return;
    }

    if (senhaCancelamento !== SENHA_CANCELAMENTO) {
      setErroCancelamento('❌ Senha incorreta! Tente novamente.');
      return;
    }

    setCancelando(true);
    try {
      console.log('🔄 Cancelando venda:', vendaParaCancelar.id);

      await safeApiCall(() => VendaCartao.update(vendaParaCancelar.id, {
        status: 'Cancelado',
        observacoes: (vendaParaCancelar.observacoes || '') + 
          `\n\n[CANCELADO em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}]`
      }));

      console.log('✅ Venda cancelada com sucesso');

      toast({
        title: "Venda Cancelada ✅",
        description: `Venda #${vendaParaCancelar.numero_venda} foi cancelada com sucesso`,
        duration: 5000
      });

      await carregarVendas();

      setModalCancelarAberto(false);
      setVendaParaCancelar(null);
      setSenhaCancelamento('');

    } catch (error) {
      console.error('❌ Erro ao cancelar venda:', error);
      setErroCancelamento('Erro ao processar cancelamento. Tente novamente.');
      toast({
        title: "Erro",
        description: "Erro ao cancelar venda",
        variant: "destructive"
      });
    } finally {
      setCancelando(false);
    }
  };

  const vendasFiltradas = vendas.filter(venda => {
    const termoBusca = busca.toLowerCase();
    const matchTitular = venda.titular.nome.toLowerCase().includes(termoBusca) ||
                      venda.titular.cpf.includes(busca) ||
                      venda.numero_venda?.includes(busca);

    const matchDependente = venda.dependentes?.some(dep => 
      dep.nome.toLowerCase().includes(termoBusca) || 
      (dep.cpf && dep.cpf.includes(busca))
    );
    
    const matchBusca = matchTitular || matchDependente;
    const matchStatus = filtroStatus === 'todos' || venda.status === filtroStatus;
    
    return matchBusca && matchStatus;
  });

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png" 
              alt="Cartão Mais Vida"
              className="h-16 object-contain"
            />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Venda de Cartão Mais Vida</h1>
              <p className="text-gray-600">Gestão de vendas e renovações do cartão de saúde</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button onClick={handleAbrirFormulario} size="lg" className="bg-teal-600 hover:bg-teal-700">
              <PlusCircle className="w-5 h-5 mr-2" />
              Nova Venda
            </Button>
            <Link to={createPageUrl('ImportarVendasCartao')}>
              <Button 
                variant="outline" 
                size="lg"
                className="border-teal-600 text-teal-600 hover:bg-teal-50"
              >
                <Upload className="w-5 h-5 mr-2" />
                Importar Planilha
              </Button>
            </Link>
          </div>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por titular, dependente, CPF ou número..."
                    className="pl-8"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <Button
                  variant={filtroStatus === 'todos' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroStatus('todos')}
                >
                  Todos
                </Button>
                <Button
                  variant={filtroStatus === 'Ativo' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroStatus('Ativo')}
                  className={filtroStatus === 'Ativo' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                >
                  Ativos
                </Button>
                <Button
                  variant={filtroStatus === 'Vencido' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroStatus('Vencido')}
                  className={filtroStatus === 'Vencido' ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
                >
                  Vencidos
                </Button>
                <Button
                  variant={filtroStatus === 'Cancelado' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFiltroStatus('Cancelado')}
                  className={filtroStatus === 'Cancelado' ? 'bg-gray-600 hover:bg-gray-700 text-white' : ''}
                >
                  Cancelados
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Vendas */}
        <Card>
          <CardHeader>
            <CardTitle>Vendas Registradas ({vendasFiltradas.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Carregando vendas...</div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <CreditCard className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">Nenhuma venda encontrada</p>
                <p className="text-sm">Clique em "Nova Venda" para registrar a primeira venda</p>
              </div>
            ) : (
              <div className="space-y-3">
                {vendasFiltradas.map((venda) => {
                  const statusInfo = getStatusCartao(venda);
                  
                  // Verificar se algum dependente deu match na busca
                  const dependenteEncontrado = busca && venda.dependentes?.find(dep => 
                    dep.nome.toLowerCase().includes(busca.toLowerCase()) || 
                    (dep.cpf && dep.cpf.includes(busca))
                  );

                  return (
                    <div key={venda.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <CreditCard className="w-5 h-5 text-teal-600" />
                            <div className="flex flex-col">
                              <span className="font-semibold text-lg">{venda.titular.nome}</span>
                              {dependenteEncontrado && (
                                <span className="text-xs text-teal-600 font-medium bg-teal-50 px-2 py-0.5 rounded-md w-fit mt-1">
                                  Dependente encontrado: {dependenteEncontrado.nome}
                                </span>
                              )}
                            </div>
                            <Badge className={`${statusInfo.cor} border`}>
                              {statusInfo.status}
                            </Badge>
                            {statusInfo.aviso && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
                                {statusInfo.aviso}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                            <div>
                              <p className="text-gray-500">CPF</p>
                              <p className="font-medium">{venda.titular.cpf}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Plano</p>
                              <p className="font-medium">{venda.tipo_plano}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Dependentes</p>
                              <p className="font-medium">{venda.dependentes?.length || 0}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Valor</p>
                              <p className="font-medium text-green-600">R$ {venda.valor_total.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Data Venda</p>
                              <p className="font-medium">
                                {formatDateSafe(venda.data_venda)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Validade</p>
                              <p className={`font-medium ${statusInfo.status === 'Vencido' ? 'text-red-600' : statusInfo.aviso ? 'text-yellow-600' : 'text-gray-900'}`}>
                                {formatDateSafe(venda.validade_cartao)}
                              </p>
                            </div>
                            <div>
                              <p className="text-gray-500">Forma Pgto</p>
                              <p className="font-medium">{venda.forma_pagamento}</p>
                            </div>
                            {venda.numero_parcelas > 1 && (
                              <div>
                                <p className="text-gray-500">Parcelas</p>
                                <p className="font-medium">{venda.numero_parcelas}x de R$ {venda.valor_parcela.toFixed(2)}</p>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex flex-col gap-2 ml-4">
                          {venda.status !== 'Cancelado' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditarVenda(venda)}
                              className="text-blue-600 hover:bg-blue-50 border-blue-200"
                            >
                              <Edit className="w-4 h-4 mr-1" />
                              Editar
                            </Button>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVisualizarRecibo(venda)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Ver Recibo
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleVisualizarContrato(venda)}
                            className="text-teal-600 hover:bg-teal-50 border-teal-200"
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Imprimir Contrato
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAbrirCartoes(venda)}
                            className="text-purple-600 hover:bg-purple-50 border-purple-200"
                          >
                            <CreditCard className="w-4 h-4 mr-1" />
                            Gerar Cartões
                          </Button>
                          
                          {venda.status !== 'Cancelado' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAbrirModalCancelar(venda)}
                              className="text-red-600 hover:bg-red-50 border-red-200"
                            >
                              Cancelar Compra
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {formularioAberto && (
        <FormularioVendaCartao
          venda={vendaParaEditar}
          onClose={() => {
            setFormularioAberto(false);
            setVendaParaEditar(null);
          }}
          onSave={handleSalvar}
        />
      )}

      {reciboAberto && vendaSelecionada && (
        <ReciboVenda
          venda={vendaSelecionada}
          onClose={() => setReciboAberto(false)}
        />
      )}

      {contratoAberto && vendaSelecionada && (
        <ContratoAdesao
          venda={vendaSelecionada}
          onClose={() => setContratoAberto(false)}
        />
      )}

      {cartoesAberto && vendaSelecionada && (
        <GeradorCartoes
          venda={vendaSelecionada}
          open={cartoesAberto}
          onClose={() => setCartoesAberto(false)}
        />
      )}

      {/* Modal de Cancelamento */}
      <Dialog open={modalCancelarAberto} onOpenChange={setModalCancelarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Cancelar Venda
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. O cartão será marcado como cancelado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Atenção:</strong> Você está prestes a cancelar a venda <strong>{vendaParaCancelar?.numero_venda}</strong> do titular <strong>{vendaParaCancelar?.titular?.nome}</strong>
              </AlertDescription>
            </Alert>

            <div>
              <Label htmlFor="senha">Senha de Cancelamento *</Label>
              <Input
                id="senha"
                type="password"
                placeholder="Digite a senha"
                value={senhaCancelamento}
                onChange={(e) => {
                  setSenhaCancelamento(e.target.value);
                  setErroCancelamento('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCancelarVenda();
                  }
                }}
                disabled={cancelando}
                className="mt-1"
              />
              {erroCancelamento && (
                <p className="text-sm text-red-600 mt-2">{erroCancelamento}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setModalCancelarAberto(false);
                setVendaParaCancelar(null);
                setSenhaCancelamento('');
                setErroCancelamento('');
              }}
              disabled={cancelando}
            >
              Voltar
            </Button>
            <Button 
              type="button"
              variant="destructive"
              onClick={handleCancelarVenda}
              disabled={cancelando || !senhaCancelamento}
            >
              {cancelando ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Confirmar Cancelamento'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}