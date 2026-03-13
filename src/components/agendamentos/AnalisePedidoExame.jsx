import { base44 } from "@/api/base44Client";

const normalizeString = (str) => {
  if (!str) return '';
  return String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
};

const compressImage = (file, maxWidth = 1200, quality = 0.8) => new Promise((resolve) => { const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'), img = new Image(); img.onload = () => { const ratio = Math.min(maxWidth / img.width, maxWidth / img.height); canvas.width = img.width * ratio; canvas.height = img.height * ratio; ctx.drawImage(img, 0, 0, canvas.width, canvas.height); canvas.toBlob(resolve, file.type, quality); }; img.src = URL.createObjectURL(file); });
const uploadWithRetry = async (file, maxRetries = 3, delay = 2000) => { for (let attempt = 1; attempt <= maxRetries; attempt++) { try { return await base44.integrations.Core.UploadFile({ file }); } catch (error) { if (attempt === maxRetries) throw error; await new Promise(resolve => setTimeout(resolve, delay)); delay *= 1.5; } } };

const sinonimosExames = {'TRIGLICERIDEOS':['TRIGLICERIDIOS','TG'],'TRIGLICERIDIOS':['TRIGLICERIDEOS','TG'],'GLICEMIA DE JEJUM':['GLICOSE','GLICEMIA'],'GLICOSE':['GLICEMIA','GLICEMIA DE JEJUM'],'AST':['TGO','TRANSAMINASE OXALACETICA'],'TGO':['AST'],'ALT':['TGP','TRANSAMINASE PIRUVICA'],'TGP':['ALT'],'AST E ALT':['TGO E TGP','TGO','TGP','AST','ALT'],'GAMA GT':['GGT','GAMA GLUTAMILTRANSFERASE'],'GGT':['GAMA GT'],'HEMOGRAMA':['HEMOGRAMA COMPLETO'],'HEMOGRAMA COMPLETO':['HEMOGRAMA'],'COLESTEROL TOTAL':['COLESTEROL'],'HDL':['HDL COLESTEROL'],'LDL':['LDL COLESTEROL'],'VLDL':['VLDL COLESTEROL'],'TSH':['HORMONIO TIREOESTIMULANTE'],'T4 LIVRE':['T4L','TIROXINA LIVRE'],'T3':['TRIIODOTIRONINA'],'PSA':['ANTIGENO PROSTATICO','PSA TOTAL'],'UREIA':['UREIA SERICA'],'CREATININA':['CREATININA SERICA'],'ACIDO URICO':['URATO'],'EAS':['URINA TIPO 1','PARCIAL DE URINA','SUMARIO DE URINA'],'VITAMINA D':['25 HIDROXI VITAMINA D'],'VITAMINA B12':['CIANOCOBALAMINA'],'FERRO SERICO':['FERRO'],'FERRITINA':['FERRITINA SERICA'],'PCR':['PROTEINA C REATIVA'],'VHS':['VELOCIDADE HEMOSSEDIMENTACAO']};

const calcularSimilaridade = (textoA, textoB) => {
  if (textoA === textoB) return 1.0;
  if (textoA.includes(textoB) || textoB.includes(textoA)) return 0.9;
  const palavrasA = textoA.split(/[\s,\-\/]+/).filter(p => p.length > 2);
  const palavrasB = textoB.split(/[\s,\-\/]+/).filter(p => p.length > 2);
  if (palavrasA.length === 0 || palavrasB.length === 0) return 0;
  let matches = 0;
  for (const pA of palavrasA) {
    for (const pB of palavrasB) {
      const raizLen = Math.min(5, Math.min(pA.length, pB.length));
      if (pA.substring(0, raizLen) === pB.substring(0, raizLen) && raizLen >= 4) { matches++; break; }
      if (pA === pB) { matches++; break; }
    }
  }
  return matches / Math.max(palavrasA.length, palavrasB.length);
};

export async function analisarPedidoExame({ pedidoExameFile, exames, formData, setUploadProgress, setUploadStatus, toast }) {
  if (!pedidoExameFile) throw new Error("Nenhum arquivo selecionado");
  const maxSize = 15 * 1024 * 1024;
  if (pedidoExameFile.size > maxSize) throw new Error("Arquivo muito grande (máx 15MB)");
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedTypes.includes(pedidoExameFile.type)) throw new Error("Tipo não suportado. Use PDF, JPG ou PNG.");

  let fileToUpload = pedidoExameFile;
  if (pedidoExameFile.type.startsWith('image/')) {
    setUploadStatus('Otimizando imagem...');
    try {
      const compressedFile = await compressImage(pedidoExameFile);
      if (compressedFile && compressedFile.size < pedidoExameFile.size) {
        fileToUpload = new File([compressedFile], pedidoExameFile.name, { type: pedidoExameFile.type });
      }
    } catch (e) { /* usar original */ }
  }

  let progressValue = 0;
  const progressInterval = setInterval(() => { progressValue = Math.min(progressValue + 5, 85); setUploadProgress(progressValue); }, 300);

  let file_url;
  try {
    setUploadStatus('Enviando para o servidor...');
    const uploadResult = await uploadWithRetry(fileToUpload, 3, 2000);
    file_url = uploadResult.file_url;
    clearInterval(progressInterval);
    setUploadProgress(95);
    setUploadStatus('Upload concluído!');
  } catch (uploadError) {
    clearInterval(progressInterval);
    throw new Error(uploadError.message?.includes('timeout') ? "Timeout no servidor. Tente novamente." : "Erro ao fazer upload do arquivo.");
  }

  setUploadStatus('IA analisando documento...');
  setUploadProgress(98);

  const schema = { type: "object", properties: { exames_solicitados: { type: "array", description: "Liste APENAS os nomes dos exames encontrados no documento.", items: { type: "string" } } }, required: ["exames_solicitados"] };
  let resultadoIA;
  try {
    resultadoIA = await base44.integrations.Core.ExtractDataFromUploadedFile({ file_url, json_schema: schema });
  } catch (e) {
    throw new Error("Erro ao analisar o documento com IA.");
  }

  setUploadProgress(100);
  setUploadStatus('Análise concluída!');

  if (resultadoIA.status !== 'success' || !resultadoIA.output?.exames_solicitados) throw new Error(resultadoIA.details || "A IA não conseguiu extrair os exames.");

  const nomesExamesIA = resultadoIA.output.exames_solicitados;
  const examesEncontradosIds = [];
  const examesNaoEncontrados = [];
  const examnesEncontradosNomes = [];

  const examesNormalizados = exames.map(e => ({ id: e.id, nome: e.nome, nomeNorm: normalizeString(e.nome), palavras: normalizeString(e.nome).split(/[\s,\-\/]+/).filter(p => p.length > 2) }));

  for (const nomeIA of nomesExamesIA) {
    const nomeNorm = normalizeString(nomeIA);
    let idExame = null, melhorScore = 0, melhorNome = '';

    const matchExato = examesNormalizados.find(e => e.nomeNorm === nomeNorm);
    if (matchExato) { idExame = matchExato.id; melhorNome = matchExato.nome; melhorScore = 1.0; }

    if (!idExame) { for (const e of examesNormalizados) { if (e.nomeNorm.includes(nomeNorm) || nomeNorm.includes(e.nomeNorm)) { idExame = e.id; melhorNome = e.nome; melhorScore = 0.9; break; } } }

    if (!idExame) {
      const sinonimos = sinonimosExames[nomeNorm] || [];
      const palavrasIA = nomeNorm.split(/[\s,\-\/]+/).filter(p => p.length > 1);
      for (const palavra of palavrasIA) { const sinPalavra = sinonimosExames[palavra]; if (sinPalavra) sinonimos.push(...sinPalavra); }
      for (const sin of sinonimos) { const sinNorm = normalizeString(sin); for (const e of examesNormalizados) { if (e.nomeNorm === sinNorm || e.nomeNorm.includes(sinNorm) || sinNorm.includes(e.nomeNorm)) { if (!idExame) { idExame = e.id; melhorNome = e.nome; melhorScore = 0.85; } } } if (idExame) break; }
    }

    if (!idExame) { for (const e of examesNormalizados) { const score = calcularSimilaridade(nomeNorm, e.nomeNorm); if (score > melhorScore && score >= 0.5) { melhorScore = score; idExame = e.id; melhorNome = e.nome; } } }
    if (!idExame) { const palavrasIA = nomeNorm.split(/[\s,\-\/]+/).filter(p => p.length >= 5); for (const palavra of palavrasIA) { for (const e of examesNormalizados) { if (e.palavras.some(pe => pe.includes(palavra) || palavra.includes(pe))) { idExame = e.id; melhorNome = e.nome; melhorScore = 0.6; break; } } if (idExame) break; } }

    if (idExame && !formData.exames_ids.includes(idExame) && !examesEncontradosIds.includes(idExame)) {
      examesEncontradosIds.push(idExame);
      examnesEncontradosNomes.push(melhorNome);
    } else if (!idExame) {
      examesNaoEncontrados.push(nomeIA);
    }
  }

  return { examesEncontradosIds, examnesEncontradosNomes, examesNaoEncontrados };
}