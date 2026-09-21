import React, { useEffect, useRef, useState } from 'react';
import { FileCheck2, FileInput, FilePlus2, FileText, Mail, Printer, Send, ShieldCheck } from 'lucide-react';
import * as api from '../services/api';
import { DocumentoLista, Meta, ResultadoValidacao } from '../types';
import { Botao, Confirmacao, Etiqueta, Secao, Texto, Vazio } from './ui';
import { ListaErrosSchema, PainelRespostas, useOperacao } from './PainelRespostas';
import { NovaNFeView } from './NovaNFeView';
import { AMBIENTES, SITUACOES, formatarChave, formatarDataHora, formatarMoeda } from '../utils/formatters';

/**
 * Aba "Envios": a lista dos documentos e as ações sobre eles — transmitir,
 * imprimir o DANFE, enviar por e-mail, validar a assinatura e importar XML.
 */
export const DocumentosView: React.FC<{ meta: Meta | null; onRecarregarPainel: () => void }> = ({
  meta,
  onRecarregarPainel,
}) => {
  const { retorno, erro, errosSchema, carregando, executar, setErro, falhar } = useOperacao();

  const [documentos, setDocumentos] = useState<DocumentoLista[]>([]);
  const [selecionado, setSelecionado] = useState<DocumentoLista | null>(null);
  const [emitindo, setEmitindo] = useState(false);
  const [confirmandoEnvio, setConfirmandoEnvio] = useState<DocumentoLista | null>(null);
  const [emailPara, setEmailPara] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState<DocumentoLista | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultadoSchema, setResultadoSchema] = useState<{ numero: number; resultado: ResultadoValidacao } | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = () => api.listarDocumentos().then(setDocumentos).catch(() => setDocumentos([]));
  useEffect(() => { carregar(); }, []);

  const transmitir = async (doc: DocumentoLista) => {
    setConfirmandoEnvio(null);
    await executar(() => api.enviarNFe({ chave: doc.chave }));
    carregar();
    onRecarregarPainel();
  };

  const importar = async (arquivo: File) => {
    setErro(null);
    try {
      const xml = await arquivo.text();
      const { chave } = await api.importarXml(xml);
      setAviso(`XML importado: ${formatarChave(chave)}`);
      carregar();
    } catch (err: any) {
      setErro(err.message);
    }
  };

  const validarAssinatura = async (doc: DocumentoLista) => {
    setErro(null);
    try {
      const completo = await api.buscarDocumento(doc.chave);
      const r = await api.validarAssinatura(completo.xml_protocolo || completo.xml);
      setAviso(r.valida ? 'Assinatura digital válida.' : `Assinatura inválida: ${r.erro}`);
    } catch (err: any) {
      setErro(err.message);
    }
  };

  /** "Validar XML" do exemplo: confere contra o XSD oficial sem enviar nada */
  const validarSchema = async (doc: DocumentoLista) => {
    setErro(null);
    setResultadoSchema(null);
    try {
      const resultado = await api.validarXml({ chave: doc.chave });
      if (resultado.valido) {
        setAviso(`NF-e nº ${doc.numero}: XML válido contra ${resultado.schema}.`);
      } else {
        setAviso(null);
        setResultadoSchema({ numero: doc.numero, resultado });
      }
    } catch (err: any) {
      falhar(err);
    }
  };

  const imprimir = async (doc: DocumentoLista) => {
    setErro(null);
    try {
      await api.abrirDanfe(doc.chave);
    } catch (err: any) {
      setErro(err.message);
    }
  };

  const mandarEmail = async () => {
    if (!enviandoEmail) return;
    setErro(null);
    try {
      await api.enviarPorEmail({ chave: enviandoEmail.chave, para: emailPara });
      setAviso(`NF-e enviada para ${emailPara}.`);
      setEnviandoEmail(null);
      setEmailPara('');
    } catch (err: any) {
      setErro(err.message);
    }
  };

  if (emitindo) {
    return (
      <NovaNFeView
        meta={meta}
        onCancelar={() => setEmitindo(false)}
        onEmitida={() => {
          setEmitindo(false);
          carregar();
          onRecarregarPainel();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {aviso && (
        <div className="text-xs bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900
          text-blue-800 dark:text-blue-300 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
          <span>{aviso}</span>
          <button type="button" className="font-bold cursor-pointer" onClick={() => setAviso(null)}>×</button>
        </div>
      )}

      {resultadoSchema && (
        <div className="text-xs bg-white dark:bg-stone-900 border border-red-200 dark:border-red-900 rounded-xl px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <span className="font-semibold text-red-700 dark:text-red-300">
              NF-e nº {resultadoSchema.numero}: o XML não passa no schema oficial
              ({resultadoSchema.resultado.erros.length} problema{resultadoSchema.resultado.erros.length === 1 ? '' : 's'}).
            </span>
            <button type="button" className="font-bold cursor-pointer text-stone-400" onClick={() => setResultadoSchema(null)}>
              ×
            </button>
          </div>
          <ListaErrosSchema erros={resultadoSchema.resultado.erros} schema={resultadoSchema.resultado.schema} />
        </div>
      )}

      <Secao
        titulo="Documentos"
        descricao="Notas geradas, transmitidas e importadas"
        acoes={
          <>
            <input
              ref={arquivoRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])}
            />
            <Botao icone={<FileInput className="w-3.5 h-3.5" />} onClick={() => arquivoRef.current?.click()}>
              Importar XML
            </Botao>
            <Botao
              variante="primario"
              icone={<FilePlus2 className="w-3.5 h-3.5" />}
              onClick={() => setEmitindo(true)}
            >
              Nova NF-e
            </Botao>
          </>
        }
      >
        {documentos.length === 0 ? (
          <Vazio mensagem="Nenhum documento emitido." icone={<FileText className="w-6 h-6 text-stone-300" />} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                  <th className="text-right font-semibold py-2 pr-3">Número</th>
                  <th className="text-right font-semibold py-2 pr-3">Série</th>
                  <th className="text-center font-semibold py-2 pr-3">Emissão</th>
                  <th className="text-left font-semibold py-2 pr-3">Destinatário</th>
                  <th className="text-right font-semibold py-2 pr-3">Valor</th>
                  <th className="text-center font-semibold py-2 pr-3">Situação</th>
                  <th className="text-center font-semibold py-2 pr-3">Ambiente</th>
                  <th className="text-right font-semibold py-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {documentos.map((d) => {
                  const situacao = SITUACOES[d.situacao] || SITUACOES.rascunho;
                  const transmissivel = ['assinada', 'rejeitada'].includes(d.situacao);

                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        className="hover:bg-stone-50 dark:hover:bg-stone-800/40 cursor-pointer"
                        onClick={() => setSelecionado(selecionado?.id === d.id ? null : d)}
                      >
                        <td className="py-2 pr-3 text-right font-semibold">{d.numero}</td>
                        <td className="py-2 pr-3 text-right">{d.serie}</td>
                        <td className="py-2 pr-3 text-center">{formatarDataHora(d.data_emissao)}</td>
                        <td className="py-2 pr-3 truncate max-w-[220px]">{d.destinatario_nome || '—'}</td>
                        <td className="py-2 pr-3 text-right">{formatarMoeda(d.valor_total)}</td>
                        <td className="py-2 pr-3 text-center">
                          <Etiqueta texto={situacao.rotulo} classe={situacao.classe} />
                        </td>
                        <td className="py-2 pr-3 text-center text-[10px]">{AMBIENTES[d.ambiente]}</td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {transmissivel && (
                              <Botao
                                variante="primario"
                                icone={<Send className="w-3.5 h-3.5" />}
                                onClick={() => setConfirmandoEnvio(d)}
                              >
                                Transmitir
                              </Botao>
                            )}
                            <Botao icone={<Printer className="w-3.5 h-3.5" />} onClick={() => imprimir(d)}>
                              DANFE
                            </Botao>
                            <Botao
                              icone={<Mail className="w-3.5 h-3.5" />}
                              onClick={() => setEnviandoEmail(d)}
                              disabled={d.situacao !== 'autorizada'}
                            >
                              E-mail
                            </Botao>
                            <Botao icone={<FileCheck2 className="w-3.5 h-3.5" />} onClick={() => validarSchema(d)}>
                              Validar XML
                            </Botao>
                            <Botao icone={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => validarAssinatura(d)}>
                              Assinatura
                            </Botao>
                          </div>
                        </td>
                      </tr>

                      {selecionado?.id === d.id && (
                        <tr className="bg-stone-50 dark:bg-stone-900/60">
                          <td colSpan={8} className="px-3 py-3">
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                              <div className="flex gap-2">
                                <dt className="font-semibold text-stone-500">Chave</dt>
                                <dd className="font-mono">{formatarChave(d.chave)}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-semibold text-stone-500">Protocolo</dt>
                                <dd className="font-mono">{d.protocolo || '—'}</dd>
                              </div>
                              <div className="flex gap-2 sm:col-span-2">
                                <dt className="font-semibold text-stone-500">Retorno</dt>
                                <dd>{d.codigo_status ? `${d.codigo_status} — ${d.motivo}` : '—'}</dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
        aberto={!!confirmandoEnvio}
        titulo="Transmitir para a SEFAZ?"
        mensagem={
          <>
            A NF-e nº <strong>{confirmandoEnvio?.numero}</strong> será enviada para autorização
            {confirmandoEnvio?.ambiente === 1 ? ' em PRODUÇÃO' : ' em homologação'}.
          </>
        }
        rotuloConfirmar="Transmitir"
        perigo={confirmandoEnvio?.ambiente === 1}
        onConfirmar={() => confirmandoEnvio && transmitir(confirmandoEnvio)}
        onCancelar={() => setConfirmandoEnvio(null)}
      />

      {enviandoEmail && (
        <div className="fixed inset-0 z-50 bg-stone-900/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl shadow-2xl w-full max-w-md p-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-stone-800 dark:text-stone-100">
              Enviar NF-e nº {enviandoEmail.numero} por e-mail
            </h3>
            <Texto
              rotulo="Destinatário"
              type="email"
              required
              autoFocus
              placeholder="cliente@empresa.com.br"
              value={emailPara}
              onChange={(e) => setEmailPara(e.target.value)}
            />
            <p className="text-[11px] text-stone-500 dark:text-stone-400">
              Vão anexados o XML autorizado e o DANFE em PDF.
            </p>
            <div className="flex justify-end gap-2">
              <Botao onClick={() => setEnviandoEmail(null)}>Cancelar</Botao>
              <Botao variante="primario" disabled={!emailPara.includes('@')} onClick={mandarEmail}>
                Enviar
              </Botao>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
