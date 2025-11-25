import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Users, CreditCard, Trash2 } from "lucide-react";
import { VendaCartao } from "@/entities/all";
import { useToast } from "@/components/ui/use-toast";
import { format, addYears, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { base44 } from "@/api/base44Client";

export default function ImportarVendasCartao() {
  const { toast } = useToast();
  const [dados, setDados] = useState('');
  const [vendasProcessadas, setVendasProcessadas] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [etapa, setEtapa] = useState('colar'); // 'colar', 'revisar', 'importar', 'concluido'

  // Função para parsear data em vários formatos
  const parseData = (dataStr) => {
    if (!dataStr || dataStr.trim() === '') return null;
    
    const str = dataStr.trim();
    
    // Tentar formato DD/MM/YYYY
    if (str.includes('/')) {
      const partes = str.split('/');
      if (partes.length === 3) {
        const [dia, mes, ano] = partes;
        const anoCompleto = ano.length === 2 ? `20${ano}` : ano;
        return `${anoCompleto}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
      }
    }
    
    // Tentar formato YYYY-MM-DD
    if (str.includes('-') && str.length >= 10) {
      return str.substring(0, 10);
    }
    
    return null;
  };

  // Função para limpar e formatar CPF
  const formatarCPF = (cpf) => {
    if (!cpf) return '';
    return cpf.toString().replace(/\D/g, '');
  };

  // Função para determinar o tipo de plano baseado no valor e quantidade de dependentes
  const determinarTipoPlano = (valor, formaPagamento, qtdDependentes) => {
    const valorNum = parseFloat(valor) || 0;
    const ehParcelado = formaPagamento?.toLowerCase().includes('crédito') || 
                        formaPagamento?.toLowerCase().includes('credito') ||
                        formaPagamento?.toLowerCase().includes('parcelado');
    
    if (qtdDependentes === 0) {
      return ehParcelado ? 'Individual Parcelado' : 'Individual à Vista';
    } else if (qtdDependentes <= 4) {
      return ehParcelado ? 'Familiar Parcelado' : 'Familiar à Vista';
    } else {
      return ehParcelado ? 'Grupo Parcelado' : 'Grupo à Vista';
    }
  };

  // Função para normalizar forma de pagamento
  const normalizarFormaPagamento = (forma) => {
    if (!forma) return 'Dinheiro';
    const f = forma.toLowerCase().trim();
    
    if (f.includes('pix')) return 'PIX';
    if (f.includes('débito') || f.includes('debito')) return 'Cartão Débito';
    if (f.includes('crédito') || f.includes('credito')) return 'Cartão Crédito';
    if (f.includes('transferência') || f.includes('transferencia')) return 'Transferência';
    if (f.includes('dinheiro')) return 'Dinheiro';
    
    return 'Dinheiro';
  };

  // Função principal para processar os dados colados
  const processarDados = () => {
    if (!dados.trim()) {
      toast({
        title: "Erro",
        description: "Cole os dados da planilha primeiro",
        variant: "destructive"
      });
      return;
    }

    try {
      const linhas = dados.trim().split('\n').filter(l => l.trim());
      const vendas = [];
      let vendaAtual = null;

      console.log(`📊 Processando ${linhas.length} linhas...`);

      for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        // Dividir por TAB (padrão de colar do Excel/Sheets)
        const colunas = linha.split('\t').map(c => c.trim());
        
        // Pular linha de cabeçalho
        if (i === 0 && (colunas[0]?.toLowerCase().includes('titular') || colunas[1]?.toLowerCase().includes('codigo'))) {
          console.log('⏭️ Pulando linha de cabeçalho');
          continue;
        }

        // Se não tiver colunas suficientes, pular
        if (colunas.length < 3) {
          console.log(`⏭️ Linha ${i + 1} ignorada: poucas colunas`);
          continue;
        }

        // NOVO FORMATO baseado na planilha do usuário:
        // 0: TITULAR (indica se é "TITULAR" ou "DEPENDENTE")
        // 1: MODCAR (código)
        // 2: NOME
        // 3: CPF
        // 4: RG
        // 5: NASCIMEN (data nascimento)
        // 6: SE (sexo)
        // 7: TELEFONE
        // 8: EMAIL
        // 9: DATA VI (data venda)
        // 10: CEP
        // 11: NDIR (endereço)
        // 12: NUM
        // 13: COMPLE
        // 14: BAIRRO
        // 15: CIDADE
        // 16: ES (estado)
        // 17: PLANO
        // 18: FORMA PA
        // 19: VALOR
        // 20: VENCIMEN

        const tipoRegistro = (colunas[0] || '').toUpperCase();
        const codigoCartao = colunas[1] || '';
        const nome = colunas[2] || '';
        const cpf = formatarCPF(colunas[3]);
        const rg = colunas[4] || '';
        const dataNascimento = parseData(colunas[5]);
        const sexo = colunas[6] || '';
        const telefone = colunas[7] || '';
        const email = colunas[8] || '';
        const dataVenda = parseData(colunas[9]);
        const cep = colunas[10] || '';
        const logradouro = colunas[11] || '';
        const numero = colunas[12] || '';
        const complemento = colunas[13] || '';
        const bairro = colunas[14] || '';
        const cidade = colunas[15] || '';
        const estado = colunas[16] || '';
        const plano = colunas[17] || '';
        const formaPagamento = colunas[18] || '';
        const valor = colunas[19] || '';
        const vencimento = parseData(colunas[20]);
        
        console.log(`Linha ${i}: valor="${valor}", vencimento="${colunas[20]}"`);

        // Verificar se é TITULAR pela coluna 0
        const ehTitular = tipoRegistro.includes('TITULAR');
        const ehDependente = tipoRegistro.includes('DEPENDENTE');

        if (ehTitular && nome) {
          // Salvar venda anterior se existir
          if (vendaAtual) {
            vendas.push(vendaAtual);
          }

          // Criar nova venda - limpar valor removendo R$, espaços e convertendo vírgula
          const valorLimpo = (valor || '0').toString().replace('R$', '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
          const valorNumerico = parseFloat(valorLimpo) || 0;
          
          console.log(`💰 Valor processado: "${valor}" -> "${valorLimpo}" -> ${valorNumerico}`);
          
          vendaAtual = {
            titular: {
              nome: nome,
              cpf: cpf,
              rg: rg,
              data_nascimento: dataNascimento,
              sexo: sexo,
              email: email,
              telefone: telefone,
              endereco: {
                cep: cep,
                logradouro: logradouro,
                numero: numero,
                complemento: complemento,
                bairro: bairro,
                cidade: cidade,
                estado: estado
              }
            },
            dependentes: [],
            data_venda: dataVenda,
            validade_cartao: vencimento,
            plano_original: plano,
            forma_pagamento: normalizarFormaPagamento(formaPagamento),
            valor_total: valorNumerico,
            status: 'Ativo',
            codigo_cartao: codigoCartao
          };

          console.log(`👤 Titular encontrado: ${nome} - R$ ${valorNumerico}`);

        } else if (ehDependente && vendaAtual && nome) {
          // É um DEPENDENTE do titular atual
          vendaAtual.dependentes.push({
            nome: nome,
            cpf: cpf,
            rg: rg,
            data_nascimento: dataNascimento,
            sexo: sexo
          });

          console.log(`   👶 Dependente: ${nome}`);
        }
      }

      // Adicionar última venda
      if (vendaAtual) {
        vendas.push(vendaAtual);
      }

      // Determinar tipo de plano para cada venda
      vendas.forEach(venda => {
        // Se tem plano original, usar ele para determinar tipo
        if (venda.plano_original) {
          const planoLower = venda.plano_original.toLowerCase();
          if (planoLower.includes('individual')) {
            venda.tipo_plano = planoLower.includes('parcelado') ? 'Individual Parcelado' : 'Individual à Vista';
          } else if (planoLower.includes('familiar')) {
            venda.tipo_plano = planoLower.includes('parcelado') ? 'Familiar Parcelado' : 'Familiar à Vista';
          } else if (planoLower.includes('grupo')) {
            venda.tipo_plano = planoLower.includes('parcelado') ? 'Grupo Parcelado' : 'Grupo à Vista';
          } else {
            venda.tipo_plano = determinarTipoPlano(venda.valor_total, venda.forma_pagamento, venda.dependentes.length);
          }
        } else {
          venda.tipo_plano = determinarTipoPlano(venda.valor_total, venda.forma_pagamento, venda.dependentes.length);
        }
        venda.quantidade_cartoes = 1 + venda.dependentes.length;
        venda.valor_cartoes = venda.quantidade_cartoes * 5;
      });

      console.log(`✅ Total de vendas processadas: ${vendas.length}`);
      
      setVendasProcessadas(vendas);
      setEtapa('revisar');

      toast({
        title: "Dados processados!",
        description: `${vendas.length} venda(s) identificada(s) com ${vendas.reduce((acc, v) => acc + v.dependentes.length, 0)} dependente(s)`,
      });

    } catch (error) {
      console.error('❌ Erro ao processar:', error);
      toast({
        title: "Erro ao processar dados",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  // Função para importar as vendas no sistema via backend
  const importarVendas = async () => {
    setImportando(true);
    setEtapa('importar');

    try {
      console.log(`📤 Enviando ${vendasProcessadas.length} vendas para o backend...`);
      
      // Chamar função backend para processar em lotes
      const response = await base44.functions.invoke('importarVendasCartao', {
        vendas: vendasProcessadas
      });

      console.log('📥 Resposta do backend:', response);

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      setResultado(response.data);
      setEtapa('concluido');

      toast({
        title: "Importação concluída!",
        description: `${response.data.sucesso} de ${response.data.total} venda(s) importada(s) com sucesso`,
      });

    } catch (error) {
      console.error('❌ Erro geral:', error);
      toast({
        title: "Erro na importação",
        description: error.message,
        variant: "destructive"
      });
      setEtapa('revisar');
    } finally {
      setImportando(false);
    }
  };

  const removerVenda = (index) => {
    setVendasProcessadas(prev => prev.filter((_, i) => i !== index));
  };

  const reiniciar = () => {
    setDados('');
    setVendasProcessadas([]);
    setResultado(null);
    setEtapa('colar');
  };

  return (
    <ProtectedRoute requiredRole={["admin"]}>
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <FileSpreadsheet className="w-8 h-8 text-teal-600" />
              <h1 className="text-3xl font-bold text-gray-900">Importar Vendas do Cartão Mais Vida</h1>
            </div>
            <p className="text-gray-600">
              Cole os dados da planilha Excel/Google Sheets para importar vendas com titulares e dependentes
            </p>
          </div>

          {/* Indicador de Etapas */}
          <div className="flex items-center gap-4 mb-6">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${etapa === 'colar' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              <span className="font-semibold">1</span> Colar Dados
            </div>
            <div className="w-8 h-0.5 bg-gray-300" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${etapa === 'revisar' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              <span className="font-semibold">2</span> Revisar
            </div>
            <div className="w-8 h-0.5 bg-gray-300" />
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full ${etapa === 'importar' || etapa === 'concluido' ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
              <span className="font-semibold">3</span> Importar
            </div>
          </div>

          {/* Etapa 1: Colar Dados */}
          {etapa === 'colar' && (
            <Card>
              <CardHeader>
                <CardTitle>Cole os dados da planilha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="w-4 h-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Formato esperado das colunas (separadas por TAB):</strong><br />
                    TITULAR/DEPENDENTE | MODCAR | NOME | CPF | RG | NASCIMENTO | SEXO | TELEFONE | EMAIL | DATA VENDA | CEP | ENDEREÇO | NUM | COMPL | BAIRRO | CIDADE | ESTADO | PLANO | FORMA PGTO | VALOR | VENCIMENTO
                    <br /><br />
                    <strong>💡 Dica:</strong> A coluna 1 deve indicar "TITULAR" ou "DEPENDENTE" para cada linha.
                  </AlertDescription>
                </Alert>

                <Textarea
                  value={dados}
                  onChange={(e) => setDados(e.target.value)}
                  placeholder="Cole aqui os dados copiados da planilha (Ctrl+V)..."
                  className="min-h-[300px] font-mono text-sm"
                />

                <div className="flex justify-end gap-2">
                  <Button
                    onClick={processarDados}
                    disabled={!dados.trim()}
                    className="bg-teal-600 hover:bg-teal-700"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Processar Dados
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Etapa 2: Revisar */}
          {etapa === 'revisar' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <CardTitle>Revisão das Vendas ({vendasProcessadas.length})</CardTitle>
                    <Button variant="outline" onClick={() => setEtapa('colar')}>
                      Voltar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {vendasProcessadas.map((venda, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-white">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CreditCard className="w-5 h-5 text-teal-600" />
                              <span className="font-semibold text-lg">{venda.titular.nome}</span>
                              <Badge className={
                                                                venda.tipo_plano?.includes('Individual') ? 'bg-blue-100 text-blue-800' :
                                                                venda.tipo_plano?.includes('Familiar') ? 'bg-purple-100 text-purple-800' :
                                                                venda.tipo_plano?.includes('Grupo') ? 'bg-orange-100 text-orange-800' :
                                                                'bg-gray-100 text-gray-800'
                                                              }>
                                                                {venda.tipo_plano}
                                                              </Badge>
                              <Badge variant="outline">
                                R$ {venda.valor_total.toFixed(2)}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-2">
                              <div><strong>CPF:</strong> {venda.titular.cpf || 'N/A'}</div>
                              <div><strong>Telefone:</strong> {venda.titular.telefone || 'N/A'}</div>
                              <div><strong>Data Venda:</strong> {venda.data_venda || 'N/A'}</div>
                              <div><strong>Validade:</strong> {venda.validade_cartao || 'N/A'}</div>
                            </div>

                            {venda.dependentes.length > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 rounded">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                                  <Users className="w-4 h-4" />
                                  {venda.dependentes.length} Dependente(s):
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {venda.dependentes.map((dep, depIndex) => (
                                    <Badge key={depIndex} variant="outline" className="bg-white">
                                      {dep.nome}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removerVenda(index)}
                            className="text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={reiniciar}>
                  Cancelar
                </Button>
                <Button
                  onClick={importarVendas}
                  disabled={vendasProcessadas.length === 0}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importar {vendasProcessadas.length} Venda(s)
                </Button>
              </div>
            </div>
          )}

          {/* Etapa 3: Importando */}
          {etapa === 'importar' && (
            <Card>
              <CardContent className="py-16 text-center">
                <Loader2 className="w-16 h-16 mx-auto mb-4 text-teal-600 animate-spin" />
                <h2 className="text-2xl font-semibold text-gray-900 mb-2">Importando Vendas...</h2>
                <p className="text-gray-600">Por favor, aguarde. Isso pode levar alguns minutos.</p>
              </CardContent>
            </Card>
          )}

          {/* Etapa 4: Concluído */}
          {etapa === 'concluido' && resultado && (
            <div className="space-y-4">
              <Card className="border-green-200 bg-green-50">
                <CardContent className="py-8 text-center">
                  <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-green-600" />
                  <h2 className="text-2xl font-semibold text-green-800 mb-2">Importação Concluída!</h2>
                  <p className="text-green-700">
                    {resultado.sucesso} de {vendasProcessadas.length} venda(s) importada(s) com sucesso
                  </p>
                </CardContent>
              </Card>

              {resultado.erros.length > 0 && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <AlertDescription className="text-red-800">
                    <strong>{resultado.erros.length} erro(s):</strong>
                    <ul className="list-disc list-inside mt-2">
                      {resultado.erros.map((erro, i) => (
                        <li key={i}>{erro.nome}: {erro.erro}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={reiniciar}>
                  Nova Importação
                </Button>
                <Button
                  onClick={() => window.location.href = '/VendaCartao'}
                  className="bg-teal-600 hover:bg-teal-700"
                >
                  Ver Vendas
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}