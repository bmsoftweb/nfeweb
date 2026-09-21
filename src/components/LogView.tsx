import React, { useEffect, useState } from 'react';
import { CheckCircle2, ScrollText, XCircle } from 'lucide-react';
import * as api from '../services/api';
import { Secao, Vazio } from './ui';
import { formatarChave, formatarDataHora } from '../utils/formatters';

/** Aba "Log": o histórico de comunicação com a SEFAZ, com envio e retorno */
export const LogView: React.FC = () => {
  const [registros, setRegistros] = useState<any[]>([]);
  const [aberto, setAberto] = useState<any | null>(null);

  useEffect(() => {
    api.listarLog().then(setRegistros).catch(() => setRegistros([]));
  }, []);

  const abrir = async (id: number) => {
    if (aberto?.id === id) return setAberto(null);
    setAberto(await api.buscarLog(id));
  };

  return (
    <Secao titulo="Log de comunicação" descricao="Últimas 100 chamadas aos webservices">
      {registros.length === 0 ? (
        <Vazio mensagem="Nenhuma comunicação registrada." icone={<ScrollText className="w-6 h-6 text-stone-300" />} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
                <th className="text-center font-semibold py-2 pr-3">Quando</th>
                <th className="text-left font-semibold py-2 pr-3">Operação</th>
                <th className="text-left font-semibold py-2 pr-3">Chave</th>
                <th className="text-center font-semibold py-2 pr-3">Resultado</th>
                <th className="text-right font-semibold py-2 pr-3">Tempo</th>
                <th className="text-left font-semibold py-2">Retorno</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
              {registros.map((l) => (
                <React.Fragment key={l.id}>
                  <tr
                    className="hover:bg-stone-50 dark:hover:bg-stone-800/40 cursor-pointer"
                    onClick={() => abrir(l.id)}
                  >
                    <td className="py-2 pr-3 text-center whitespace-nowrap">{formatarDataHora(l.criado_em)}</td>
                    <td className="py-2 pr-3">{l.operacao}</td>
                    <td className="py-2 pr-3 font-mono text-[10px]">{l.chave ? formatarChave(l.chave) : '—'}</td>
                    <td className="py-2 pr-3 text-center">
                      {l.sucesso ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500 inline" />
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right">{l.duracao_ms} ms</td>
                    <td className="py-2 truncate max-w-[320px]">
                      {l.codigo_status} — {l.motivo}
                    </td>
                  </tr>

                  {aberto?.id === l.id && (
                    <tr className="bg-stone-50 dark:bg-stone-900/60">
                      <td colSpan={6} className="px-3 py-3">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                          {[
                            ['Envio', aberto.envio],
                            ['Retorno', aberto.retorno],
                          ].map(([titulo, texto]) => (
                            <div key={titulo}>
                              <div className="text-[10px] font-bold uppercase text-stone-400 mb-1">{titulo}</div>
                              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto
                                bg-white dark:bg-stone-950/60 border border-stone-200 dark:border-stone-800 rounded-lg p-2">
                                {texto || '—'}
                              </pre>
                            </div>
                          ))}
                        </div>
                        <div className="text-[11px] text-stone-500 mt-2 break-all">{aberto.url}</div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Secao>
  );
};
