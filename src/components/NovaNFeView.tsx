import React, { useState } from 'react';
import { ArrowLeft, Plus, Save, Send, Trash2 } from 'lucide-react';
import * as api from '../services/api';
import { Meta } from '../types';
import { ALTURA_CONTROLE, Area, Botao, Campo, Confirmacao, Secao, Selecao, Texto, Vazio } from './ui';
import { Toggle } from './Toggle';
import { NumberField } from './NumberField';
import { DateField } from './DateField';
import { PainelRespostas, useOperacao } from './PainelRespostas';
import { formatarChave, formatarMoeda } from '../utils/formatters';

/**
 * "Criar e Enviar" do exemplo Delphi: monta a nota, gera e assina o XML e, se
 * o usuário confirmar, transmite. Cobre o caso comum de venda — os grupos mais
 * raros do layout (exportação, comércio exterior, combustíveis) ficam de fora.
 */

interface ItemForm {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  origem: string;
  cst: string;
  csosn: string;
  aliquotaICMS: string;
  cstPis: string;
  cstCofins: string;
}

const ITEM_VAZIO: ItemForm = {
  codigo: '',
  descricao: '',
  ncm: '',
  cfop: '5102',
  unidade: 'UN',
  quantidade: '1.0000',
  valorUnitario: '0.00',
  origem: '0',
  cst: '00',
  csosn: '102',
  aliquotaICMS: '0.0000',
  cstPis: '07',
  cstCofins: '07',
};

const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const NovaNFeView: React.FC<{
  meta: Meta | null;
  onCancelar: () => void;
  onEmitida: () => void;
}> = ({ meta, onCancelar, onEmitida }) => {
  const { retorno, erro, errosSchema, carregando, executar, setErro, falhar } = useOperacao();

  const [naturezaOperacao, setNaturezaOperacao] = useState('VENDA DE MERCADORIA');
  const [serie, setSerie] = useState('1');
  const [numero, setNumero] = useState('');
  const [dataEmissao, setDataEmissao] = useState(hoje());
  const [tipoDocumento, setTipoDocumento] = useState('1');
  const [finalidade, setFinalidade] = useState('1');
  const [consumidorFinal, setConsumidorFinal] = useState(false);
  const [presencial, setPresencial] = useState('1');

  const [destDocumento, setDestDocumento] = useState('');
  const [destNome, setDestNome] = useState('');
  const [destIE, setDestIE] = useState('');
  const [destIndIE, setDestIndIE] = useState('9');
  const [destEmail, setDestEmail] = useState('');
  const [destLogradouro, setDestLogradouro] = useState('');
  const [destNumero, setDestNumero] = useState('');
  const [destBairro, setDestBairro] = useState('');
  const [destCodMunicipio, setDestCodMunicipio] = useState('');
  const [destMunicipio, setDestMunicipio] = useState('');
  const [destUf, setDestUf] = useState('SP');
  const [destCep, setDestCep] = useState('');

  const [itens, setItens] = useState<ItemForm[]>([{ ...ITEM_VAZIO }]);
  const [modalidadeFrete, setModalidadeFrete] = useState('9');
  const [formaPagamento, setFormaPagamento] = useState('01');
  const [observacoes, setObservacoes] = useState('');

  const [chaveGerada, setChaveGerada] = useState('');
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);

  // Não contribuinte é sempre consumidor final (rejeição 696): o toggle trava em Sim.
  // O servidor confere a mesma regra, para valer também para quem chama a API direto.
  const naoContribuinte = destIndIE === '9';
  const consumidorFinalEfetivo = naoContribuinte || consumidorFinal;

  const total = itens.reduce(
    (acc, i) => acc + Number(i.quantidade || 0) * Number(i.valorUnitario || 0),
    0,
  );

  const alterarItem = (indice: number, campo: keyof ItemForm, valor: string) => {
    setItens((atual) => atual.map((i, n) => (n === indice ? { ...i, [campo]: valor } : i)));
  };

  const montarDocumento = () => ({
    ide: {
      naturezaOperacao,
      serie: Number(serie),
      numero: Number(numero),
      dataEmissao,
      tipoDocumento: Number(tipoDocumento),
      finalidade: Number(finalidade),
      consumidorFinal: consumidorFinalEfetivo ? 1 : 0,
      presencial: Number(presencial),
      idDestino: destUf ? 1 : 1,
    },
    destinatario: destDocumento
      ? {
          [destDocumento.replace(/\D/g, '').length === 11 ? 'cpf' : 'cnpj']: destDocumento.replace(/\D/g, ''),
          nome: destNome,
          inscricaoEstadual: destIE,
          indIEDest: Number(destIndIE),
          email: destEmail,
          endereco: destLogradouro
            ? {
                logradouro: destLogradouro,
                numero: destNumero,
                bairro: destBairro,
                codigoMunicipio: destCodMunicipio,
                municipio: destMunicipio,
                uf: destUf,
                cep: destCep,
              }
            : undefined,
        }
      : undefined,
    itens: itens.map((i) => {
      const quantidade = Number(i.quantidade || 0);
      const valorUnitario = Number(i.valorUnitario || 0);
      const valorTotal = Math.round(quantidade * valorUnitario * 100) / 100;
      const aliquota = Number(i.aliquotaICMS || 0);

      return {
        codigo: i.codigo,
        descricao: i.descricao,
        ncm: i.ncm,
        cfop: i.cfop,
        unidade: i.unidade,
        quantidade,
        valorUnitario,
        valorTotal,
        imposto: {
          origem: Number(i.origem),
          cst: i.cst,
          csosn: i.csosn,
          modBC: 3,
          baseCalculo: aliquota > 0 ? valorTotal : 0,
          aliquota,
          valor: Math.round(valorTotal * aliquota) / 100,
          pis: { cst: i.cstPis },
          cofins: { cst: i.cstCofins },
        },
      };
    }),
    transporte: { modalidadeFrete: Number(modalidadeFrete) },
    pagamentos: [{ forma: formaPagamento, valor: Math.round(total * 100) / 100 }],
    informacoesAdicionais: { contribuinte: observacoes },
  });

  const gerar = async () => {
    setErro(null);
    try {
      const resposta = await api.gerarNFe(montarDocumento());
      setChaveGerada(resposta.chave);
    } catch (err: any) {
      // Sem chave, o "Transmitir" volta a ficar bloqueado até gerar um XML válido
      setChaveGerada('');
      falhar(err);
    }
  };

  const transmitir = async () => {
    setConfirmandoEnvio(false);
    await executar(() => api.enviarNFe({ chave: chaveGerada }));
    onEmitida();
  };

  const valido = numero && naturezaOperacao && itens.every((i) => i.descricao && i.ncm && i.cfop);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Botao icone={<ArrowLeft className="w-3.5 h-3.5" />} onClick={onCancelar}>
          Voltar
        </Botao>
        <h2 className="text-sm font-bold text-stone-800 dark:text-stone-100">Nova NF-e</h2>
      </div>

      <Secao titulo="Identificação">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <Texto
            rotulo="Natureza da operação"
            required
            maxLength={60}
            value={naturezaOperacao}
            onChange={(e) => setNaturezaOperacao(e.target.value)}
            className="lg:col-span-5"
          />
          <Texto
            rotulo="Série"
            required
            inputMode="numeric"
            value={serie}
            onChange={(e) => setSerie(e.target.value.replace(/\D/g, ''))}
            className="lg:col-span-1"
          />
          <Texto
            rotulo="Número"
            required
            inputMode="numeric"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
            className="lg:col-span-2"
          />
          <Campo rotulo="Data de emissão" className="lg:col-span-2">
            <DateField value={dataEmissao} onChange={setDataEmissao} required />
          </Campo>
          <Selecao
            rotulo="Tipo"
            value={tipoDocumento}
            onChange={(e) => setTipoDocumento(e.target.value)}
            opcoes={[
              { valor: '1', rotulo: 'Saída' },
              { valor: '0', rotulo: 'Entrada' },
            ]}
            className="lg:col-span-2"
          />

          <Selecao
            rotulo="Finalidade"
            value={finalidade}
            onChange={(e) => setFinalidade(e.target.value)}
            opcoes={[
              { valor: '1', rotulo: 'Normal' },
              { valor: '2', rotulo: 'Complementar' },
              { valor: '3', rotulo: 'Ajuste' },
              { valor: '4', rotulo: 'Devolução' },
            ]}
            className="lg:col-span-3"
          />
          <Campo
            rotulo="Consumidor final"
            dica={naoContribuinte ? 'Obrigatório para destinatário não contribuinte (rejeição 696)' : undefined}
            className="lg:col-span-3"
          >
            {/* Mesma altura dos selects vizinhos, para a linha ficar alinhada */}
            <div className={`${ALTURA_CONTROLE} flex items-center`}>
              <Toggle
                checked={consumidorFinalEfetivo}
                onChange={setConsumidorFinal}
                disabled={naoContribuinte}
                title={naoContribuinte ? 'Travado em Sim: o destinatário é não contribuinte' : undefined}
              />
            </div>
          </Campo>
          <Selecao
            rotulo="Presença do comprador"
            value={presencial}
            onChange={(e) => setPresencial(e.target.value)}
            opcoes={[
              { valor: '0', rotulo: 'Não se aplica' },
              { valor: '1', rotulo: 'Presencial' },
              { valor: '2', rotulo: 'Internet' },
              { valor: '3', rotulo: 'Teleatendimento' },
              { valor: '4', rotulo: 'Entrega a domicílio' },
              { valor: '9', rotulo: 'Outros' },
            ]}
            className="lg:col-span-3"
          />
          <Selecao
            rotulo="Modalidade do frete"
            value={modalidadeFrete}
            onChange={(e) => setModalidadeFrete(e.target.value)}
            opcoes={[
              { valor: '0', rotulo: '0 — Por conta do emitente' },
              { valor: '1', rotulo: '1 — Por conta do destinatário' },
              { valor: '2', rotulo: '2 — Por conta de terceiros' },
              { valor: '3', rotulo: '3 — Próprio (remetente)' },
              { valor: '4', rotulo: '4 — Próprio (destinatário)' },
              { valor: '9', rotulo: '9 — Sem frete' },
            ]}
            className="lg:col-span-3"
          />
        </div>
      </Secao>

      <Secao titulo="Destinatário" descricao="Em homologação a razão social é substituída pela frase exigida pela SEFAZ">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <Texto
            rotulo="CNPJ / CPF"
            inputMode="numeric"
            value={destDocumento}
            onChange={(e) => setDestDocumento(e.target.value.replace(/\D/g, '').slice(0, 14))}
            className="lg:col-span-3 font-mono"
          />
          <Texto
            rotulo="Nome / Razão social"
            maxLength={60}
            value={destNome}
            onChange={(e) => setDestNome(e.target.value)}
            className="lg:col-span-6"
          />
          <Selecao
            rotulo="Indicador de IE"
            value={destIndIE}
            onChange={(e) => setDestIndIE(e.target.value)}
            opcoes={[
              { valor: '1', rotulo: '1 — Contribuinte' },
              { valor: '2', rotulo: '2 — Isento' },
              { valor: '9', rotulo: '9 — Não contribuinte' },
            ]}
            className="lg:col-span-3"
          />

          {destIndIE === '1' && (
            <Texto
              rotulo="Inscrição Estadual"
              inputMode="numeric"
              value={destIE}
              onChange={(e) => setDestIE(e.target.value.replace(/\D/g, ''))}
              className="lg:col-span-3 font-mono"
            />
          )}
          <Texto
            rotulo="E-mail"
            type="email"
            value={destEmail}
            onChange={(e) => setDestEmail(e.target.value)}
            className="lg:col-span-4"
          />

          <Texto
            rotulo="Logradouro"
            value={destLogradouro}
            onChange={(e) => setDestLogradouro(e.target.value)}
            className="lg:col-span-5"
          />
          <Texto
            rotulo="Número"
            value={destNumero}
            onChange={(e) => setDestNumero(e.target.value)}
            className="lg:col-span-2"
          />
          <Texto
            rotulo="Bairro"
            value={destBairro}
            onChange={(e) => setDestBairro(e.target.value)}
            className="lg:col-span-5"
          />
          <Texto
            rotulo="Código IBGE do município"
            inputMode="numeric"
            value={destCodMunicipio}
            onChange={(e) => setDestCodMunicipio(e.target.value.replace(/\D/g, '').slice(0, 7))}
            className="lg:col-span-3 font-mono"
          />
          <Texto
            rotulo="Município"
            value={destMunicipio}
            onChange={(e) => setDestMunicipio(e.target.value)}
            className="lg:col-span-4"
          />
          <Selecao
            rotulo="UF"
            value={destUf}
            onChange={(e) => setDestUf(e.target.value)}
            opcoes={(meta?.ufs || []).map((u) => ({ valor: u, rotulo: u }))}
            className="lg:col-span-2"
          />
          <Texto
            rotulo="CEP"
            inputMode="numeric"
            value={destCep}
            onChange={(e) => setDestCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
            className="lg:col-span-3 font-mono"
          />
        </div>
      </Secao>

      <Secao
        titulo="Itens"
        descricao={`${itens.length} item(ns) • total ${formatarMoeda(total)}`}
        acoes={
          <Botao icone={<Plus className="w-3.5 h-3.5" />} onClick={() => setItens((a) => [...a, { ...ITEM_VAZIO }])}>
            Adicionar item
          </Botao>
        }
      >
        {itens.length === 0 ? (
          <Vazio mensagem="Acrescente ao menos um item." />
        ) : (
          <div className="flex flex-col gap-3">
            {itens.map((item, indice) => (
              <div
                key={indice}
                className="border border-stone-200 dark:border-stone-800 rounded-lg p-3 grid grid-cols-1 lg:grid-cols-12 gap-3"
              >
                <Texto
                  rotulo="Código"
                  value={item.codigo}
                  onChange={(e) => alterarItem(indice, 'codigo', e.target.value)}
                  className="lg:col-span-2"
                />
                <Texto
                  rotulo="Descrição"
                  required
                  value={item.descricao}
                  onChange={(e) => alterarItem(indice, 'descricao', e.target.value)}
                  className="lg:col-span-5"
                />
                <Texto
                  rotulo="NCM"
                  required
                  inputMode="numeric"
                  value={item.ncm}
                  onChange={(e) => alterarItem(indice, 'ncm', e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="lg:col-span-2 font-mono"
                />
                <Texto
                  rotulo="CFOP"
                  required
                  inputMode="numeric"
                  value={item.cfop}
                  onChange={(e) => alterarItem(indice, 'cfop', e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="lg:col-span-1 font-mono"
                />
                <Texto
                  rotulo="Un."
                  value={item.unidade}
                  onChange={(e) => alterarItem(indice, 'unidade', e.target.value.slice(0, 6))}
                  className="lg:col-span-1"
                />
                <div className="lg:col-span-1 flex items-end justify-end">
                  <Botao
                    variante="perigo"
                    icone={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => setItens((a) => a.filter((_, n) => n !== indice))}
                  />
                </div>

                <Campo rotulo="Quantidade" className="lg:col-span-2">
                  <NumberField
                    value={item.quantidade}
                    scale={4}
                    onChange={(v) => alterarItem(indice, 'quantidade', v)}
                  />
                </Campo>
                <Campo rotulo="Valor unitário" className="lg:col-span-2">
                  <NumberField
                    value={item.valorUnitario}
                    scale={2}
                    onChange={(v) => alterarItem(indice, 'valorUnitario', v)}
                  />
                </Campo>
                <Campo rotulo="Total do item" className="lg:col-span-2">
                  <div className="text-xs font-semibold text-stone-800 dark:text-stone-100 h-[34px] flex items-center justify-end px-3 bg-stone-50 dark:bg-stone-800/60">
                    {formatarMoeda(Number(item.quantidade || 0) * Number(item.valorUnitario || 0))}
                  </div>
                </Campo>
                <Selecao
                  rotulo="Origem"
                  value={item.origem}
                  onChange={(e) => alterarItem(indice, 'origem', e.target.value)}
                  opcoes={[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ valor: String(n), rotulo: String(n) }))}
                  className="lg:col-span-1"
                />
                <Texto
                  rotulo="CST ICMS"
                  value={item.cst}
                  onChange={(e) => alterarItem(indice, 'cst', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="lg:col-span-1 font-mono"
                />
                <Texto
                  rotulo="CSOSN"
                  value={item.csosn}
                  onChange={(e) => alterarItem(indice, 'csosn', e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="lg:col-span-1 font-mono"
                />
                <Campo rotulo="Alíq. ICMS %" className="lg:col-span-1">
                  <NumberField
                    value={item.aliquotaICMS}
                    scale={4}
                    onChange={(v) => alterarItem(indice, 'aliquotaICMS', v)}
                  />
                </Campo>
                <Texto
                  rotulo="CST PIS"
                  value={item.cstPis}
                  onChange={(e) => alterarItem(indice, 'cstPis', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="lg:col-span-1 font-mono"
                />
                <Texto
                  rotulo="CST COFINS"
                  value={item.cstCofins}
                  onChange={(e) => alterarItem(indice, 'cstCofins', e.target.value.replace(/\D/g, '').slice(0, 2))}
                  className="lg:col-span-1 font-mono"
                />
              </div>
            ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Pagamento e observações">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <Selecao
            rotulo="Forma de pagamento"
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value)}
            opcoes={[
              { valor: '01', rotulo: '01 — Dinheiro' },
              { valor: '02', rotulo: '02 — Cheque' },
              { valor: '03', rotulo: '03 — Cartão de crédito' },
              { valor: '04', rotulo: '04 — Cartão de débito' },
              { valor: '05', rotulo: '05 — Crédito da loja' },
              { valor: '15', rotulo: '15 — Boleto bancário' },
              { valor: '17', rotulo: '17 — PIX' },
              { valor: '90', rotulo: '90 — Sem pagamento' },
              { valor: '99', rotulo: '99 — Outros' },
            ]}
            className="lg:col-span-4"
          />
          <Area
            rotulo="Informações complementares"
            rows={2}
            maxLength={5000}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="lg:col-span-8"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-200 dark:border-stone-800 mt-4">
          <div className="text-xs text-stone-500 dark:text-stone-400">
            {chaveGerada ? (
              <>Chave gerada: <span className="font-mono text-stone-800 dark:text-stone-100">{formatarChave(chaveGerada)}</span></>
            ) : (
              'Gere o XML antes de transmitir.'
            )}
          </div>
          <div className="flex gap-2">
            <Botao icone={<Save className="w-3.5 h-3.5" />} disabled={!valido} onClick={gerar}>
              Gerar e Assinar
            </Botao>
            <Botao
              variante="primario"
              icone={<Send className="w-3.5 h-3.5" />}
              carregando={carregando}
              disabled={!chaveGerada}
              onClick={() => setConfirmandoEnvio(true)}
            >
              Transmitir
            </Botao>
          </div>
        </div>
      </Secao>

      <PainelRespostas
        retorno={retorno}
        erro={erro}
        errosSchema={errosSchema}
        carregando={carregando}
        resumo={[
          ['Recibo do lote', retorno?.dados?.recibo],
          ['Protocolo', retorno?.dados?.protocolo],
          ['Situação da nota', retorno?.dados?.cStatNota && `${retorno.dados.cStatNota} — ${retorno.dados.motivoNota}`],
        ]}
      />

      <Confirmacao
        aberto={confirmandoEnvio}
        titulo="Transmitir esta NF-e?"
        mensagem="A nota será enviada à SEFAZ para autorização."
        rotuloConfirmar="Transmitir"
        perigo={false}
        onConfirmar={transmitir}
        onCancelar={() => setConfirmandoEnvio(false)}
      />
    </div>
  );
};
