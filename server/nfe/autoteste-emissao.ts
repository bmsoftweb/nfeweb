/**
 * Teste de ponta a ponta da emissão, sem tocar na SEFAZ: gera um certificado de
 * mentira, monta uma NF-e, assina, confere a assinatura e imprime o DANFE.
 *
 * É o caminho que mais quebra em silêncio — um XML fora de ordem ou uma
 * canonicalização errada só aparecem como rejeição 297 lá na SEFAZ.
 *
 * Rode com:  npx tsx server/nfe/autoteste-emissao.ts
 */
import assert from 'assert';
import forge from 'node-forge';
import { CertificadoCarregado } from './certificado';
import { Contexto } from './contexto';
import { assinar, conferirAssinatura } from './assinatura';
import { gerarNFe } from './gerarNFe';
import { gerarDanfe } from './danfe';
import { CONFIG_PADRAO } from '../config';
import { chaveValida } from './chave';
import { semDeclaracao } from './xml';

function conferir(nome: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => console.log(`  ok  ${nome}`));
}

/** Certificado autoassinado, só para exercitar a assinatura */
function certificadoDeTeste(): CertificadoCarregado {
  const par = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = par.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);

  const nome = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:05321136000117' }];
  cert.setSubject(nome);
  cert.setIssuer(nome);
  cert.sign(par.privateKey, forge.md.sha256.create());

  const certificadoPem = forge.pki.certificateToPem(cert);

  return {
    chavePrivadaPem: forge.pki.privateKeyToPem(par.privateKey),
    certificadoPem,
    certificadoBase64: certificadoPem.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, ''),
    cadeiaPem: [],
    info: {
      razaoSocial: 'EMPRESA TESTE LTDA',
      cnpj: '05321136000117',
      numeroSerie: '01',
      emissor: 'TESTE',
      validoDe: cert.validity.notBefore,
      validoAte: cert.validity.notAfter,
      diasParaVencer: 365,
    },
  };
}

const contexto = (modelo: '55' | '65' = '55'): Contexto => ({
  empresaId: 1,
  config: {
    ...CONFIG_PADRAO,
    geral: { ...CONFIG_PADRAO.geral, modeloDF: modelo, idCSC: '1', csc: 'CSC-DE-TESTE' },
    webservice: { ...CONFIG_PADRAO.webservice, uf: 'SP', ambiente: 2 },
  },
  emitente: {
    id: 1,
    cnpj: '05321136000117',
    inscricao_estadual: '111111111111',
    razao_social: 'EMPRESA TESTE LTDA',
    nome_fantasia: 'TESTE',
    logradouro: 'RUA DAS FLORES',
    numero: '100',
    complemento: '',
    bairro: 'CENTRO',
    codigo_municipio: '3550308',
    municipio: 'SAO PAULO',
    uf: 'SP',
    cep: '01001000',
    fone: '1133334444',
    crt: 3,
  },
  certificado: certificadoDeTeste(),
  modelo: modelo === '65' ? 'NFCe' : 'NFe',
});

const documento = {
  ide: {
    naturezaOperacao: 'VENDA DE MERCADORIA',
    serie: 1,
    numero: 123,
    tipoDocumento: 1,
    finalidade: 1,
    consumidorFinal: 1,
    presencial: 1,
  },
  destinatario: {
    cnpj: '11222333000181',
    nome: 'CLIENTE EXEMPLO LTDA',
    indIEDest: 9,
    endereco: {
      logradouro: 'AVENIDA BRASIL',
      numero: '500',
      bairro: 'JARDIM',
      codigoMunicipio: '3550308',
      municipio: 'SAO PAULO',
      uf: 'SP',
      cep: '01310000',
    },
  },
  itens: [
    {
      codigo: 'P001',
      descricao: 'Produto de teste',
      ncm: '84713012',
      cfop: '5102',
      unidade: 'UN',
      quantidade: 2,
      valorUnitario: 50.25,
      imposto: {
        origem: 0,
        cst: '00',
        modBC: 3,
        baseCalculo: 100.5,
        aliquota: 18,
        valor: 18.09,
        pis: { cst: '01', base: 100.5, aliquota: 1.65, valor: 1.66 },
        cofins: { cst: '01', base: 100.5, aliquota: 7.6, valor: 7.64 },
      },
    },
  ],
  transporte: { modalidadeFrete: 9 },
  pagamentos: [{ forma: '01', valor: 100.5 }],
  informacoesAdicionais: { contribuinte: 'Documento gerado em teste automatizado.' },
};

async function principal() {
  console.log('Autoteste de emissão\n');

  const ctx = contexto('55');
  const gerada = gerarNFe(ctx, documento as any);

  await conferir('XML gerado com chave válida e totais fechados', () => {
    assert.ok(chaveValida(gerada.chave));
    assert.strictEqual(gerada.totais.vProd, 100.5);
    assert.strictEqual(gerada.totais.vNF, 100.5);
    assert.ok(gerada.xml.includes(`Id="NFe${gerada.chave}"`));
  });

  await conferir('ordem dos grupos obrigatórios segue o schema', () => {
    const ordem = ['<ide>', '<emit>', '<dest>', '<det nItem="1">', '<total>', '<transp>', '<pag>', '<infAdic>'];
    let posicao = -1;
    for (const marca of ordem) {
      const achado = gerada.xml.indexOf(marca);
      assert.ok(achado > 0, `grupo ausente no XML: ${marca}`);
      assert.ok(achado > posicao, `grupo fora de ordem: ${marca}`);
      posicao = achado;
    }
  });

  await conferir('em homologação o nome do destinatário é substituído', () => {
    assert.ok(gerada.xml.includes('NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'));
    assert.ok(!gerada.xml.includes('CLIENTE EXEMPLO LTDA'));
  });

  const assinado = assinar(semDeclaracao(gerada.xml), 'infNFe', `NFe${gerada.chave}`, ctx.certificado);

  await conferir('assinatura entra depois de infNFe e é verificável', () => {
    assert.ok(assinado.includes('<Signature'), 'faltou o elemento Signature');
    assert.ok(
      assinado.indexOf('</infNFe>') < assinado.indexOf('<Signature'),
      'a assinatura precisa vir depois de </infNFe>',
    );
    assert.ok(assinado.includes('xmldsig#rsa-sha1'), 'a NF-e exige RSA-SHA1');
    assert.ok(assinado.includes('REC-xml-c14n-20010315'), 'a NF-e exige C14N 1.0 inclusiva');
    assert.ok(assinado.includes(`URI="#NFe${gerada.chave}"`), 'a referência precisa apontar para o Id da infNFe');

    const conferencia = conferirAssinatura(assinado);
    assert.ok(conferencia.valida, `assinatura recusada: ${conferencia.erro}`);
  });

  await conferir('alterar o XML assinado invalida a assinatura', () => {
    const adulterado = assinado.replace('<vNF>100.50</vNF>', '<vNF>999.99</vNF>');
    assert.notStrictEqual(adulterado, assinado, 'o valor não foi encontrado para adulterar');
    assert.ok(!conferirAssinatura(adulterado).valida, 'o XML adulterado não podia passar');
  });

  await conferir('DANFE sai em PDF', async () => {
    const pdf = await gerarDanfe(`<?xml version="1.0" encoding="UTF-8"?>${assinado}`, { homologacao: true });
    assert.ok(pdf.length > 3000, `PDF pequeno demais (${pdf.length} bytes)`);
    assert.strictEqual(pdf.subarray(0, 4).toString(), '%PDF');
  });

  await conferir('NFC-e ganha o bloco suplementar com QR-Code', () => {
    const nfce = gerarNFe(contexto('65'), documento as any);
    assert.ok(nfce.xml.includes('<infNFeSupl>'));
    assert.ok(nfce.xml.includes('<qrCode>'));
    assert.ok(/\|2\|2\|/.test(nfce.xml), 'o QR-Code deve trazer versão 2 e ambiente 2');
  });

  console.log('\nTudo certo.');
}

principal().catch((err) => {
  console.error('\nFALHOU:', err.message);
  process.exit(1);
});
