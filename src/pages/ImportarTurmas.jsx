import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Upload, FileSpreadsheet, Loader2, CheckCircle, XCircle, 
  Users, AlertCircle, Download, Trash2
} from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function ImportarTurmas() {
  const [loading, setLoading] = useState(false);
  const [dadosPreview, setDadosPreview] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [turmas, setTurmas] = useState([]);
  const [medicos, setMedicos] = useState([]);
  const [textoColado, setTextoColado] = useState('');
  const [mapeamento, setMapeamento] = useState({
    turma: '',
    modalidade: '',
    aluno_nome: '',
    aluno_cpf: '',
    aluno_telefone: '',
    professor: '',
    horario: '',
    dias: ''
  });
  const [colunasDetectadas, setColunasDetectadas] = useState([]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      const [turmasList, medicosList] = await Promise.all([
        base44.entities.Turma.list(),
        base44.entities.Medico.filter({ status: 'Ativo' })
      ]);
      setTurmas(turmasList);
      setMedicos(medicosList);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  };

  const processarTexto = () => {
    if (!textoColado.trim()) return;

    const linhas = textoColado.trim().split('\n');
    if (linhas.length < 2) {
      setResultado({ tipo: 'erro', mensagem: 'O texto deve ter pelo menos uma linha de cabeçalho e uma de dados.' });
      return;
    }

    // Detectar separador (tab, vírgula ou ponto-e-vírgula)
    const primeiraLinha = linhas[0];
    let separador = '\t';
    if (primeiraLinha.includes(';')) separador = ';';
    else if (primeiraLinha.includes(',') && !primeiraLinha.includes('\t')) separador = ',';

    const colunas = primeiraLinha.split(separador).map(c => c.trim());
    setColunasDetectadas(colunas);

    // Processar dados
    const dados = [];
    for (let i = 1; i < linhas.length; i++) {
      const valores = linhas[i].split(separador);
      if (valores.length >= colunas.length) {
        const obj = {};
        colunas.forEach((col, idx) => {
          obj[col] = valores[idx]?.trim() || '';
        });
        dados.push(obj);
      }
    }

    setDadosPreview(dados);
    
    // Tentar auto-mapear colunas
    const novoMapeamento = { ...mapeamento };
    colunas.forEach(col => {
      const colLower = col.toLowerCase();
      if (colLower.includes('turma') || colLower.includes('grupo')) novoMapeamento.turma = col;
      if (colLower.includes('modalidade') || colLower.includes('tipo')) novoMapeamento.modalidade = col;
      if (colLower.includes('nome') && !colLower.includes('turma')) novoMapeamento.aluno_nome = col;
      if (colLower.includes('cpf')) novoMapeamento.aluno_cpf = col;
      if (colLower.includes('telefone') || colLower.includes('celular') || colLower.includes('fone')) novoMapeamento.aluno_telefone = col;
      if (colLower.includes('professor') || colLower.includes('responsável') || colLower.includes('instrutor')) novoMapeamento.professor = col;
      if (colLower.includes('horário') || colLower.includes('horario') || colLower.includes('hora')) novoMapeamento.horario = col;
      if (colLower.includes('dia') || colLower.includes('semana')) novoMapeamento.dias = col;
    });
    setMapeamento(novoMapeamento);

    setResultado({ tipo: 'sucesso', mensagem: `${dados.length} linhas detectadas` });
  };

  const importarDados = async () => {
    if (!mapeamento.turma || !mapeamento.aluno_nome) {
      setResultado({ tipo: 'erro', mensagem: 'Mapeie pelo menos as colunas de Turma e Nome do Aluno.' });
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const turmasMap = {};
      let turmasCriadas = 0;
      let alunosCriados = 0;
      let alunosVinculados = 0;
      let erros = [];

      // Agrupar por turma
      const turmasAgrupadas = {};
      dadosPreview.forEach(linha => {
        const nomeTurma = linha[mapeamento.turma];
        if (!nomeTurma) return;
        
        if (!turmasAgrupadas[nomeTurma]) {
          turmasAgrupadas[nomeTurma] = {
            nome: nomeTurma,
            modalidade: linha[mapeamento.modalidade] || 'Outro',
            professor: linha[mapeamento.professor] || '',
            horario: linha[mapeamento.horario] || '',
            dias: linha[mapeamento.dias] || '',
            alunos: []
          };
        }
        
        turmasAgrupadas[nomeTurma].alunos.push({
          nome: linha[mapeamento.aluno_nome],
          cpf: linha[mapeamento.aluno_cpf] || '',
          telefone: linha[mapeamento.aluno_telefone] || ''
        });
      });

      // Processar cada turma
      for (const [nomeTurma, dadosTurma] of Object.entries(turmasAgrupadas)) {
        try {
          // Verificar se turma já existe
          let turma = turmas.find(t => t.nome.toLowerCase() === nomeTurma.toLowerCase());
          
          if (!turma) {
            // Detectar modalidade
            let modalidade = 'Outro';
            const nomeLower = nomeTurma.toLowerCase();
            if (nomeLower.includes('hidro')) modalidade = 'Hidroginástica';
            else if (nomeLower.includes('pilates')) modalidade = 'Pilates';
            else if (nomeLower.includes('natação') || nomeLower.includes('natacao')) modalidade = 'Natação';
            
            // Encontrar professor
            let medicoId = medicos[0]?.id;
            if (dadosTurma.professor) {
              const prof = medicos.find(m => 
                m.nome.toLowerCase().includes(dadosTurma.professor.toLowerCase())
              );
              if (prof) medicoId = prof.id;
            }

            // Extrair horário
            let horarioInicio = '08:00';
            let horarioFim = '09:00';
            if (dadosTurma.horario) {
              const match = dadosTurma.horario.match(/(\d{1,2}):?(\d{2})?/);
              if (match) {
                horarioInicio = `${match[1].padStart(2, '0')}:${match[2] || '00'}`;
                const horaFim = parseInt(match[1]) + 1;
                horarioFim = `${String(horaFim).padStart(2, '0')}:${match[2] || '00'}`;
              }
            }

            // Extrair dias da semana
            let diasSemana = [1, 3, 5]; // Segunda, Quarta, Sexta por padrão
            if (dadosTurma.dias) {
              const diasTexto = dadosTurma.dias.toLowerCase();
              diasSemana = [];
              if (diasTexto.includes('dom')) diasSemana.push(0);
              if (diasTexto.includes('seg')) diasSemana.push(1);
              if (diasTexto.includes('ter')) diasSemana.push(2);
              if (diasTexto.includes('qua')) diasSemana.push(3);
              if (diasTexto.includes('qui')) diasSemana.push(4);
              if (diasTexto.includes('sex')) diasSemana.push(5);
              if (diasTexto.includes('sáb') || diasTexto.includes('sab')) diasSemana.push(6);
              if (diasSemana.length === 0) diasSemana = [1, 3, 5];
            }

            // Criar turma
            turma = await base44.entities.Turma.create({
              nome: nomeTurma,
              modalidade,
              medico_id: medicoId,
              horario_inicio: horarioInicio,
              horario_fim: horarioFim,
              dias_semana: diasSemana,
              capacidade_maxima: Math.max(dadosTurma.alunos.length, 10),
              status: 'Ativa'
            });
            turmasCriadas++;
          }

          turmasMap[nomeTurma] = turma;

          // Processar alunos da turma
          for (const alunoData of dadosTurma.alunos) {
            if (!alunoData.nome) continue;
            
            try {
              // Buscar ou criar paciente
              let paciente = null;
              
              if (alunoData.cpf) {
                const cpfLimpo = alunoData.cpf.replace(/\D/g, '');
                const pacientes = await base44.entities.Paciente.filter({ cpf: cpfLimpo });
                if (pacientes.length > 0) paciente = pacientes[0];
              }
              
              if (!paciente && alunoData.telefone) {
                const pacientes = await base44.entities.Paciente.filter({ telefone: alunoData.telefone });
                if (pacientes.length > 0) paciente = pacientes[0];
              }
              
              if (!paciente) {
                // Criar paciente
                paciente = await base44.entities.Paciente.create({
                  nome: alunoData.nome,
                  cpf: alunoData.cpf?.replace(/\D/g, '') || 'NÃO INFORMADO',
                  telefone: alunoData.telefone || 'NÃO INFORMADO',
                  observacoes: `Importado da turma ${nomeTurma}`
                });
                alunosCriados++;
              }

              // Verificar se já está na turma
              const vinculosExistentes = await base44.entities.AlunoTurma.filter({
                turma_id: turma.id,
                paciente_id: paciente.id
              });

              if (vinculosExistentes.length === 0) {
                // Vincular à turma
                await base44.entities.AlunoTurma.create({
                  turma_id: turma.id,
                  paciente_id: paciente.id,
                  data_inicio: new Date().toISOString().split('T')[0],
                  status: 'Ativo'
                });
                alunosVinculados++;
              }
            } catch (alunoError) {
              erros.push(`Erro ao processar aluno ${alunoData.nome}: ${alunoError.message}`);
            }
          }
        } catch (turmaError) {
          erros.push(`Erro ao processar turma ${nomeTurma}: ${turmaError.message}`);
        }
      }

      setResultado({
        tipo: 'sucesso',
        mensagem: `Importação concluída!\n✅ ${turmasCriadas} turmas criadas\n✅ ${alunosCriados} alunos criados\n✅ ${alunosVinculados} vínculos criados`,
        erros: erros.length > 0 ? erros : null
      });

      await carregarDados();
    } catch (error) {
      setResultado({ tipo: 'erro', mensagem: error.message });
    } finally {
      setLoading(false);
    }
  };

  const limparDados = () => {
    setTextoColado('');
    setDadosPreview([]);
    setColunasDetectadas([]);
    setResultado(null);
    setMapeamento({
      turma: '',
      modalidade: '',
      aluno_nome: '',
      aluno_cpf: '',
      aluno_telefone: '',
      professor: '',
      horario: '',
      dias: ''
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Importar Turmas e Alunos</h1>
            <p className="text-gray-500">Cole dados do Excel ou planilha para importar turmas com seus alunos</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              Colar Dados da Planilha
            </CardTitle>
            <CardDescription>
              Cole os dados copiados do Excel, Google Sheets ou outra planilha. 
              A primeira linha deve conter os cabeçalhos das colunas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Cole aqui os dados da planilha (Ctrl+V)...&#10;&#10;Exemplo:&#10;Turma	Nome	CPF	Telefone&#10;Hidroginástica Manhã	João Silva	123.456.789-00	(51) 99999-9999&#10;Hidroginástica Manhã	Maria Santos	987.654.321-00	(51) 88888-8888"
              value={textoColado}
              onChange={(e) => setTextoColado(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={processarTexto} disabled={!textoColado.trim()}>
                <Upload className="w-4 h-4 mr-2" />
                Processar Dados
              </Button>
              <Button variant="outline" onClick={limparDados}>
                <Trash2 className="w-4 h-4 mr-2" />
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        {colunasDetectadas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Mapeamento de Colunas</CardTitle>
              <CardDescription>Associe as colunas detectadas aos campos do sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Turma/Grupo *</Label>
                  <Select value={mapeamento.turma} onValueChange={(v) => setMapeamento({...mapeamento, turma: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nome do Aluno *</Label>
                  <Select value={mapeamento.aluno_nome} onValueChange={(v) => setMapeamento({...mapeamento, aluno_nome: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>CPF</Label>
                  <Select value={mapeamento.aluno_cpf} onValueChange={(v) => setMapeamento({...mapeamento, aluno_cpf: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Select value={mapeamento.aluno_telefone} onValueChange={(v) => setMapeamento({...mapeamento, aluno_telefone: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Modalidade</Label>
                  <Select value={mapeamento.modalidade} onValueChange={(v) => setMapeamento({...mapeamento, modalidade: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Professor</Label>
                  <Select value={mapeamento.professor} onValueChange={(v) => setMapeamento({...mapeamento, professor: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Horário</Label>
                  <Select value={mapeamento.horario} onValueChange={(v) => setMapeamento({...mapeamento, horario: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dias da Semana</Label>
                  <Select value={mapeamento.dias} onValueChange={(v) => setMapeamento({...mapeamento, dias: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>Nenhum</SelectItem>
                      {colunasDetectadas.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {dadosPreview.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Preview dos Dados ({dadosPreview.length} linhas)</span>
                <Button onClick={importarDados} disabled={loading || !mapeamento.turma || !mapeamento.aluno_nome}>
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Importar Dados
                    </>
                  )}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {colunasDetectadas.map(col => (
                        <TableHead key={col} className="whitespace-nowrap">
                          {col}
                          {col === mapeamento.turma && <Badge className="ml-1 bg-blue-100 text-blue-700">Turma</Badge>}
                          {col === mapeamento.aluno_nome && <Badge className="ml-1 bg-green-100 text-green-700">Aluno</Badge>}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosPreview.slice(0, 20).map((linha, idx) => (
                      <TableRow key={idx}>
                        {colunasDetectadas.map(col => (
                          <TableCell key={col} className="whitespace-nowrap">
                            {linha[col] || '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {dadosPreview.length > 20 && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  Mostrando 20 de {dadosPreview.length} linhas
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {resultado && (
          <Alert className={resultado.tipo === 'erro' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
            {resultado.tipo === 'erro' ? (
              <XCircle className="w-4 h-4 text-red-600" />
            ) : (
              <CheckCircle className="w-4 h-4 text-green-600" />
            )}
            <AlertDescription className={resultado.tipo === 'erro' ? 'text-red-700' : 'text-green-700'}>
              <pre className="whitespace-pre-wrap">{resultado.mensagem}</pre>
              {resultado.erros && (
                <div className="mt-2 text-sm">
                  <strong>Erros:</strong>
                  <ul className="list-disc ml-4">
                    {resultado.erros.slice(0, 5).map((erro, idx) => (
                      <li key={idx}>{erro}</li>
                    ))}
                  </ul>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Turmas Existentes ({turmas.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {turmas.length === 0 ? (
              <p className="text-gray-500 text-center py-4">Nenhuma turma cadastrada ainda</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {turmas.map(turma => (
                  <div key={turma.id} className="p-3 border rounded-lg">
                    <p className="font-medium">{turma.nome}</p>
                    <p className="text-sm text-gray-500">{turma.modalidade}</p>
                    <p className="text-xs text-gray-400">{turma.horario_inicio} - {turma.horario_fim}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}