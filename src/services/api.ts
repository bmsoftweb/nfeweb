import {
  CertificadoInfo, ConfigNFe, DocumentoLista, Emitente, Meta, Painel, Retorno, StatusBanco, Usuario,
} from '../types';

let empresaId: number | null = null;

export function definirEmpresa(id: number | null) {
  empresaId = id;
}

function cabecalhos(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (empresaId) h['x-empresa-id'] = String(empresaId);
  return h;
}

async function pedir<T>(rota: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`/api${rota}`, { ...opcoes, headers: { ...cabecalhos(), ...opcoes.headers } });
  const texto = await resposta.text();

  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = { error: texto };
  }

  if (!resposta.ok) throw new Error(corpo?.error || `Falha na requisição (${resposta.status}).`);
  return corpo as T;
}

const post = <T>(rota: string, corpo?: any) =>
  pedir<T>(rota, { method: 'POST', body: JSON.stringify(corpo ?? {}) });

// ---------------------------------------------------------------------------
// Sessão e painel
// ---------------------------------------------------------------------------

export const entrar = (cnpj: string, usuario: string, senha: string) =>
  post<{ success: boolean; usuario: Usuario; empresa: Emitente }>('/login', { cnpj, usuario, senha });

export const buscarMeta = () => pedir<Meta>('/meta');
export const buscarPainel = () => pedir<Painel>('/painel');
export const buscarStatusBanco = () => pedir<StatusBanco>('/db/status');

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export const buscarConfig = () =>
  pedir<{ config: ConfigNFe; emitente: Emitente; certificado: CertificadoInfo | null }>('/config');

export const gravarConfig = (config: Partial<ConfigNFe>) =>
  pedir<{ success: boolean; config: ConfigNFe }>('/config', { method: 'PUT', body: JSON.stringify(config) });

export const gravarEmitente = (emitente: Partial<Emitente>) =>
  pedir<{ success: boolean; emitente: Emitente }>('/emitente', { method: 'PUT', body: JSON.stringify(emitente) });

export const enviarCertificado = (arquivoBase64: string, nomeArquivo: string, senha: string) =>
  post<{ success: boolean; certificado: any }>('/certificado', { arquivoBase64, nomeArquivo, senha });

export const removerCertificado = () => pedir<{ success: boolean }>('/certificado', { method: 'DELETE' });

// ---------------------------------------------------------------------------
// Operações com a SEFAZ
// ---------------------------------------------------------------------------

export const statusServico = () => post<Retorno>('/status');
export const consultarChave = (chave: string) => post<Retorno>('/consultar', { chave });
export const consultarRecibo = (recibo: string) => post<Retorno>('/consultar-recibo', { recibo });

export const consultarCadastro = (dados: { uf: string; cnpj?: string; cpf?: string; ie?: string }) =>
  post<Retorno>('/consultar-cadastro', dados);

export const gerarNFe = (documento: any) =>
  post<{ success: boolean; chave: string; totais: any; xml: string }>('/gerar', { documento });

export const enviarNFe = (dados: { chave?: string; xml?: string; sincrono?: boolean }) =>
  post<Retorno>('/enviar', dados);

export const importarXml = (xml: string) => post<{ success: boolean; chave: string }>('/importar', { xml });

export const validarAssinatura = (xml: string) =>
  post<{ valida: boolean; erro?: string }>('/validar-assinatura', { xml });

export const enviarEvento = (dados: {
  chave: string; tipoEvento: string; sequencia?: number;
  justificativa?: string; protocolo?: string; correcao?: string;
}) => post<Retorno>('/evento', dados);

export const inutilizar = (dados: {
  ano: number; modelo: string; serie: number;
  numeroInicial: number; numeroFinal: number; justificativa: string;
}) => post<Retorno>('/inutilizar', dados);

export const distribuicaoDFe = (filtro: { ultNSU?: string; nsu?: string; chave?: string }) =>
  post<Retorno>('/distribuicao', filtro);

export const enviarPorEmail = (dados: {
  chave: string; para: string; assunto?: string; mensagem?: string; anexarPdf?: boolean;
}) => post<{ success: boolean }>('/email', dados);

export const testarSmtp = () => post<{ success: boolean }>('/email/testar');

/** Abre o DANFE numa nova aba; o PDF vem do servidor, não do navegador */
export async function abrirDanfe(chave: string) {
  const resposta = await fetch('/api/danfe', {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ chave }),
  });

  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({ error: 'Falha ao gerar o DANFE.' }));
    throw new Error(erro.error);
  }

  const url = URL.createObjectURL(await resposta.blob());
  window.open(url, '_blank');
  // O objeto só pode ser liberado depois que a aba carregou
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---------------------------------------------------------------------------
// Listagens
// ---------------------------------------------------------------------------

export const listarDocumentos = () => pedir<DocumentoLista[]>('/documentos');
export const buscarDocumento = (chave: string) => pedir<any>(`/documentos/${chave}`);
export const listarEventos = () => pedir<any[]>('/eventos');
export const listarInutilizacoes = () => pedir<any[]>('/inutilizacoes');
export const listarDistribuicao = () => pedir<any[]>('/distribuicao');
export const listarLog = () => pedir<any[]>('/log');
export const buscarLog = (id: number) => pedir<any>(`/log/${id}`);
