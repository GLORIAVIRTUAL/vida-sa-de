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
        
        // Pular linha de cabeçalho SOMENTE se a coluna 0 for literalmente "TITULAR/DEPENDENTE" ou similar (não apenas "TITULAR")
        const col0Lower = (colunas[0] || '').toLowerCase();
        if (i === 0 && (col0Lower.includes('titular/dependente') || col0Lower === 'tipo' || colunas[1]?.toLowerCase() === 'modcar' || colunas[1]?.toLowerCase() === 'codigo')) {
          console.log('⏭️ Pulando linha de cabeçalho');
          continue;
        }

        // Se não tiver colunas suficientes, pular
        if (colunas.length < 3) {
          console.log(`⏭️ Linha ${i + 1} ignorada: poucas colunas`);
          continue;
        }

        // FORMATO DA PLANILHA (SEM EMAIL):
        // 0: TITULAR/DEPENDENTE
        // 1: MODCAR (código)
        // 2: NOME
        // 3: CPF
        // 4: (vazio/RG)
        // 5: NASCIMENTO
        // 6: SEXO
        // 7: TELEFONE
        // 8: (vazio)
        // 9: DATA VENDA
        // 10: CEP
        // 11: TIPO LOGRADOURO (RUA, AV, etc)
        // 12: LOGRADOURO (nome da rua)
        // 13: NUMERO
        // 14: COMPLEMENTO (vazio na maioria)
        // 15: BAIRRO
        // 16: CIDADE
        // 17: ESTADO
        // 18: PLANO
        // 19: FORMA PGTO
        // 20: VALOR
        // 21: VALIDADE

        // Debug: mostrar colunas para análise
        console.log(`📋 Linha ${i}: ${colunas.length} colunas`, colunas.slice(0, 5));

        const tipoRegistro = (colunas[0] || '').toUpperCase();
        const codigoCartao = colunas[1] || '';
        const nome = colunas[2] || '';
        const cpf = formatarCPF(colunas[3]);
        const rg = colunas[4] || '';
        const dataNascimento = parseData(colunas[5]);
        const sexo = colunas[6] || '';
        const telefone = colunas[7] || '';
        const email = ''; // Email removido - coluna não existe mais
        const dataVenda = parseData(colunas[9]);
        const cep = colunas[10] || '';
        const tipoLogradouro = colunas[11] || '';
        const nomeLogradouro = colunas[12] || '';
        const logradouro = tipoLogradouro && nomeLogradouro ? `${tipoLogradouro} ${nomeLogradouro}` : (tipoLogradouro || nomeLogradouro);
        const numero = colunas[13] || '';
        const complemento = colunas[14] || '';
        const bairro = colunas[15] || '';
        const cidade = colunas[16] || '';
        const estado = colunas[17] || '';
        const plano = colunas[18] || '';
        const formaPagamento = colunas[19] || '';
        const valorRaw = colunas[20] || '';
        const validadeRaw = colunas[21] || '';
        
        // Limpar valor: remover "R$", espaços, e converter vírgula para ponto
        const valorLimpo = valorRaw.replace('R$', '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
        const valor = parseFloat(valorLimpo) || 0;
        const validade = parseData(validadeRaw);
        
        console.log(`Linha ${i}: valorRaw="${valorRaw}" -> valor=${valor}, validadeRaw="${validadeRaw}" -> validade=${validade}`);

        // Verificar se é TITULAR pela coluna 0
        const ehTitular = tipoRegistro.includes('TITULAR');
        const ehDependente = tipoRegistro.includes('DEPENDENTE');

        if (ehTitular && nome) {
          // Salvar venda anterior se existir
          if (vendaAtual) {
            vendas.push(vendaAtual);
          }
          
          console.log(`💰 Valor processado: ${valor}, Validade: ${validade}`);
          
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
            validade_cartao: validade,
            plano_original: plano,
            forma_pagamento: normalizarFormaPagamento(formaPagamento),
            valor_total: valor,
            status: 'Ativo',
            codigo_cartao: codigoCartao
          };

          console.log(`👤 Titular encontrado: ${nome} - R$ ${valor} - Validade: ${validade}`);

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
          const ehParcelado = venda.forma_pagamento?.toLowerCase().includes('crédito') || 
                              venda.forma_pagamento?.toLowerCase().includes('credito') ||
                              planoLower.includes('parcelado');
          
          if (planoLower.includes('individual') || planoLower.includes('1)') || planoLower.includes('(1')) {
            venda.tipo_plano = ehParcelado ? 'Individual Parcelado' : 'Individual à Vista';
          } else if (planoLower.includes('familiar') || planoLower.includes('2-5') || planoLower.includes('(2')) {
            venda.tipo_plano = ehParcelado ? 'Familiar Parcelado' : 'Familiar à Vista';
          } else if (planoLower.includes('grupo') || planoLower.includes('6-10') || planoLower.includes('(6')) {
            venda.tipo_plano = ehParcelado ? 'Grupo Parcelado' : 'Grupo à Vista';
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

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm text-gray-600 mb-2">
                              <div><strong>CPF:</strong> {venda.titular.cpf || 'N/A'}</div>
                              <div><strong>Telefone:</strong> {venda.titular.telefone || 'N/A'}</div>
                              <div><strong>Email:</strong> {venda.titular.email || 'N/A'}</div>
                              <div><strong>Data Venda:</strong> {venda.data_venda || 'N/A'}</div>
                              <div><strong>Validade:</strong> {venda.validade_cartao || 'N/A'}</div>
                            </div>

                            {venda.titular.endereco && (venda.titular.endereco.logradouro || venda.titular.endereco.cidade) && (
                              <div className="text-sm text-gray-600 mb-2">
                                <strong>Endereço:</strong> {[
                                  venda.titular.endereco.logradouro,
                                  venda.titular.endereco.numero && `nº ${venda.titular.endereco.numero}`,
                                  venda.titular.endereco.complemento,
                                  venda.titular.endereco.bairro,
                                  venda.titular.endereco.cidade,
                                  venda.titular.endereco.estado,
                                  venda.titular.endereco.cep && `CEP: ${venda.titular.endereco.cep}`
                                ].filter(Boolean).join(', ')}
                              </div>
                            )}

                            {venda.dependentes.length > 0 && (
                              <div className="mt-2 p-2 bg-gray-50 rounded">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                  <Users className="w-4 h-4" />
                                  {venda.dependentes.length} Dependente(s):
                                </div>
                                <div className="space-y-1">
                                  {venda.dependentes.map((dep, depIndex) => (
                                    <div key={depIndex} className="flex flex-wrap items-center gap-3 text-sm bg-white p-2 rounded border">
                                      <span className="font-medium">{dep.nome}</span>
                                      {dep.cpf && <span className="text-gray-500">CPF: {dep.cpf}</span>}
                                      {dep.data_nascimento && <span className="text-gray-500">Nasc: {dep.data_nascimento}</span>}
                                    </div>
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