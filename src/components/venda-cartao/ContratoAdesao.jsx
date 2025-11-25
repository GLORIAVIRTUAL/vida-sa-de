
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function ContratoAdesao({ venda, onClose }) {
  const handleImprimir = () => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Contrato de Adesão - Cartão Mais Vida</title>
        <style>
          @page { 
            size: A4; 
            margin: 2cm; 
          }
          body { 
            font-family: Arial, sans-serif; 
            font-size: 11pt;
            line-height: 1.4;
            color: #000;
            max-width: 21cm;
            margin: 0 auto;
            padding: 20px;
          }
          .header { 
            text-align: center;
            margin-bottom: 20px;
            border-bottom: 2px solid #2c5f5f;
            padding-bottom: 15px;
          }
          .logo { 
            width: 120px;
            margin-bottom: 10px;
          }
          .title {
            font-size: 16pt;
            font-weight: bold;
            color: #2c5f5f;
            margin: 10px 0;
          }
          .subtitle {
            font-size: 12pt;
            margin: 5px 0;
          }
          .checkbox-section {
            text-align: right;
            margin: 15px 0;
            font-weight: bold;
          }
          .info-box {
            background: #f0f9ff;
            border: 2px solid #2c5f5f;
            padding: 15px;
            margin: 20px 0;
            border-radius: 5px;
          }
          .info-box h3 {
            color: #2c5f5f;
            margin: 0 0 10px 0;
            font-size: 12pt;
          }
          .info-line {
            margin: 5px 0;
            line-height: 1.6;
          }
          .info-line strong {
            color: #2c5f5f;
          }
          .warning {
            background: #fff3cd;
            border: 2px solid #ffc107;
            padding: 10px;
            margin: 15px 0;
            border-radius: 5px;
            font-weight: bold;
            text-align: center;
          }
          .article {
            margin: 15px 0;
            text-align: justify;
          }
          .article-title {
            font-weight: bold;
            margin-top: 15px;
          }
          .paragraph {
            margin-left: 20px;
            margin-top: 8px;
          }
          .signature-section {
            margin-top: 50px;
            page-break-inside: avoid;
          }
          .signature-line {
            border-top: 2px solid #000;
            width: 100%;
            margin: 60px 0 10px 0;
          }
          .signature-info {
            margin-top: 15px;
          }
          .field-line {
            border-bottom: 1px solid #000;
            min-height: 25px;
            margin-top: 5px;
            padding-left: 5px;
          }
          .dependentes-list {
            background: #f8f9fa;
            padding: 10px;
            margin: 10px 0;
            border-left: 4px solid #2c5f5f;
          }
          .dependente-item {
            padding: 5px 0;
            border-bottom: 1px dotted #ccc;
          }
          @media print {
            body { 
              margin: 0;
              padding: 15px;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <!-- Cabeçalho -->
        <div class="header">
          <img 
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png" 
            alt="Cartão Mais Vida" 
            class="logo"
          />
          <div class="title">CONTRATO DE ADESÃO</div>
          <div class="subtitle">CARTÃO MAIS VIDA</div>
          <div style="font-size: 10pt; margin-top: 5px;">
            CNPJ: 41.774.511/0001-48<br>
            Clínica Centro Vida Saúde
          </div>
        </div>

        <!-- Tipo de Contrato -->
        <div class="checkbox-section">
          ${venda.numero_venda?.includes('REN') ? '☐ Cartão Novo ☑ Renovação' : '☑ Cartão Novo ☐ Renovação'}
        </div>

        <!-- Dados do Contrato -->
        <div class="info-box">
          <h3>Dados do Contrato:</h3>
          <div class="info-line"><strong>Número:</strong> ${venda.numero_venda || 'N/A'}</div>
          <div class="info-line"><strong>Data de Adesão:</strong> ${format(new Date(venda.data_venda), "dd/MM/yyyy")}</div>
          <div class="info-line"><strong>Validade:</strong> ${format(new Date(venda.validade_cartao), "dd/MM/yyyy")}</div>
          <div class="info-line"><strong>Plano:</strong> ${venda.tipo_plano}</div>
          <div class="info-line"><strong>Valor Total:</strong> R$ ${venda.valor_total.toFixed(2).replace('.', ',')}</div>
          <div class="info-line"><strong>Pagamento:</strong> ${venda.forma_pagamento}${venda.numero_parcelas > 1 ? ` - ${venda.numero_parcelas}x de R$ ${venda.valor_parcela.toFixed(2).replace('.', ',')}` : ''}</div>
        </div>

        <!-- Dados do Titular -->
        <div class="info-box">
          <h3>Titular:</h3>
          <div class="info-line"><strong>Nome:</strong> ${venda.titular.nome}</div>
          <div class="info-line"><strong>CPF:</strong> ${venda.titular.cpf}</div>
          <div class="info-line"><strong>Data de Nascimento:</strong> ${venda.titular.data_nascimento ? format(new Date(venda.titular.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}</div>
          <div class="info-line"><strong>Telefone:</strong> ${venda.titular.telefone || 'Não informado'}</div>
          ${venda.titular.endereco && venda.titular.endereco.logradouro ? `
            <div class="info-line">
              <strong>Endereço:</strong> ${venda.titular.endereco.logradouro}, ${venda.titular.endereco.numero || 'S/N'}${venda.titular.endereco.complemento ? ` - ${venda.titular.endereco.complemento}` : ''}, ${venda.titular.endereco.bairro} - ${venda.titular.endereco.cidade}/${venda.titular.endereco.estado} - CEP: ${venda.titular.endereco.cep || 'Não informado'}
            </div>
          ` : ''}
        </div>

        <!-- Dependentes (se houver) -->
        ${venda.dependentes && venda.dependentes.length > 0 ? `
          <div class="info-box">
            <h3>Dependentes (${venda.dependentes.length}):</h3>
            <div class="dependentes-list">
              ${venda.dependentes.map((dep, index) => `
                <div class="dependente-item">
                  <strong>${index + 1}. Nome:</strong> ${dep.nome}<br>
                  <strong>CPF:</strong> ${dep.cpf}<br>
                  <strong>Nascimento:</strong> ${dep.data_nascimento ? format(new Date(dep.data_nascimento), 'dd/MM/yyyy') : 'Não informado'}
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Aviso Importante -->
        <div class="warning">
          ⚠️ IMPORTANTE: Cartão de desconto não é plano de saúde, não garante e não se responsabiliza pelos serviços oferecidos 
          e pelo pagamento das despesas, nem assegura desconto em todos os serviços garantidos por plano de saúde. Tudo que o 
          cliente usar ou comprar será por ele pago ao prestador, assegurando-se apenas os preços e descontos que constam na 
          relação de empresas e serviços conveniados divulgados.
        </div>

        <!-- Artigos do Contrato -->
        <div class="article">
          <div class="article-title">Art. 1º - OBJETO DO CONTRATO</div>
          <p>São oferecidos ao ADERENTE, através do presente Contrato de Adesão, acesso a convênios com empresas de prestação de 
          serviços e oferta de produtos em diversos segmentos, incluindo nas áreas de saúde (consultas médicas, exames clínicos e 
          tratamentos odontológicos) através da Clínica Centro Vida Saúde com custos reduzidos disponibilizados pelo Cartão MAIS VIDA, 
          CNPJ 41.774.511/0001-48.</p>
          
          <div class="paragraph">
            <strong>§1º:</strong> O Cartão MAIS VIDA não se responsabiliza pela qualidade técnica e profissional dos serviços prestados 
            pelas empresas conveniadas, bem como pelos valores pagos a estes.
          </div>
          
          <div class="paragraph">
            <strong>§2º:</strong> O ADERENTE declara ter recebido, no momento da celebração do presente Contrato de Adesão, informação 
            sobre todas as empresas conveniadas até o presente momento com o Cartão MAIS VIDA especificadas no caput do Art. 1º., que 
            poderão ser acessadas a qualquer momento pela rede social e site do Filiado do Cartão MAIS VIDA, na página de benefícios. 
            Atualizações referentes aos parceiros serão comunicadas por estes mesmos canais e pelo envio de comunicação eletrônica ao 
            ADERENTE que tiver fornecido ao Cartão MAIS VIDA o seu endereço eletrônico no momento da assinatura do contrato.
          </div>
          
          <div class="paragraph">
            <strong>§3º:</strong> Terá direito ao acesso às empresas conveniadas o ADERENTE, somente o titular, caso seus dependentes 
            queiram ter acesso às empresas conveniadas, cada dependente terá um custo adicional de R$10,00 (dez reais) mensais, todos 
            devidamente inscritos junto ao Cartão MAIS VIDA. As consultas e exames na Clínica Centro Vida Saúde, somente mediante 
            apresentação de documento com foto.
          </div>
        </div>

        <div class="article">
          <div class="article-title">Art. 2º - OBRIGAÇÕES FINANCEIRAS</div>
          <p>O ADERENTE obriga-se pagar ao Cartão MAIS VIDA, uma anuidade do plano escolhido, que pode ser parcelada conforme as 
          propostas oferecidas na data do contrato.</p>
          
          <div class="paragraph">
            <strong>§1º:</strong> A troca de dependentes só poderá ser feita em caso de óbito mediante apresentação da certidão. Não 
            é permitido adicionar dependente além do que contempla o plano. Caso o plano escolhido tenha dependente(s), será cobrada 
            uma taxa de emissão do cartão de identificação no valor de R$5,00 (cinco reais) por dependente no ato da adesão do cartão, 
            salientando que o custo do cartão do titular já está incluído no valor da anuidade.
          </div>
          
          <div class="paragraph">
            <strong>§2º:</strong> O reajuste anual da anuidade e das taxas de emissão, ocorrerá em janeiro de cada ano, sendo informado 
            aos ADERENTES por meio de mídias sociais oficiais do Cartão MAIS VIDA, bem como através do envio de comunicação eletrônica 
            para os pacientes que tiverem fornecido ao Cartão MAIS VIDA seu endereço eletrônico para correspondências no momento do 
            preenchimento da ficha de adesão.
          </div>
          
          <div class="paragraph">
            <strong>§3º:</strong> Somente o ADERENTE que realizar o pagamento da 1ª mensalidade e que esteja rigorosamente em dia com 
            as suas obrigações financeiras junto ao Cartão MAIS VIDA, terá direito aos serviços e vantagens por ele intermediados.
          </div>
          
          <div class="paragraph">
            <strong>§4º:</strong> Inclui-se como vantagem ao titular ADERENTE rigorosamente adimplente, maior de 18 anos e com menos 
            de 61 anos no ato da adesão, que tenha quitado o mínimo de 4 (quatro) mensalidades, o Auxílio Funeral, que tem por objeto 
            a prestação de serviço funerário, contratação e escolha das empresas funerárias habilitadas serão exclusivamente por conta 
            da empresa Zelo Empresas. Ficam excluídos das obrigações do CARTÃO MAIS VIDA, arcar com custos ou executar serviços de 
            exumação, embalsamento, traslados marítimos, despachantes ou qualquer outro imprevisto. Qualquer alteração ou modificação 
            do funeral e correlatos contratados, isto é, sendo superior ao funeral contratado, o responsável ou optante pela escolha 
            deverá arcar com a diferença de valores, pagando a empresa prestadora do serviço a diferença do valor/preço. A contratação 
            de serviços funerários diretamente com a prestadora de serviços funerários, não caberá ao Cartão Mais Vida qualquer 
            responsabilidade e/ou obrigação pelo pagamento dos valores cobrados, assim tornando isento o Cartão Mais Vida de suas 
            obrigações contratuais. Não sendo devida qualquer restituição, ressarcimento, compensação e/ou auxílio financeiro integral 
            e/ou parcial. Obriga-se o ADERENTE a comunicar através dos telefones 51 36615991 ou 51 985505991 o falecimento de dependentes 
            que estejam sob cobertura do plano. O CARTÃO MAIS VIDA não se responsabiliza por qualquer valor para realização e/ou execução 
            dos serviços funerários sem que tenha sido comunicado da ocorrência do falecimento. O início da vigência do auxílio funeral 
            ocorrerá sempre 120 (cento e vinte) dias após assinatura do contrato. Será cancelado o auxílio funeral quando solicitado 
            pelo ADERENTE, 30 (trinta) dias antes do término do contrato ou quando o ADERENTE estiver inadimplente.
          </div>
          
          <div class="paragraph">
            Ao celebrar este Contrato, o ADERENTE fornece ao Cartão MAIS VIDA o seu nome, CPF, endereço, telefone e de seus dependentes 
            e concorda expressamente, nos termos da Lei Geral de Proteção de Dados, no tratamento destes dados para informação aos parceiros 
            do Cartão MAIS VIDA e concessão dos descontos contratados, para realização de cobranças, e para envio de publicidades com 
            descontos de interesse do ADERENTE.
          </div>
          
          <div class="paragraph">
            <strong>§5º:</strong> Fica ressaltado o direito de cobrança extrajudicial e judicial, pelo Cartão MAIS VIDA, da(s) 
            mensalidade(s) não quitada(s) e em atraso pelo ADERENTE, acrescido de multa de 2% e juros de moratórios de 1% a.m.
          </div>
        </div>

        <div class="article">
          <div class="article-title">Art. 3º - VIGÊNCIA E RESCISÃO</div>
          <p>O presente contrato tem validade pelo prazo de 12 (doze) meses, contados do pagamento da 1ª mensalidade, e só será renovado, 
          por ciclos de iguais períodos, caso haja manifestação por uma das partes.</p>
          
          <div class="paragraph">
            <strong>§1º:</strong> O ADERENTE poderá rescindir o presente contrato sem quaisquer ônus no prazo de 07 (sete) dias contados 
            da data de sua assinatura, conforme dispõe o artigo 49˚ da Lei 8.078/90.
          </div>
          
          <div class="paragraph">
            <strong>§2º:</strong> No caso de desistência após o prazo de 7 (sete) dias será perdido 100% do valor investido.
          </div>
          
          <div class="paragraph">
            <strong>§3º:</strong> A rescisão do presente instrumento só será efetivada, em qualquer hipótese, mediante o pagamento de 
            todas as mensalidades em atraso.
          </div>
          
          <div class="paragraph">
            <strong>§4º:</strong> É de inteira responsabilidade do ADERENTE, manter o Cartão MAIS VIDA informando sobre quaisquer 
            alterações no cadastro e na forma de cobrança, reservando-se no direito de regresso, em caso de fraude.
          </div>
        </div>

        <div class="article">
          <div class="article-title">Art. 4º - CARÊNCIA</div>
          <p>Carência de 30 (trinta) dias para desconto com os parceiros.</p>
        </div>

        <div class="article">
          <div class="article-title">Art. 5º - IMPORTANTE</div>
          <p>A CONTRATADA destaca que este cartão de desconto e benefícios não é plano de saúde, deste modo, não cobrirá pronto 
          atendimento, visto que não há atendimento emergencial disponível 24 horas.</p>
        </div>

        <div class="article">
          <div class="article-title">Art. 6º - DECLARAÇÃO DO ADERENTE</div>
          <p>O ADERENTE se declara esclarecido e de acordo com as cláusulas do presente contrato, bem como está ciente de que o cartão 
          de desconto não é plano de saúde, não garante e não se responsabiliza pelos serviços oferecidos, bem como pelo pagamento das 
          despesas, nem assegura desconto em todos os serviços obrigatoriamente garantidos por plano de saúde. Tudo o que o cliente 
          usar ou comprar será por ele diretamente pago ao prestador, assegurando-se apenas os preços e descontos que constam na relação 
          de empresas e serviços conveniados divulgados pelo Cartão MAIS VIDA.</p>
        </div>

        <div class="article">
          <div class="article-title">Art. 7º - CÓDIGO DE DEFESA DO CONSUMIDOR</div>
          <p>O presente contrato deverá ser devidamente interpretado de acordo com as regras previstas no Código de Defesa do Consumidor.</p>
          <div class="paragraph">
            <strong>Parágrafo único:</strong> Nesta ocasião o ADERENTE recebe 01 (uma) via do contrato de adesão firmado entre as partes. 
            O fato de autorizar o pagamento da assinatura anual parcelada ou não, caracteriza de forma irrevogável e irretratável o aceite 
            dos termos e condições deste documento, ou seja, o aderente leu e concordou com todas as regras.
          </div>
        </div>

        <div class="article">
          <div class="article-title">Art. 8º - FORO</div>
          <p>As partes elegem o Foro da Comarca de Tramandaí, como renúncia expressa de qualquer outro, por mais privilegiados que seja 
          ou venha ser.</p>
        </div>

        <div class="warning" style="margin-top: 20px;">
          ⚠️ SEMPRE SERÁ COBRADA UMA NOVA CONSULTA, NÃO EXISTE RECONSULTAS.
        </div>

        <!-- Seção de Assinatura -->
        <div class="signature-section">
          <p style="text-align: center; margin: 30px 0;">
            <strong>
              ${venda.titular.endereco?.cidade || 'Tramandaí'}, ${format(new Date(venda.data_venda), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </strong>
          </p>

          <div class="signature-line"></div>
          <p style="text-align: center; margin-top: 10px;">
            <strong>ASSINATURA DO ADERENTE</strong>
          </p>

          <div class="signature-info">
            <strong>NOME:</strong>
            <div class="field-line">${venda.titular.nome}</div>
          </div>

          <div class="signature-info">
            <strong>CPF:</strong>
            <div class="field-line">${venda.titular.cpf}</div>
          </div>
        </div>

        <div style="text-align: center; margin-top: 40px; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 15px;">
          <p><strong>Cartão Mais Vida - CNPJ: 41.774.511/0001-48</strong></p>
          <p>Clínica Centro Vida Saúde | Telefones: (51) 3661-5991 / (51) 98550-5991</p>
          <p>Este contrato foi gerado automaticamente em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}</p>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="flex items-center gap-2">
              <img 
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png"
                alt="Cartão Mais Vida"
                className="h-10"
              />
              Contrato de Adesão
            </DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleImprimir} className="bg-teal-600 hover:bg-teal-700">
                <Printer className="w-4 h-4 mr-2" />
                Imprimir Contrato
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="text-sm text-gray-700 leading-relaxed space-y-4 p-4">
          <div className="text-center border-b-2 border-teal-600 pb-4 mb-4">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68b9fe84de5d54897629e61a/9a845de7d_Untitleddesign30.png"
              alt="Cartão Mais Vida"
              className="h-16 mx-auto mb-2"
            />
            <h2 className="text-xl font-bold text-teal-700">CONTRATO DE ADESÃO</h2>
            <p className="text-sm">CNPJ: 41.774.511/0001-48 - Clínica Centro Vida Saúde</p>
          </div>

          <div className="bg-blue-50 p-4 rounded border-2 border-blue-200">
            <h3 className="font-bold mb-2">Dados do Contrato:</h3>
            <p><strong>Número:</strong> {venda.numero_venda}</p>
            <p><strong>Data de Adesão:</strong> {format(new Date(venda.data_venda), 'dd/MM/yyyy')}</p>
            <p><strong>Validade:</strong> {format(new Date(venda.validade_cartao), 'dd/MM/yyyy')}</p>
            <p><strong>Plano:</strong> {venda.tipo_plano}</p>
            <p><strong>Valor Total:</strong> R$ {venda.valor_total.toFixed(2).replace('.', ',')}</p>
            <p><strong>Pagamento:</strong> {venda.forma_pagamento}</p>
          </div>

          <div className="bg-teal-50 p-4 rounded border-2 border-teal-200">
            <h3 className="font-bold mb-2">Titular:</h3>
            <p><strong>Nome:</strong> {venda.titular.nome}</p>
            <p><strong>CPF:</strong> {venda.titular.cpf}</p>
            <p><strong>Telefone:</strong> {venda.titular.telefone}</p>
          </div>

          {venda.dependentes && venda.dependentes.length > 0 && (
            <div className="bg-purple-50 p-4 rounded border-2 border-purple-200">
              <h3 className="font-bold mb-2">Dependentes ({venda.dependentes.length}):</h3>
              {venda.dependentes.map((dep, idx) => (
                <p key={idx} className="ml-4">
                  {idx + 1}. {dep.nome} - CPF: {dep.cpf}
                </p>
              ))}
            </div>
          )}

          <div className="bg-yellow-50 p-3 rounded border-2 border-yellow-300 text-center font-bold">
            ⚠️ Este cartão NÃO é plano de saúde
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Visualização simplificada. Clique em "Imprimir Contrato" para gerar o documento completo com todos os artigos e cláusulas.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
