/**
 * Geração do XML da NF-e / NFC-e no layout 4.00.
 *
 * Substitui o TNotaFiscal.GerarXML do ACBr. A ordem das tags é a do schema
 * (procNFe_v4.00.xsd / leiauteNFe_v4.00.xsd, em recursos/Schemas) e é
 * obrigatória: XML fora de ordem é rejeitado antes de qualquer validação de
 * conteúdo. Os totais são sempre recalculados a partir dos itens — deixar o
 * chamador informar total já rendeu rejeição 610 demais vezes.
 */
import crypto from 'crypto';
import { Contexto } from './contexto.js';
import { montarChave } from './chave.js';
import { CODIGO_UF, urlsConsulta } from './servicos.js';
import { dataHoraDFe, agora } from './datas.js';
import { DECLARACAO, NS_NFE, grupo, grupoObrigatorio, limparTexto, num, tag } from './xml.js';

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface Endereco {
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  codigoMunicipio: string;
  municipio: string;
  uf: string;
  cep: string;
  fone?: string;
  codigoPais?: string;
  pais?: string;
}

export interface Destinatario {
  cnpj?: string;
  cpf?: string;
  idEstrangeiro?: string;
  nome: string;
  inscricaoEstadual?: string;
  /** 1=Contribuinte ICMS, 2=Isento, 9=Não contribuinte */
  indIEDest?: number;
  suframa?: string;
  email?: string;
  endereco?: Endereco;
}

export interface ImpostoItem {
  /** Origem da mercadoria, 0 a 8 */
  origem: number;
  /** CST do ICMS (regime normal) — 00, 10, 20, 40, 41, 50, 51, 60, 70, 90 */
  cst?: string;
  /** CSOSN (Simples Nacional) — 101, 102, 103, 201, 202, 203, 300, 400, 500, 900 */
  csosn?: string;
  modBC?: number;
  baseCalculo?: number;
  aliquota?: number;
  valor?: number;
  reducaoBC?: number;
  /** Substituição tributária */
  modBCST?: number;
  mvaST?: number;
  reducaoBCST?: number;
  baseCalculoST?: number;
  aliquotaST?: number;
  valorST?: number;
  /** Crédito do Simples Nacional */
  aliquotaCredito?: number;
  valorCredito?: number;
  pis: { cst: string; base?: number; aliquota?: number; valor?: number };
  cofins: { cst: string; base?: number; aliquota?: number; valor?: number };
  ipi?: { cst: string; codigoEnquadramento?: string; base?: number; aliquota?: number; valor?: number };
}

export interface ItemNFe {
  codigo: string;
  ean?: string;
  descricao: string;
  ncm: string;
  cest?: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** Quando ausente, vira quantidade × valorUnitario */
  valorTotal?: number;
  valorDesconto?: number;
  valorFrete?: number;
  valorSeguro?: number;
  valorOutros?: number;
  /** 1 = o valor do item entra no total da nota (padrão) */
  compoeTotal?: boolean;
  informacoesAdicionais?: string;
  imposto: ImpostoItem;
}

export interface Volume {
  quantidade?: number;
  especie?: string;
  marca?: string;
  numeracao?: string;
  pesoLiquido?: number;
  pesoBruto?: number;
}

export interface Pagamento {
  /** 01=Dinheiro, 02=Cheque, 03=Crédito, 04=Débito, 15=Boleto, 90=Sem pagamento, 99=Outros */
  forma: string;
  valor: number;
  /** 0=À vista, 1=A prazo */
  indPag?: number;
  descricao?: string;
}

export interface DocumentoNFe {
  ide: {
    naturezaOperacao: string;
    serie: number;
    numero: number;
    dataEmissao?: string;
    dataSaida?: string;
    /** 0=Entrada, 1=Saída */
    tipoDocumento: number;
    /** 1=Interna, 2=Interestadual, 3=Exterior */
    idDestino?: number;
    /** 1=Normal, 2=Complementar, 3=Ajuste, 4=Devolução */
    finalidade?: number;
    /** 1=Consumidor final */
    consumidorFinal?: number;
    /** 0=Não se aplica, 1=Presencial, 2=Internet, 4=Entrega a domicílio, 9=Outros */
    presencial?: number;
    codigoMunicipioFG?: string;
    tipoEmissao?: number;
    codigoNumerico?: number;
  };
  destinatario?: Destinatario;
  itens: ItemNFe[];
  transporte?: {
    /** 0=Emitente, 1=Destinatário, 2=Terceiros, 3/4=Próprio, 9=Sem frete */
    modalidadeFrete: number;
    transportadora?: { cnpj?: string; cpf?: string; nome?: string; ie?: string; endereco?: string; municipio?: string; uf?: string };
    veiculo?: { placa: string; uf: string; rntc?: string };
    volumes?: Volume[];
  };
  pagamentos?: Pagamento[];
  informacoesAdicionais?: { fisco?: string; contribuinte?: string };
  responsavelTecnico?: { cnpj: string; contato: string; email: string; fone: string; idCSRT?: string; csrt?: string };
}

export interface NFeGerada {
  xml: string;
  chave: string;
  numero: number;
  serie: number;
  modelo: string;
  totais: Totais;
}

export interface Totais {
  vBC: number; vICMS: number; vICMSDeson: number; vFCP: number;
  vBCST: number; vST: number; vFCPST: number; vFCPSTRet: number;
  vProd: number; vFrete: number; vSeg: number; vDesc: number;
  vII: number; vIPI: number; vIPIDevol: number; vPIS: number; vCOFINS: number;
  vOutro: number; vNF: number;
}

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------

/** Mesmo arredondamento de `num`, para os totais fecharem com os itens */
function arred(v: number, casas = 2): number {
  return Number(num(v, casas));
}

function somarTotais(itens: ItemNFe[]): Totais {
  const t: Totais = {
    vBC: 0, vICMS: 0, vICMSDeson: 0, vFCP: 0, vBCST: 0, vST: 0, vFCPST: 0, vFCPSTRet: 0,
    vProd: 0, vFrete: 0, vSeg: 0, vDesc: 0, vII: 0, vIPI: 0, vIPIDevol: 0,
    vPIS: 0, vCOFINS: 0, vOutro: 0, vNF: 0,
  };

  for (const item of itens) {
    const bruto = item.valorTotal ?? item.quantidade * item.valorUnitario;
    const i = item.imposto;

    if (item.compoeTotal !== false) t.vProd += bruto;
    t.vDesc += item.valorDesconto || 0;
    t.vFrete += item.valorFrete || 0;
    t.vSeg += item.valorSeguro || 0;
    t.vOutro += item.valorOutros || 0;

    t.vBC += i.baseCalculo || 0;
    t.vICMS += i.valor || 0;
    t.vBCST += i.baseCalculoST || 0;
    t.vST += i.valorST || 0;
    t.vIPI += i.ipi?.valor || 0;
    t.vPIS += i.pis?.valor || 0;
    t.vCOFINS += i.cofins?.valor || 0;
  }

  for (const k of Object.keys(t) as (keyof Totais)[]) t[k] = arred(t[k]);

  t.vNF = arred(t.vProd - t.vDesc + t.vST + t.vFrete + t.vSeg + t.vOutro + t.vIPI + t.vII);
  return t;
}

// ---------------------------------------------------------------------------
// Impostos do item
// ---------------------------------------------------------------------------

function gerarICMS(i: ImpostoItem, simples: boolean): string {
  const origem = tag('orig', i.origem ?? 0);

  if (simples && i.csosn) {
    const csosn = tag('CSOSN', i.csosn);
    switch (i.csosn) {
      case '101':
      case '201':
        return grupoObrigatorio('ICMSSN101', origem, csosn,
          tag('pCredSN', num(i.aliquotaCredito, 4)), tag('vCredICMSSN', num(i.valorCredito)));
      case '102':
      case '103':
      case '300':
      case '400':
        return grupoObrigatorio('ICMSSN102', origem, csosn);
      case '500':
        return grupoObrigatorio('ICMSSN500', origem, csosn,
          tag('vBCSTRet', i.baseCalculoST !== undefined ? num(i.baseCalculoST) : undefined),
          tag('vICMSSTRet', i.valorST !== undefined ? num(i.valorST) : undefined));
      case '900':
        return grupoObrigatorio('ICMSSN900', origem, csosn,
          tag('modBC', i.modBC), tag('vBC', num(i.baseCalculo)),
          tag('pICMS', num(i.aliquota, 4)), tag('vICMS', num(i.valor)));
      default:
        return grupoObrigatorio('ICMSSN102', origem, tag('CSOSN', i.csosn));
    }
  }

  const cst = i.cst || '00';
  const cstTag = tag('CST', cst);

  switch (cst) {
    case '00':
      return grupoObrigatorio('ICMS00', origem, cstTag,
        tag('modBC', i.modBC ?? 3), tag('vBC', num(i.baseCalculo)),
        tag('pICMS', num(i.aliquota, 4)), tag('vICMS', num(i.valor)));
    case '20':
      return grupoObrigatorio('ICMS20', origem, cstTag,
        tag('modBC', i.modBC ?? 3), tag('pRedBC', num(i.reducaoBC, 4)),
        tag('vBC', num(i.baseCalculo)), tag('pICMS', num(i.aliquota, 4)), tag('vICMS', num(i.valor)));
    case '40':
    case '41':
    case '50':
      return grupoObrigatorio('ICMS40', origem, cstTag);
    case '51':
      return grupoObrigatorio('ICMS51', origem, cstTag,
        tag('modBC', i.modBC), tag('vBC', i.baseCalculo !== undefined ? num(i.baseCalculo) : undefined),
        tag('pICMS', i.aliquota !== undefined ? num(i.aliquota, 4) : undefined),
        tag('vICMS', i.valor !== undefined ? num(i.valor) : undefined));
    case '60':
      return grupoObrigatorio('ICMS60', origem, cstTag,
        tag('vBCSTRet', i.baseCalculoST !== undefined ? num(i.baseCalculoST) : undefined),
        tag('vICMSSTRet', i.valorST !== undefined ? num(i.valorST) : undefined));
    case '10':
    case '70':
      return grupoObrigatorio(cst === '10' ? 'ICMS10' : 'ICMS70', origem, cstTag,
        tag('modBC', i.modBC ?? 3),
        cst === '70' ? tag('pRedBC', num(i.reducaoBC, 4)) : '',
        tag('vBC', num(i.baseCalculo)), tag('pICMS', num(i.aliquota, 4)), tag('vICMS', num(i.valor)),
        tag('modBCST', i.modBCST ?? 4), tag('pMVAST', num(i.mvaST, 4)),
        tag('pRedBCST', i.reducaoBCST !== undefined ? num(i.reducaoBCST, 4) : undefined),
        tag('vBCST', num(i.baseCalculoST)), tag('pICMSST', num(i.aliquotaST, 4)), tag('vICMSST', num(i.valorST)));
    default:
      return grupoObrigatorio('ICMS90', origem, cstTag,
        tag('modBC', i.modBC ?? 3), tag('vBC', num(i.baseCalculo)),
        tag('pICMS', num(i.aliquota, 4)), tag('vICMS', num(i.valor)));
  }
}

function gerarPisCofins(nome: 'PIS' | 'COFINS', d: { cst: string; base?: number; aliquota?: number; valor?: number }): string {
  const cst = d?.cst || '07';
  const aliquota = nome === 'PIS' ? 'pPIS' : 'pCOFINS';
  const valorTag = nome === 'PIS' ? 'vPIS' : 'vCOFINS';

  // 01/02 = tributado por alíquota; 03 = por quantidade; 04 a 09 = sem cálculo; 49+ = outras
  if (['01', '02'].includes(cst)) {
    return grupoObrigatorio(nome, grupoObrigatorio(`${nome}Aliq`,
      tag('CST', cst), tag('vBC', num(d.base)), tag(aliquota, num(d.aliquota, 4)), tag(valorTag, num(d.valor))));
  }
  if (['49', '50', '51', '52', '53', '54', '55', '56', '60', '61', '62', '63', '64', '65', '66', '67', '70', '71', '72', '73', '74', '75', '98', '99'].includes(cst)) {
    return grupoObrigatorio(nome, grupoObrigatorio(`${nome}Outr`,
      tag('CST', cst), tag('vBC', num(d.base)), tag(aliquota, num(d.aliquota, 4)), tag(valorTag, num(d.valor))));
  }
  return grupoObrigatorio(nome, grupoObrigatorio(`${nome}NT`, tag('CST', cst)));
}

function gerarIPI(ipi?: ImpostoItem['ipi']): string {
  if (!ipi?.cst) return '';
  const tributado = ['00', '49', '50', '99'].includes(ipi.cst);

  return grupoObrigatorio('IPI',
    tag('cEnq', ipi.codigoEnquadramento || '999'),
    tributado
      ? grupoObrigatorio('IPITrib', tag('CST', ipi.cst), tag('vBC', num(ipi.base)),
          tag('pIPI', num(ipi.aliquota, 4)), tag('vIPI', num(ipi.valor)))
      : grupoObrigatorio('IPINT', tag('CST', ipi.cst)));
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

export function gerarNFe(ctx: Contexto, doc: DocumentoNFe): NFeGerada {
  const emit = ctx.emitente;
  const cfg = ctx.config;
  const modelo = cfg.geral.modeloDF;
  const nfce = modelo === '65';
  const simples = [1, 2, 4].includes(Number(emit.crt));
  const ambiente = cfg.webservice.ambiente;

  if (!doc.itens?.length) throw new Error('A nota precisa de ao menos um item.');
  if (!emit.cnpj) throw new Error('O CNPJ do emitente não está preenchido em Configurações › Emitente.');

  const emissao = doc.ide.dataEmissao ? new Date(doc.ide.dataEmissao) : agora();
  const tipoEmissao = doc.ide.tipoEmissao ?? (cfg.geral.formaEmissao === 1 ? 1 : cfg.geral.formaEmissao);

  const { chave, codigoNumerico } = montarChave({
    uf: emit.uf,
    emissao,
    cnpj: emit.cnpj,
    modelo,
    serie: doc.ide.serie,
    numero: doc.ide.numero,
    tipoEmissao,
    codigoNumerico: doc.ide.codigoNumerico,
  });

  const totais = somarTotais(doc.itens);

  // Em homologação a razão social do destinatário é obrigatoriamente esta frase
  const homologacao = ambiente === 2;
  const dest = doc.destinatario;

  // ----- ide -----
  const ide = grupoObrigatorio('ide',
    tag('cUF', CODIGO_UF[emit.uf.toUpperCase()]),
    tag('cNF', codigoNumerico),
    tag('natOp', limparTexto(doc.ide.naturezaOperacao, 60)),
    tag('mod', modelo),
    tag('serie', doc.ide.serie),
    tag('nNF', doc.ide.numero),
    tag('dhEmi', dataHoraDFe(emissao)),
    doc.ide.dataSaida ? tag('dhSaiEnt', dataHoraDFe(new Date(doc.ide.dataSaida))) : '',
    tag('tpNF', doc.ide.tipoDocumento),
    tag('idDest', doc.ide.idDestino ?? 1),
    tag('cMunFG', doc.ide.codigoMunicipioFG || emit.codigo_municipio),
    tag('tpImp', nfce ? 4 : cfg.danfe.tipoDanfe === 1 ? 2 : 1),
    tag('tpEmis', tipoEmissao),
    tag('cDV', chave.slice(-1)),
    tag('tpAmb', ambiente),
    tag('finNFe', doc.ide.finalidade ?? 1),
    tag('indFinal', doc.ide.consumidorFinal ?? (nfce ? 1 : 0)),
    tag('indPres', doc.ide.presencial ?? (nfce ? 1 : 0)),
    tag('procEmi', 0),
    tag('verProc', 'nfeWeb 0.1.0'),
  );

  // ----- emit -----
  const emitente = grupoObrigatorio('emit',
    tag('CNPJ', emit.cnpj),
    tag('xNome', limparTexto(emit.razao_social, 60)),
    tag('xFant', limparTexto(emit.nome_fantasia || '', 60)),
    grupoObrigatorio('enderEmit',
      tag('xLgr', limparTexto(emit.logradouro, 60)),
      tag('nro', limparTexto(emit.numero || 'S/N', 60)),
      tag('xCpl', limparTexto(emit.complemento || '', 60)),
      tag('xBairro', limparTexto(emit.bairro, 60)),
      tag('cMun', emit.codigo_municipio),
      tag('xMun', limparTexto(emit.municipio, 60)),
      tag('UF', emit.uf),
      tag('CEP', (emit.cep || '').replace(/\D/g, '')),
      tag('cPais', '1058'),
      tag('xPais', 'BRASIL'),
      tag('fone', (emit.fone || '').replace(/\D/g, '')),
    ),
    tag('IE', (emit.inscricao_estadual || '').replace(/\D/g, '') || 'ISENTO'),
    tag('CRT', emit.crt),
  );

  // ----- dest -----
  let destinatario = '';
  if (dest) {
    const documento =
      tag('CNPJ', dest.cnpj?.replace(/\D/g, '')) ||
      tag('CPF', dest.cpf?.replace(/\D/g, '')) ||
      tag('idEstrangeiro', dest.idEstrangeiro);

    const e = dest.endereco;
    destinatario = grupoObrigatorio('dest',
      documento,
      tag('xNome', homologacao
        ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : limparTexto(dest.nome, 60)),
      e
        ? grupoObrigatorio('enderDest',
            tag('xLgr', limparTexto(e.logradouro, 60)),
            tag('nro', limparTexto(e.numero || 'S/N', 60)),
            tag('xCpl', limparTexto(e.complemento || '', 60)),
            tag('xBairro', limparTexto(e.bairro, 60)),
            tag('cMun', e.codigoMunicipio),
            tag('xMun', limparTexto(e.municipio, 60)),
            tag('UF', e.uf),
            tag('CEP', (e.cep || '').replace(/\D/g, '')),
            tag('cPais', e.codigoPais || '1058'),
            tag('xPais', e.pais || 'BRASIL'),
            tag('fone', (e.fone || '').replace(/\D/g, '')),
          )
        : '',
      tag('indIEDest', dest.indIEDest ?? (dest.inscricaoEstadual ? 1 : 9)),
      dest.indIEDest === 1 ? tag('IE', (dest.inscricaoEstadual || '').replace(/\D/g, '')) : '',
      tag('ISUF', dest.suframa),
      tag('email', dest.email),
    );
  }

  // ----- det -----
  const itens = doc.itens
    .map((item, indice) => {
      const valorTotal = item.valorTotal ?? item.quantidade * item.valorUnitario;
      const ean = item.ean?.trim() || 'SEM GTIN';

      const prod = grupoObrigatorio('prod',
        tag('cProd', limparTexto(item.codigo, 60)),
        tag('cEAN', ean),
        tag('xProd', homologacao && indice === 0 && nfce
          ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
          : limparTexto(item.descricao, 120)),
        tag('NCM', (item.ncm || '').replace(/\D/g, '')),
        tag('CEST', item.cest?.replace(/\D/g, '')),
        tag('CFOP', item.cfop),
        tag('uCom', limparTexto(item.unidade, 6)),
        tag('qCom', num(item.quantidade, 4)),
        tag('vUnCom', num(item.valorUnitario, 10)),
        tag('vProd', num(valorTotal)),
        tag('cEANTrib', ean),
        tag('uTrib', limparTexto(item.unidade, 6)),
        tag('qTrib', num(item.quantidade, 4)),
        tag('vUnTrib', num(item.valorUnitario, 10)),
        item.valorFrete ? tag('vFrete', num(item.valorFrete)) : '',
        item.valorSeguro ? tag('vSeg', num(item.valorSeguro)) : '',
        item.valorDesconto ? tag('vDesc', num(item.valorDesconto)) : '',
        item.valorOutros ? tag('vOutro', num(item.valorOutros)) : '',
        tag('indTot', item.compoeTotal === false ? 0 : 1),
      );

      const imposto = grupoObrigatorio('imposto',
        grupoObrigatorio('ICMS', gerarICMS(item.imposto, simples)),
        gerarIPI(item.imposto.ipi),
        gerarPisCofins('PIS', item.imposto.pis),
        gerarPisCofins('COFINS', item.imposto.cofins),
      );

      return `<det nItem="${indice + 1}">${prod}${imposto}${
        tag('infAdProd', limparTexto(item.informacoesAdicionais || '', 500))
      }</det>`;
    })
    .join('');

  // ----- total -----
  const total = grupoObrigatorio('total',
    grupoObrigatorio('ICMSTot',
      tag('vBC', num(totais.vBC)),
      tag('vICMS', num(totais.vICMS)),
      tag('vICMSDeson', num(totais.vICMSDeson)),
      tag('vFCP', num(totais.vFCP)),
      tag('vBCST', num(totais.vBCST)),
      tag('vST', num(totais.vST)),
      tag('vFCPST', num(totais.vFCPST)),
      tag('vFCPSTRet', num(totais.vFCPSTRet)),
      tag('vProd', num(totais.vProd)),
      tag('vFrete', num(totais.vFrete)),
      tag('vSeg', num(totais.vSeg)),
      tag('vDesc', num(totais.vDesc)),
      tag('vII', num(totais.vII)),
      tag('vIPI', num(totais.vIPI)),
      tag('vIPIDevol', num(totais.vIPIDevol)),
      tag('vPIS', num(totais.vPIS)),
      tag('vCOFINS', num(totais.vCOFINS)),
      tag('vOutro', num(totais.vOutro)),
      tag('vNF', num(totais.vNF)),
    ),
  );

  // ----- transp -----
  const t = doc.transporte;
  const transporte = grupoObrigatorio('transp',
    tag('modFrete', t?.modalidadeFrete ?? 9),
    t?.transportadora
      ? grupo('transporta',
          tag('CNPJ', t.transportadora.cnpj?.replace(/\D/g, '')) ||
            tag('CPF', t.transportadora.cpf?.replace(/\D/g, '')),
          tag('xNome', limparTexto(t.transportadora.nome || '', 60)),
          tag('IE', t.transportadora.ie?.replace(/\D/g, '')),
          tag('xEnder', limparTexto(t.transportadora.endereco || '', 60)),
          tag('xMun', limparTexto(t.transportadora.municipio || '', 60)),
          tag('UF', t.transportadora.uf),
        )
      : '',
    t?.veiculo
      ? grupo('veicTransp', tag('placa', t.veiculo.placa), tag('UF', t.veiculo.uf), tag('RNTC', t.veiculo.rntc))
      : '',
    (t?.volumes || [])
      .map((v) =>
        grupo('vol',
          tag('qVol', v.quantidade),
          tag('esp', limparTexto(v.especie || '', 60)),
          tag('marca', limparTexto(v.marca || '', 60)),
          tag('nVol', limparTexto(v.numeracao || '', 60)),
          tag('pesoL', v.pesoLiquido !== undefined ? num(v.pesoLiquido, 3) : undefined),
          tag('pesoB', v.pesoBruto !== undefined ? num(v.pesoBruto, 3) : undefined),
        ),
      )
      .join(''),
  );

  // ----- pag -----
  const pagamentos = doc.pagamentos?.length
    ? doc.pagamentos
    : [{ forma: '90', valor: totais.vNF } as Pagamento];

  const pag = grupoObrigatorio('pag',
    pagamentos
      .map((p) =>
        grupoObrigatorio('detPag',
          p.indPag !== undefined ? tag('indPag', p.indPag) : '',
          tag('tPag', p.forma),
          p.forma === '99' ? tag('xPag', limparTexto(p.descricao || 'Outros', 60)) : '',
          tag('vPag', num(p.valor)),
        ),
      )
      .join(''),
  );

  // ----- infAdic / infRespTec -----
  const infAdic = grupo('infAdic',
    tag('infAdFisco', limparTexto(doc.informacoesAdicionais?.fisco || '', 2000)),
    tag('infCpl', limparTexto(doc.informacoesAdicionais?.contribuinte || '', 5000)),
  );

  const rt = doc.responsavelTecnico;
  const infRespTec = rt
    ? grupoObrigatorio('infRespTec',
        tag('CNPJ', rt.cnpj.replace(/\D/g, '')),
        tag('xContato', limparTexto(rt.contato, 60)),
        tag('email', rt.email),
        tag('fone', rt.fone.replace(/\D/g, '')),
        ...(rt.idCSRT && rt.csrt
          ? [tag('idCSRT', rt.idCSRT), tag('hashCSRT', hashCSRT(rt.csrt, chave))]
          : []),
      )
    : '';

  const infNFe =
    `<infNFe versao="4.00" Id="NFe${chave}">` +
    ide + emitente + destinatario + itens + total + transporte + pag + infAdic + infRespTec +
    '</infNFe>';

  // NFC-e leva o bloco suplementar com o QR-Code e a URL de consulta
  const suplementar = nfce
    ? grupoObrigatorio('infNFeSupl',
        `<qrCode><![CDATA[${qrCode(ctx, chave, totais, emissao, tipoEmissao)}]]></qrCode>`,
        `<urlChave>${urlsConsulta('NFCe', emit.uf, ambiente).consulta}</urlChave>`,
      )
    : '';

  const xml = `${DECLARACAO}<NFe xmlns="${NS_NFE}">${infNFe}${suplementar}</NFe>`;

  return { xml, chave, numero: doc.ide.numero, serie: doc.ide.serie, modelo, totais };
}

/** hashCSRT = SHA-1 do CSRT + chave, em base64 (NT 2018.005) */
function hashCSRT(csrt: string, chave: string): string {
  return crypto.createHash('sha1').update(csrt + chave, 'utf8').digest('base64');
}

/**
 * QR-Code da NFC-e, versão 2 (TACBrNFe.GetURLQRCode).
 * Em emissão online a entrada é chave|versao|tpAmb|; offline (tpEmis 9) inclui
 * o dia da emissão, o valor e o digest.
 */
function qrCode(
  ctx: Contexto,
  chave: string,
  totais: Totais,
  emissao: Date,
  tipoEmissao: number,
): string {
  const cfg = ctx.config.geral;
  const ambiente = ctx.config.webservice.ambiente;
  const urlBase = urlsConsulta('NFCe', ctx.emitente.uf, ambiente).qrCode;
  const idCSC = String(Number(cfg.idCSC || 0));

  let entrada = `${chave}|2|${ambiente}|`;
  if (tipoEmissao === 9) {
    const dia = String(emissao.getDate()).padStart(2, '0');
    // O digest só existe depois de assinar; na emissão offline a NFC-e vai sem ele
    entrada += `${dia}|${num(totais.vNF)}||`;
  }

  const hash = crypto.createHash('sha1').update(entrada + idCSC + cfg.csc, 'utf8').digest('hex').toUpperCase();
  const separador = urlBase.includes('?p=') ? '' : '?p=';

  return `${urlBase}${separador}${entrada}${idCSC}|${hash}`;
}

export { somarTotais };
