# nfeWeb

Conversão do projeto Delphi **ACBrNFe_Exemplo.dpr** (`ACBr/Exemplos/ACBrDFe/ACBrNFe/Delphi`)
para o layout, o padrão e a pilha do **b2b admin**: React 19 + Vite + Tailwind 4 no
front, Express + MySQL no back, tudo em TypeScript.

Não há DLL, ACBrMonitor nem executável externo: a emissão inteira — leitura do
certificado A1, assinatura XMLDSig, TLS mútuo, SOAP, DANFE e e-mail — roda dentro do
Node. Os fontes do ACBr entram como **referência**, não como dependência: o arquivo
de endereços dos webservices (`recursos/ACBrNFeServicos.ini`) e os schemas
(`recursos/Schemas`) são copiados de lá e podem ser atualizados a cada release do ACBr.

## Como rodar

```bash
npm install
```

1. Crie o banco e rode [`extras/nfeweb_schema.sql`](extras/nfeweb_schema.sql).
   O aplicativo nunca cria tabelas sozinho.
2. Copie `.env.example` para `.env` e preencha o acesso ao MySQL.
3. Cadastre uma linha em `nfe_empresas` (o emitente) e uma em `nfe_usuarios`
   (o login; a senha pode entrar em texto puro e é reescrita em bcrypt no primeiro acesso).

```bash
npm run dev
```

Sobe em <http://localhost:3000>. Para mudar a porta, defina `PORT`.

Build de produção:

```bash
npm run build
npm start
```

## Conferência automática

```bash
npm run teste
```

São dois roteiros, sem rede e sem banco:

- `server/nfe/autoteste.ts` — dígito da chave de acesso (conferido contra a tabela de
  pesos do `ACBrDFeUtil.GerarDigito`), CNPJ/CPF, resolução das URLs no
  `ACBrNFeServicos.ini`, construtor de XML, arredondamento monetário e soma dos totais.
- `server/nfe/autoteste-emissao.ts` — gera um certificado de teste, monta uma NF-e,
  confere a ordem dos grupos do schema, assina, valida a assinatura, adultera o XML
  para provar que a validação recusa, imprime o DANFE e gera uma NFC-e com QR-Code.

## De onde veio cada tela

| Formulário Delphi | Tela aqui |
| --- | --- |
| Configurações › Certificado | Configurações › Certificado (upload do `.pfx`, dados do titular, validade) |
| Configurações › Geral | Configurações › Geral (modelo, forma de emissão, CSC, CSRT, QR-Code) |
| Configurações › WebService + Proxy + Retorno de Envio | Configurações › WebService |
| Configurações › Emitente | Configurações › Emitente |
| Configurações › Arquivos | Configurações › Arquivos |
| Documento Auxiliar | Configurações › Documento Auxiliar |
| Email | Configurações › Email |
| Envios | Envios (nova NF-e, importar XML, transmitir, DANFE, e-mail, validar assinatura) |
| Consultas | Consultas (status do serviço, chave, recibo do lote, cadastro) |
| Eventos | Eventos (cancelamento, carta de correção, manifestação) |
| Inutilização | Inutilização |
| Distribuição DFe | Distribuição DF-e (por último NSU, NSU e chave, com manifestação na lista) |
| Respostas / XML Resposta / Log / Retorno Completo WS / Dados | Painel de respostas embaixo de cada tela, e a tela Log de Comunicação |

## Arquitetura

```
server.ts                 login, painel, Vite/SPA
server/db.ts              pool MySQL e verificação de saúde
server/config.ts          configuração do emitente (JSON em nfe_config)
server/rotas/nfe.ts       API: cada rota é um botão do formulário original
server/nfe/certificado.ts abre o .pfx com node-forge e devolve chave + certificado em PEM
server/nfe/assinatura.ts  XMLDSig: RSA-SHA1, digest SHA-1, C14N 1.0 (o perfil da NF-e)
server/nfe/soap.ts        envelope soap12 e POST com TLS mútuo
server/nfe/servicos.ts    resolve URL, namespace e SOAPAction pelo ACBrNFeServicos.ini
recursos/cadeias/         raízes confiáveis para validar o servidor da SEFAZ
server/nfe/gerarNFe.ts    monta o XML do layout 4.00 e calcula os totais
server/nfe/operacoes.ts   status, consulta, evento, inutilização, autorização, DF-e
server/nfe/danfe.ts       DANFE e DANFE NFC-e em PDF (pdfkit + bwip-js)
server/nfe/email.ts       envio do XML e do PDF por SMTP
src/                      React: Sidebar, Header, painel de respostas e as telas
```

### Decisões que valem registrar

- **Só a versão 4.00 do layout.** A 3.10 saiu de vigor; carregá-la dobraria o número de
  caminhos em cada serviço.
- **Configuração em JSON.** O conjunto de opções acompanha o `ACBrNFe.ini` e muda com
  frequência; uma coluna por opção geraria migração a cada ajuste.
- **Certificado no banco.** O servidor não depende de nada instalado na máquina, e o
  cache em memória evita reabrir o PKCS#12 a cada requisição.
- **Totais sempre recalculados** a partir dos itens, com arredondamento por notação
  exponencial — `(1.005).toFixed(2)` devolve `1.00` e isso vira rejeição 610.
- **Horário de Brasília** em `server/nfe/datas.ts`; nada usa `toISOString()`.
- **Raiz ICP-Brasil em `recursos/cadeias`.** Os webservices estaduais ficam sob a
  Autoridade Certificadora Raiz Brasileira, que não está no pacote de CAs do Node nem,
  em geral, no repositório do Windows — sem ela o handshake morre em
  `unable to get local issuer certificate`. As raízes dessa pasta **somam** às CAs
  padrão, e a verificação do servidor continua ligada: desligá-la deixaria a conexão e
  o XML assinado dentro dela abertos a interceptação. Para uma UF que exija outra raiz,
  basta jogar o `.crt` nessa pasta.

### O que ainda não está aqui

- **Validação contra os XSD** antes de transmitir. Os schemas estão em
  `recursos/Schemas`, mas não existe validador XSD em JavaScript puro — todos os que
  há dependem de binário nativo ou de Java. Por ora a rejeição vem da própria SEFAZ,
  com o código e o motivo no painel de respostas.
- **Grupos raros do layout**: exportação, comércio exterior, combustíveis, ISSQN,
  cana, ICMS UF de destino (DIFAL) e os eventos da Reforma Tributária.
- **Impressão em impressora térmica (EscPos)**: o DANFE NFC-e sai em PDF de bobina,
  não em comandos ESC/POS.
- **Contingência** (FS-DA, EPEC, offline da NFC-e) está prevista na configuração e na
  chave de acesso, mas o fluxo completo de retorno à emissão normal não foi feito.
