import React, { useState } from 'react';
import { CheckCircle2, Clipboard, Download, XCircle } from 'lucide-react';
import { Retorno } from '../types';
import { Abas, Botao, Vazio } from './ui';

/**
 * O painel inferior do formulário original (abas Respostas, XML Resposta, Log,
 * Retorno Completo WS e Dados), com o mesmo conteúdo.
 */

interface PainelRespostasProps {
  retorno: Retorno | null;
  erro?: string | null;
  carregando?: boolean;
  /** Linhas montadas pela tela, exibidas na aba "Respostas" */
  resumo?: [string, any][];
}

function baixar(texto: string, nome: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

const Bloco: React.FC<{ texto: string; nomeArquivo: string }> = ({ texto, nomeArquivo }) => {
  const [copiado, setCopiado] = useState(false);

  if (!texto) return <Vazio mensagem="Nada a exibir para esta operação." />;

  return (
    <div className="relative">
      <div className="absolute right-2 top-2 flex gap-1.5">
        <Botao
          icone={<Clipboard className="w-3.5 h-3.5" />}
          onClick={() => {
            navigator.clipboard.writeText(texto).then(() => {
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            });
          }}
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </Botao>
        <Botao icone={<Download className="w-3.5 h-3.5" />} onClick={() => baixar(texto, nomeArquivo)}>
          Baixar
        </Botao>
      </div>
      <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all max-h-[340px] overflow-auto
        bg-stone-50 dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-lg p-3 pt-11">
        {texto}
      </pre>
    </div>
  );
};

export const PainelRespostas: React.FC<PainelRespostasProps> = ({ retorno, erro, carregando, resumo }) => {
  const [aba, setAba] = useState('respostas');

  if (carregando) {
    return (
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <Vazio mensagem="Aguardando a resposta da SEFAZ…" />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-white dark:bg-stone-900 border border-red-200 dark:border-red-900 rounded-xl p-4">
        <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
          <XCircle className="w-4 h-4 shrink-0 mt-px" />
          <span>{erro}</span>
        </div>
      </div>
    );
  }

  if (!retorno) {
    return (
      <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl">
        <Vazio mensagem="A resposta da SEFAZ aparece aqui depois da operação." />
      </div>
    );
  }

  const linhas: [string, any][] = [
    ['Status', `${retorno.cStat} — ${retorno.xMotivo}`],
    ...(resumo || []),
    ['Endereço do webservice', retorno.url],
    ['Tempo de resposta', `${retorno.duracaoMs} ms`],
  ];

  return (
    <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl overflow-hidden">
      <div
        className={`px-4 py-2.5 flex items-center gap-2 text-xs font-semibold border-b ${
          retorno.sucesso
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900'
            : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900'
        }`}
      >
        {retorno.sucesso ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
        <span>{retorno.cStat} — {retorno.xMotivo || 'Sem descrição'}</span>
      </div>

      <div className="px-3">
        <Abas
          ativa={aba}
          onTrocar={setAba}
          abas={[
            { id: 'respostas', rotulo: 'Respostas' },
            { id: 'xml', rotulo: 'XML Resposta' },
            { id: 'completo', rotulo: 'Retorno Completo WS' },
            { id: 'dados', rotulo: 'Dados Enviados' },
          ]}
        />
      </div>

      <div className="p-3">
        {aba === 'respostas' && (
          <dl className="divide-y divide-stone-100 dark:divide-stone-800">
            {linhas
              .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
              .map(([rotulo, valor]) => (
                <div key={rotulo} className="py-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  <dt className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 w-56 shrink-0">
                    {rotulo}
                  </dt>
                  <dd className="text-xs text-stone-800 dark:text-stone-100 break-all flex-1 min-w-0">
                    {String(valor)}
                  </dd>
                </div>
              ))}
          </dl>
        )}

        {aba === 'xml' && <Bloco texto={retorno.xml} nomeArquivo="retorno.xml" />}
        {aba === 'completo' && <Bloco texto={retorno.retornoCompleto} nomeArquivo="retorno-ws.xml" />}
        {aba === 'dados' && <Bloco texto={retorno.envio} nomeArquivo="envio.xml" />}
      </div>
    </div>
  );
};

/** Estado compartilhado por todas as telas que disparam uma operação */
export function useOperacao() {
  const [retorno, setRetorno] = useState<Retorno | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const executar = async (fn: () => Promise<Retorno>) => {
    setCarregando(true);
    setErro(null);
    setRetorno(null);
    try {
      setRetorno(await fn());
    } catch (err: any) {
      setErro(err.message || String(err));
    } finally {
      setCarregando(false);
    }
  };

  return { retorno, erro, carregando, executar, setErro };
}
