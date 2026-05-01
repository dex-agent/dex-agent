# Spec: Dex Update

## Objetivo

Padronizar a atualizacao de instalacoes Dex Agent filhas sem confundir sincronizacao do bot com trabalho de produto.

## Entrada Minima

- `ProjectRoot` ou `InstallRoot`
- `skills/dex-agent/instance.json` existente
- aliases opcionais
- flags opcionais: `Restart`, `RunTelegramTest`

## Saida Esperada

- Arquivos gerenciados reaplicados a partir do repo pai.
- `.env` preservado.
- `.runtime` preservado.
- `AGENTS.md` e `INDEX.md` atualizados por bloco Dex.
- Cards `DEX_PAI.md` e `DEX_REDE.md` atualizados.
- Registry local atualizado quando aliases forem informados.
- Status local validado.
- Com `Restart`, processo antigo encerrado antes da reaplicacao e instancia iniciada novamente depois.
- Bootstrap atualizado com regra de `dex-memoria` e processos escondidos no Windows.
- Bootstrap atualizado com regra de `dex-contatos`: perfis locais de tom por `chat_id` ficam em `.agents/CONTACTS.local.json` fora do Git.
- Bootstrap atualizado com `FINAL_ACTIONS_AUTO_OFFER=false` como padrao visivel e opt-in explicito para botoes finais automaticos.
- Token preservado sem aparecer em argumentos de processo.

## Regras

- Atualizar Dex Agent nao e mexer no produto.
- Atualizacao nao deve alterar tokens.
- Atualizacao deve usar o `.env` existente do filho como template para nao perder configuracoes locais.
- Atualizacao nao deve limpar memoria local sem contrato `dex-memoria`.
- Se houver conflito de bot username, parar e revisar `.env` ou registry.
- `Restart` deve realmente recarregar arquivos novos; parar primeiro, reaplicar arquivos sem `provision -Start` encadeado, e iniciar ao final.
- Nenhum restart/update deve deixar `cmd.exe`/PowerShell visivel como comportamento normal.
- Nao repassar token por command line em update/provision encadeado.

## Checklist De Aceite

- [ ] `instance.json` lido.
- [ ] `.env` preservado.
- [ ] `.env` contem `FINAL_ACTIONS_AUTO_OFFER=false`, salvo decisao explicita e registrada de ativar.
- [ ] `.runtime` preservado.
- [ ] `dex-memoria`, `dex-acesso`, `dex-pai`, `dex-rede`, `dex-print`, `dex-audio`, `dex-install` e `dex-update` sincronizados no filho.
- [ ] `dex-contatos` sincronizado no filho e `.agents/CONTACTS.local.json` preservado/ignorado.
- [ ] Status local passa.
- [ ] Telegram real passa quando solicitado.
