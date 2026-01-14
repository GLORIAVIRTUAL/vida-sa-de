import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Download, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImportarProcedimentos() {
  const [arquivo, setArquivo] = useState(null);
  const [dadosPreview, setDadosPreview] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    carregarCategorias();
  }, []);

  const carregarCategorias = async () => {
    const cats = await base44.entities.CategoriaPreco.filter({ status: 'Ativo' });
    setCategorias(cats);
  };

  const parseCSV = (texto) => {
    const linhas = texto.split('\n').filter(l => l.trim());
    if (linhas.length < 2) return [];
    
    // Primeira linha são os headers
    const headers = linhas[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const valores = [];
      let emAspas = false;
      let valorAtual = '';
      
      for (const char of linhas[i]) {
        if (char === '"') {
          emAspas = !emAspas;
        } else if (char === ',' && !emAspas) {
          valores.push(valorAtual.trim());
          valorAtual = '';
        } else {
          valorAtual += char;
        }
      }
      valores.push(valorAtual.trim());
      
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = valores[idx] || '';
      });
      
      if (obj.nome || headers[0] === '' || Object.values(obj)[0]) {
        // Se não tem campo 'nome', o primeiro valor é o nome
        if (!obj.nome && Object.values(obj)[0]) {
          obj.nome = Object.values(obj)[0];
        }
        dados.push(obj);
      }
    }
    
    return dados;
  };

  const handleArquivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setArquivo(file);
    setErro(null);
    setResultado(null);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const texto = event.target.result;
      const dados = parseCSV(texto);
      setDadosPreview(dados.slice(0, 10)); // Preview das primeiras 10 linhas
    };
    reader.readAsText(file, 'UTF-8');
  };

  const importarDados = async () => {
    if (!arquivo) return;
    
    setImportando(true);
    setErro(null);
    setResultado(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const texto = event.target.result;
        const dados = parseCSV(texto);
        
        let criados = 0;
        let atualizados = 0;
        let erros = 0;
        const detalhesErros = [];
        
        for (const item of dados) {
          try {
            const procedimentoId = item.id;
            const dadosProcedimento = {
              nome: item.nome || item[''] || Object.values(item)[0],
              codigo: item.codigo || '',
              especialidade: item.especialidade || 'Geral',
              duracao_minutos: item.duracao_minutos ? parseInt(item.duracao_minutos) : null,
              valor_repasse_medico: item.valor_repasse_medico ? parseFloat(item.valor_repasse_medico) : null,
              descricao: item.descricao || '',
              status: item.status || 'Ativo'
            };
            
            let procedimento;
            
            // Se tem ID, tenta atualizar. Se não tem, cria novo
            if (procedimentoId && procedimentoId.startsWith('proc_')) {
              try {
                procedimento = await base44.entities.Procedimento.update(procedimentoId, dadosProcedimento);
                atualizados++;
              } catch {
                // Se não encontrou, cria novo
                procedimento = await base44.entities.Procedimento.create(dadosProcedimento);
                criados++;
              }
            } else {
              procedimento = await base44.entities.Procedimento.create(dadosProcedimento);
              criados++;
            }
            
            // Atualizar/criar preços por categoria
            for (const cat of categorias) {
              const nomeCategoria = cat.nome;
              const valorColuna = item[nomeCategoria] || item[nomeCategoria.toLowerCase()];
              
              if (valorColuna) {
                const valorLimpo = valorColuna.replace(/[R$\s]/g, '').replace(',', '.');
                const valor = parseFloat(valorLimpo);
                
                if (!isNaN(valor) && valor >= 0) {
                  // Buscar preço existente
                  const precosExistentes = await base44.entities.TabelaPreco.filter({
                    procedimento_id: procedimento.id,
                    categoria_id: cat.id
                  });
                  
                  if (precosExistentes.length > 0) {
                    // Atualizar
                    await base44.entities.TabelaPreco.update(precosExistentes[0].id, { valor });
                  } else {
                    // Criar novo
                    await base44.entities.TabelaPreco.create({
                      procedimento_id: procedimento.id,
                      categoria_id: cat.id,
                      valor: valor
                    });
                  }
                }
              }
            }
          } catch (err) {
            erros++;
            detalhesErros.push(`${item.nome || 'Item'}: ${err.message}`);
          }
        }
        
        setResultado({
          total: dados.length,
          criados,
          atualizados,
          erros,
          detalhesErros
        });
        setImportando(false);
      };
      reader.readAsText(arquivo, 'UTF-8');
    } catch (err) {
      setErro(err.message);
      setImportando(false);
    }
  };

  const exportarProcedimentosAtuais = async () => {
    setExportando(true);
    try {
      const procedimentos = await base44.entities.Procedimento.list('-created_date', 5000);
      const tabelaPrecos = await base44.entities.TabelaPreco.list('-created_date', 10000);
      
      const headers = ['id', 'nome', 'codigo', 'especialidade', 'duracao_minutos', 'valor_repasse_medico', 'descricao', 'status'];
      categorias.forEach(cat => headers.push(cat.nome));
      
      const linhas = [headers.join(',')];
      
      for (const proc of procedimentos) {
        const linha = [
          proc.id,
          `"${proc.nome || ''}"`,
          proc.codigo || '',
          proc.especialidade || 'Geral',
          proc.duracao_minutos || '',
          proc.valor_repasse_medico || '',
          `"${proc.descricao || ''}"`,
          proc.status || 'Ativo'
        ];
        
        // Adicionar preços de cada categoria
        categorias.forEach(cat => {
          const preco = tabelaPrecos.find(p => p.procedimento_id === proc.id && p.categoria_id === cat.id);
          linha.push(preco ? preco.valor.toString() : '');
        });
        
        linhas.push(linha.join(','));
      }
      
      const csv = linhas.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `procedimentos_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (err) {
      setErro(`Erro ao exportar: ${err.message}`);
    } finally {
      setExportando(false);
    }
  };

  const gerarModeloCSV = () => {
    const headers = ['id', 'nome', 'codigo', 'especialidade', 'duracao_minutos', 'valor_repasse_medico', 'descricao', 'status'];
    
    categorias.forEach(cat => {
      headers.push(cat.nome);
    });
    
    const linhaExemplo = [
      'proc_abc123',
      'HEMOGRAMA COMPLETO',
      'HEM001',
      'Geral',
      '30',
      '0',
      'Exame de sangue completo',
      'Ativo'
    ];
    
    categorias.forEach(() => {
      linhaExemplo.push('25.00');
    });
    
    const csv = [headers.join(','), linhaExemplo.join(',')].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_procedimentos.csv';
    link.click();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Importar Procedimentos</h1>
          <p className="text-gray-500">Importe procedimentos e preços via arquivo CSV</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={gerarModeloCSV}>
            <Download className="w-4 h-4 mr-2" />
            Modelo CSV
          </Button>
          <Button 
            onClick={exportarProcedimentosAtuais}
            disabled={exportando}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {exportando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exportando...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Exportar Procedimentos Atuais
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Categorias de Preço Disponíveis</CardTitle>
          <CardDescription>
            Adicione colunas com estes nomes no seu CSV para definir os preços
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {categorias.map(cat => (
              <Badge key={cat.id} variant="outline" className="text-sm">
                {cat.nome}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload do Arquivo CSV
          </CardTitle>
          <CardDescription>
            <strong>Exportar os procedimentos atuais primeiro</strong> para manter os IDs. Formato: id, nome, codigo, especialidade, duracao_minutos, valor_repasse_medico, descricao, status, [categorias]
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Input
              type="file"
              accept=".csv"
              onChange={handleArquivo}
              className="hidden"
              id="csv-upload"
            />
            <Label htmlFor="csv-upload" className="cursor-pointer">
              <div className="space-y-2">
                <FileText className="w-12 h-12 mx-auto text-gray-400" />
                <p className="text-gray-600">
                  {arquivo ? arquivo.name : 'Clique para selecionar um arquivo CSV'}
                </p>
                <p className="text-sm text-gray-400">
                  Suporta arquivos .csv com codificação UTF-8
                </p>
              </div>
            </Label>
          </div>

          {dadosPreview.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold">Preview dos dados ({dadosPreview.length} primeiras linhas) - {Object.keys(dadosPreview[0]).length} colunas</h3>
              <div className="overflow-x-auto border rounded-lg max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(dadosPreview[0]).map((col, i) => (
                        <TableHead key={i} className="text-xs whitespace-nowrap bg-gray-100 sticky top-0">
                          {col || `Coluna ${i + 1}`}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPreview.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).map((val, j) => (
                          <TableCell key={j} className="text-xs whitespace-nowrap">
                            {val?.toString().substring(0, 40) || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <Button 
                onClick={importarDados} 
                disabled={importando}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {importando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Importar Procedimentos
                  </>
                )}
              </Button>
            </div>
          )}

          {resultado && (
            <Alert className={resultado.erros > 0 ? 'border-yellow-500' : 'border-green-500'}>
              <CheckCircle className="w-4 h-4" />
              <AlertDescription>
                <p><strong>Importação concluída!</strong></p>
                <p>Total: {resultado.total} | Criados: {resultado.criados} | Atualizados: {resultado.atualizados} | Erros: {resultado.erros}</p>
                {resultado.detalhesErros.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-red-600">Ver erros</summary>
                    <ul className="text-sm mt-2">
                      {resultado.detalhesErros.slice(0, 10).map((e, i) => (
                        <li key={i}>• {e}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}

          {erro && (
            <Alert className="border-red-500">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-red-600">{erro}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Formato do CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-100 p-4 rounded-lg overflow-x-auto">
            <code className="text-xs whitespace-pre">
{`id,nome,codigo,especialidade,duracao_minutos,valor_repasse_medico,descricao,status,Particular,Cartão Mais Vida
proc_abc123,HEMOGRAMA COMPLETO,HEM001,Geral,30,0,Exame de sangue,Ativo,25.00,20.00
proc_xyz456,GLICOSE,GLI001,Geral,15,0,Exame de glicose,Ativo,15.00,12.00`}
            </code>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            <strong>Importante:</strong> Inclua a coluna "id" para atualizar procedimentos existentes. Sem o ID, novos procedimentos serão criados. Use o botão "Exportar Procedimentos Atuais" para obter o CSV com os IDs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}