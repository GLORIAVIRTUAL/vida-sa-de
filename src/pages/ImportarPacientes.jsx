import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Download } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function ImportarPacientes() {
  const [arquivo, setArquivo] = useState(null);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pacientesComErro, setPacientesComErro] = useState([]);
  const fileInputRef = useRef(null);

  const addLog = (msg, tipo = 'info') => {
    setLogs(prev => [...prev, { msg, tipo, time: new Date().toLocaleTimeString() }]);
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    // Detectar separador (vírgula ou ponto e vírgula)
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    
    const headers = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(separator).map(v => v.trim().replace(/"/g, ''));
      if (values.length >= 2) { // Mínimo: nome e algum outro campo
        const record = {};
        headers.forEach((header, idx) => {
          record[header] = values[idx] || '';
        });
        records.push(record);
      }
    }
    
    return records;
  };

  const mapearCampos = (record) => {
    // Mapear campos da planilha para campos do sistema
    const paciente = {
      nome: record.nome || record.name || record.paciente || '',
      cpf: record.cpf || record.documento || '',
      rg: record.rg || '',
      telefone: record.telefone || record.celular || record.phone || record.fone || '',
      telefone_secundario: record.telefone_secundario || record.telefone2 || record.celular2 || '',
      email: record.email || record.e_mail || '',
      data_nascimento: record.data_nascimento || record.nascimento || record.dt_nascimento || '',
      convenio: record.convenio || record.plano || '',
      numero_carteira: record.numero_carteira || record.carteira || record.carteirinha || '',
      observacoes: record.observacoes || record.obs || ''
    };

    // Endereço
    if (record.cep || record.logradouro || record.endereco) {
      paciente.endereco = {
        cep: record.cep || '',
        logradouro: record.logradouro || record.endereco || record.rua || '',
        numero: record.numero || '',
        complemento: record.complemento || '',
        bairro: record.bairro || '',
        cidade: record.cidade || record.municipio || '',
        estado: record.estado || record.uf || ''
      };
    }

    // Limpar campos vazios
    Object.keys(paciente).forEach(key => {
      if (paciente[key] === '' || paciente[key] === undefined) {
        delete paciente[key];
      }
    });

    // Formatar data de nascimento se existir
    if (paciente.data_nascimento) {
      // Tentar converter formatos comuns: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
      const data = paciente.data_nascimento;
      if (data.includes('/')) {
        const [dia, mes, ano] = data.split('/');
        if (dia && mes && ano) {
          paciente.data_nascimento = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
        }
      }
    }

    return paciente;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setArquivo(file);
      setResultado(null);
      setLogs([]);
    }
  };

  const handleImportar = async () => {
    if (!arquivo) return;

    setImportando(true);
    setProgresso(0);
    setLogs([]);
    setResultado(null);
    setPacientesComErro([]);

    try {
      addLog('Lendo arquivo...', 'info');
      
      const text = await arquivo.text();
      const records = parseCSV(text);
      
      addLog(`Encontrados ${records.length} registros no arquivo`, 'info');

      if (records.length === 0) {
        throw new Error('Nenhum registro encontrado no arquivo');
      }

      const pacientes = records.map(mapearCampos).filter(p => p.nome);
      addLog(`${pacientes.length} pacientes válidos para importar`, 'info');

      if (pacientes.length === 0) {
        throw new Error('Nenhum paciente válido encontrado. Verifique se a coluna "nome" existe.');
      }

      // Importar em lotes de 50 com pausa entre lotes para evitar rate limit
      const BATCH_SIZE = 50;
      let importados = 0;
      let erros = 0;

      for (let i = 0; i < pacientes.length; i += BATCH_SIZE) {
        const batch = pacientes.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(pacientes.length / BATCH_SIZE);
        
        addLog(`Processando lote ${batchNum}/${totalBatches} (${batch.length} registros)...`, 'info');

        try {
          await base44.entities.Paciente.bulkCreate(batch);
          importados += batch.length;
          addLog(`✓ Lote ${batchNum} importado com sucesso`, 'success');
        } catch (err) {
          erros += batch.length;
          addLog(`✗ Erro no lote ${batchNum}: ${err.message}`, 'error');
          
          // Tentar importar um por um para identificar registros problemáticos
          for (const paciente of batch) {
            try {
              await base44.entities.Paciente.create(paciente);
              importados++;
              erros--;
            } catch (e) {
              addLog(`  → Erro em "${paciente.nome}": ${e.message}`, 'error');
              setPacientesComErro(prev => [...prev, { ...paciente, erro: e.message }]);
            }
          }
        }

        setProgresso(Math.round(((i + batch.length) / pacientes.length) * 100));
        
        // Pausa de 2 segundos entre lotes para evitar rate limit
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setResultado({
        sucesso: true,
        total: pacientes.length,
        importados,
        erros
      });

      addLog(`Importação finalizada: ${importados} importados, ${erros} erros`, importados > 0 ? 'success' : 'error');

    } catch (error) {
      addLog(`Erro fatal: ${error.message}`, 'error');
      setResultado({
        sucesso: false,
        erro: error.message
      });
    } finally {
      setImportando(false);
    }
  };

  const downloadModelo = () => {
    const modelo = 'nome;cpf;rg;telefone;email;data_nascimento;convenio;cep;logradouro;numero;bairro;cidade;estado\n';
    const exemplo = 'João Silva;12345678900;1234567;51999999999;joao@email.com;15/03/1980;Particular;95000000;Rua Exemplo;123;Centro;Tramandaí;RS\n';
    
    const blob = new Blob([modelo + exemplo], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modelo_pacientes.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Importar Pacientes em Massa
          </CardTitle>
          <CardDescription>
            Importe milhares de pacientes de uma vez a partir de um arquivo CSV
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          {/* Instruções */}
          <Alert>
            <FileSpreadsheet className="w-4 h-4" />
            <AlertDescription>
              <strong>Formato esperado:</strong> CSV com colunas separadas por vírgula ou ponto e vírgula.
              <br />
              <strong>Colunas aceitas:</strong> nome, cpf, rg, telefone, email, data_nascimento, convenio, cep, logradouro, numero, bairro, cidade, estado
              <br />
              <strong>Obrigatório:</strong> coluna "nome"
            </AlertDescription>
          </Alert>

          {/* Botão de modelo */}
          <Button variant="outline" onClick={downloadModelo} className="gap-2">
            <Download className="w-4 h-4" />
            Baixar Modelo CSV
          </Button>

          {/* Upload */}
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            
            {arquivo ? (
              <div className="space-y-2">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-green-600" />
                <p className="font-medium">{arquivo.name}</p>
                <p className="text-sm text-gray-500">
                  {(arquivo.size / 1024).toFixed(1)} KB
                </p>
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  Trocar arquivo
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-12 h-12 mx-auto text-gray-400" />
                <p className="text-gray-600">Arraste um arquivo CSV ou clique para selecionar</p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  Selecionar Arquivo
                </Button>
              </div>
            )}
          </div>

          {/* Progresso */}
          {importando && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Importando...</span>
                <span>{progresso}%</span>
              </div>
              <Progress value={progresso} />
            </div>
          )}

          {/* Botão de importar */}
          <Button 
            onClick={handleImportar} 
            disabled={!arquivo || importando}
            className="w-full"
            size="lg"
          >
            {importando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Iniciar Importação
              </>
            )}
          </Button>

          {/* Resultado */}
          {resultado && (
            <Alert className={resultado.sucesso && resultado.importados > 0 ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}>
              {resultado.sucesso && resultado.importados > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600" />
              )}
              <AlertDescription>
                {resultado.sucesso ? (
                  <div>
                    <strong>Importação concluída!</strong>
                    <br />
                    Total: {resultado.total} | Importados: {resultado.importados} | Erros: {resultado.erros}
                  </div>
                ) : (
                  <div>
                    <strong>Erro na importação:</strong> {resultado.erro}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Exportar erros */}
          {pacientesComErro.length > 0 && (
            <div className="space-y-2">
              <Alert className="border-orange-500 bg-orange-50">
                <AlertCircle className="w-4 h-4 text-orange-600" />
                <AlertDescription>
                  <strong>{pacientesComErro.length} pacientes não foram importados.</strong>
                  <br />
                  Baixe a lista abaixo para corrigir os dados e tentar novamente.
                </AlertDescription>
              </Alert>
              <Button 
                variant="outline" 
                className="gap-2 border-orange-500 text-orange-700 hover:bg-orange-50"
                onClick={() => {
                  const headers = 'nome;cpf;telefone;email;data_nascimento;erro\n';
                  const rows = pacientesComErro.map(p => 
                    `"${p.nome || ''}";"${p.cpf || ''}";"${p.telefone || ''}";"${p.email || ''}";"${p.data_nascimento || ''}";"${p.erro || ''}"`
                  ).join('\n');
                  
                  const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'pacientes_com_erro.csv';
                  a.click();
                  window.URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4" />
                Baixar Lista de Pacientes com Erro ({pacientesComErro.length})
              </Button>
            </div>
          )}

          {/* Logs */}
          {logs.length > 0 && (
            <div className="bg-gray-900 text-gray-100 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-sm">
              {logs.map((log, idx) => (
                <div key={idx} className={`
                  ${log.tipo === 'error' ? 'text-red-400' : ''}
                  ${log.tipo === 'success' ? 'text-green-400' : ''}
                  ${log.tipo === 'info' ? 'text-blue-300' : ''}
                `}>
                  [{log.time}] {log.msg}
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
}