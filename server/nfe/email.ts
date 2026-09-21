/**
 * Envio da NF-e por e-mail — o "Enviar NFe Email" do exemplo, que lá era o
 * ACBrMail. O XML vai sempre anexado; o PDF do DANFE, quando gerado.
 */
import nodemailer from 'nodemailer';
import { ConfigEmail } from '../config';
import { paraBR } from './datas';

export interface Anexo {
  nome: string;
  conteudo: Buffer | string;
  tipo?: string;
}

export interface PedidoEmail {
  para: string | string[];
  copia?: string[];
  assunto?: string;
  mensagem?: string;
  anexos?: Anexo[];
  /** Valores para os marcadores {numero}, {chave} etc. do texto configurado */
  variaveis?: Record<string, string>;
}

/** Troca {numero}, {chave}, {dataEmissao}, {razaoSocial}... pelo valor */
function aplicarVariaveis(texto: string, variaveis: Record<string, string> = {}): string {
  return texto.replace(/\{(\w+)\}/g, (_todo, nome) => variaveis[nome] ?? '');
}

export async function enviarEmail(config: ConfigEmail, pedido: PedidoEmail): Promise<{ messageId: string }> {
  if (!config.host) {
    throw new Error('O servidor SMTP não está configurado (Configurações › Email).');
  }

  const porta = Number(config.porta) || (config.ssl ? 465 : 587);
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: porta,
    secure: config.ssl || porta === 465,
    requireTLS: config.tls && !config.ssl,
    auth: config.usuario ? { user: config.usuario, pass: config.senha } : undefined,
  });

  const variaveis = {
    dataEnvio: paraBR(new Date()),
    ...pedido.variaveis,
  };

  const info = await transporte.sendMail({
    from: config.remetente || config.usuario,
    to: pedido.para,
    cc: pedido.copia,
    subject: aplicarVariaveis(pedido.assunto || config.assunto, variaveis),
    text: aplicarVariaveis(pedido.mensagem || config.mensagem, variaveis),
    attachments: (pedido.anexos || []).map((a) => ({
      filename: a.nome,
      content: a.conteudo,
      contentType: a.tipo,
    })),
  });

  return { messageId: info.messageId };
}

/** Testa as credenciais sem disparar mensagem (botão "Testar conexão") */
export async function testarSmtp(config: ConfigEmail): Promise<void> {
  const porta = Number(config.porta) || (config.ssl ? 465 : 587);
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: porta,
    secure: config.ssl || porta === 465,
    requireTLS: config.tls && !config.ssl,
    auth: config.usuario ? { user: config.usuario, pass: config.senha } : undefined,
  });
  await transporte.verify();
}
