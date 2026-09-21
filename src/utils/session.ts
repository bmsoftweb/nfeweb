import { Emitente, Usuario } from '../types';

/**
 * Sessão e "Lembrar neste dispositivo", no mesmo desenho do painel B2B:
 * marcado grava no localStorage, desmarcado no sessionStorage. A senha nunca
 * é guardada.
 */

const SESSAO_USUARIO = 'nfeweb_session_user';
const SESSAO_EMPRESA = 'nfeweb_session_empresa';
const LEMBRETE = 'nfeweb_lembrar_dispositivo';

export interface LembreteLogin {
  cnpj: string;
  usuario: string;
}

/** O acesso ao storage pode lançar exceção (modo privado, bloqueio de cookies) */
function seguro<T>(fn: () => T, padrao: T): T {
  try {
    return fn();
  } catch {
    return padrao;
  }
}

function lerJson<T>(chave: string): T | null {
  return seguro(() => {
    const bruto = localStorage.getItem(chave) ?? sessionStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : null;
  }, null);
}

export function lerSessao(): { usuario: Usuario | null; empresa: Emitente | null } {
  return {
    usuario: lerJson<Usuario>(SESSAO_USUARIO),
    empresa: lerJson<Emitente>(SESSAO_EMPRESA),
  };
}

export function salvarSessao(usuario: Usuario, empresa: Emitente, lembrar: boolean) {
  seguro(() => {
    const destino = lembrar ? localStorage : sessionStorage;
    const outro = lembrar ? sessionStorage : localStorage;
    destino.setItem(SESSAO_USUARIO, JSON.stringify(usuario));
    destino.setItem(SESSAO_EMPRESA, JSON.stringify(empresa));
    outro.removeItem(SESSAO_USUARIO);
    outro.removeItem(SESSAO_EMPRESA);
  }, undefined);
}

export function limparSessao() {
  seguro(() => {
    for (const s of [localStorage, sessionStorage]) {
      s.removeItem(SESSAO_USUARIO);
      s.removeItem(SESSAO_EMPRESA);
    }
  }, undefined);
}

export function lerLembrete(): LembreteLogin | null {
  return seguro(() => {
    const bruto = localStorage.getItem(LEMBRETE);
    return bruto ? (JSON.parse(bruto) as LembreteLogin) : null;
  }, null);
}

export function salvarLembrete(dados: LembreteLogin) {
  seguro(() => localStorage.setItem(LEMBRETE, JSON.stringify(dados)), undefined);
}

export function limparLembrete() {
  seguro(() => localStorage.removeItem(LEMBRETE), undefined);
}
