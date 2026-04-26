# Implantacao Operacional - Dex Memoria V1

Atualizado em: `2026-04-26`
Status: `v1 operacional - sem scripts automaticos`
Owner: `Dex Agent pai`

## Objetivo

Implantar `dex-memoria` como contrato padrao para memoria operacional no Dex Agent pai e nos projetos filhos.

O alvo da V1 e simples:

- ensinar quando usar `dex-memoria`;
- padronizar a classificacao de capturas;
- impedir memoria resolvida de orientar proximo passo;
- separar bug do pai, handoff entre filhos, ledger, estacionamento e descarte;
- manter scripts automaticos fora do corte.

## Onde A Skill Vive

No repo pai:

```text
C:\CodexProjetos\dex-agent\skills\dex-memoria\
```

Em uma instalacao de filho:

```text
<repo-filho>\skills\dex-agent\skills\dex-memoria\
```

Regra:

- o repo pai guarda a fonte versionavel;
- filhos recebem a skill pela instalacao/sincronizacao do Dex Agent;
- o filho nao deve depender do vault global da maquina para conhecer este contrato.

## Quando Chamar `dex-memoria`

Chame `dex-memoria` quando uma captura puder virar:

- memoria viva;
- ledger-only;
- estacionamento;
- descarte;
- skill-candidate;
- achado a enviar para `dex-pai`;
- handoff para outro filho via `dex-rede`.

Nao chame `dex-memoria` para:

- conversa trivial;
- comando tecnico simples;
- pergunta que nao precise sobreviver;
- resumo sem consequencia operacional;
- script automatico de memoria, porque a V1 nao tem scripts.

## Fluxo De Decisao Rapido

```text
Captura chegou
-> orienta proximo passo agora?
   sim -> memoria viva
   nao -> e aprendizado duravel?
      sim -> ledger-only
      nao -> e residuo util fora do corte?
         sim -> estacionamento
         nao -> descartar
-> envolve bug do Dex Agent pai?
   sim -> dex-pai
-> envolve outro filho?
   sim -> dex-rede
```

## Tabela De Decisao

| Sinal                                                          | Veredito          | Destino                                                                 |
| -------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| Afeta proximo passo atual                                      | `memoria viva`    | `INDEX.md`, `.agents/HANDOFF.md`, `.agents/ACTIVE.md` ou artefato ativo |
| E regra/aprendizado reutilizavel, mas nao muda o proximo passo | `ledger-only`     | `.agents/MEMORY.ndjson` ou candidate de memoria                         |
| E util, mas lateral ao corte atual                             | `estacionamento`  | `.agents/ESTACIONAMENTO.md` ou equivalente local                        |
| Nao tem evidencia ou custo de esquecimento                     | `descarte`        | sem persistencia forte                                                  |
| E metodo recorrente com contrato possivel                      | `skill-candidate` | fluxo de promocao de skill                                              |
| Achado pertence ao motor do Dex Agent pai                      | `dex-pai`         | artefato local + helper de envio ao pai                                 |
| Conteudo deve ir de um filho para outro                        | `dex-rede`        | artefato local + helper de envio ao filho destino                       |

## Regras Para O Dex Pai

O Dex pai usa `dex-memoria` para:

- classificar achados vindos dos filhos;
- decidir se o achado fica vivo no pai ou apenas historico;
- exigir evidencia antes de chamar algo de resolvido;
- avisar o filho quando o problema relatado foi corrigido;
- impedir que `MEMORY.ndjson` reabra um problema ja fechado em `HANDOFF.md`.

Checklist do pai:

- [ ] Ler `skills/dex-memoria/SKILL.md`.
- [ ] Ler `skills/dex-memoria/SPEC.md` quando houver duvida.
- [ ] Preencher `templates/memory-contract.md` para memoria operacional.
- [ ] Usar `templates/memory-resolution-checklist.md` ao resolver.
- [ ] Se veio de filho e era bug do pai, avisar via `dex-pai` ou `dex-rede` conforme o contrato local do envio.
- [ ] Registrar `message_id` quando houver envio por Telegram/API.

## Regras Para Projetos Filhos

O filho usa `dex-memoria` para decidir o destino de uma captura antes de salvar ou encaminhar.

Checklist do filho:

- [ ] Classificar a captura antes de escrever memoria forte.
- [ ] Se for problema local, manter no proprio filho.
- [ ] Se for bug do Dex Agent pai, criar artefato local e usar `dex-pai`.
- [ ] Se for handoff para outro filho, criar artefato local e usar `dex-rede`.
- [ ] Se for aprendizado sem proximo passo, tratar como ledger-only.
- [ ] Se for residuo fora do corte, estacionar.
- [ ] Se nao houver evidencia, descartar ou refinar antes de promover.

## `dex-pai` Vs `dex-rede`

Use `dex-pai` quando:

- o problema for do motor do Dex Agent;
- o filho encontrou bug no pai;
- o achado precisa subir para `C:\CodexProjetos\dex-agent`;
- o pai precisa investigar ou corrigir causa raiz.

Use `dex-rede` quando:

- o conteudo precisa ir de um filho para outro;
- `MemoriaGeral` precisa mandar material para `ControlePessoal`;
- `Agendador` precisa avisar outro filho;
- o destino e um alias de projeto filho.

Exemplo:

```text
Bug no recall operacional do Dex Agent -> dex-pai
Conteudo do Obsidian para OpusClip no ControlePessoal -> dex-rede
```

## Prompt Curto Para Ensinar Um Filho

```text
Use dex-memoria para classificar esta captura antes de salvar, lembrar ou encaminhar.

Responda:
- veredito: memoria viva | ledger-only | estacionamento | descarte | skill-candidate;
- fonte de verdade;
- quando lembrar;
- quando nao lembrar;
- proximo destino: local | dex-pai | dex-rede | nenhum.

Regras:
- HANDOFF.md manda no proximo passo seguro;
- ACTIVE.md manda no objetivo vivo e loops abertos;
- MEMORY.ndjson e ledger, nao fila viva;
- memoria resolvida nao orienta proximo passo;
- bug do pai usa dex-pai;
- handoff entre filhos usa dex-rede.
```

## Teste Manual Controlado

Envie para um filho:

```text
Use dex-memoria.

Classifique esta captura:
"O bot respondeu uma pendencia antiga como proximo passo, mas o achado ja foi resolvido no Dex pai."

Responda com:
- veredito;
- fonte de verdade;
- quando lembrar;
- quando nao lembrar;
- proximo destino.
```

Resposta esperada:

```text
Veredito: resolvida ou ledger-only, nao memoria viva.
Fonte de verdade: HANDOFF.md se houver conflito.
Quando lembrar: apenas como historico ou regressao nova.
Quando nao lembrar: retomada normal depois da resolucao.
Proximo destino: nenhum, salvo se aparecer evidencia de regressao.
```

## Checklist Visual De Implantacao

Pai:

- [ ] `skills/dex-memoria` existe.
- [ ] `skills/README.md` lista `dex-memoria`.
- [ ] `SKILL.md` aponta para `SPEC.md`.
- [ ] `IMPLANTACAO.md` explica pai e filhos.
- [ ] Templates existem.
- [ ] Exemplos existem.
- [ ] V1 declara ausencia de scripts.

Filhos:

- [ ] Skill sincronizada em `<repo-filho>\skills\dex-agent\skills\dex-memoria\`.
- [ ] Prompt curto ensinado ao operador/agente.
- [ ] Teste manual controlado executado.
- [ ] Resultado classifica memoria resolvida como nao viva.
- [ ] Rota `dex-pai` e `dex-rede` nao se confundem.

## Criterio De Pronto

A implantacao V1 esta pronta quando:

- pai e filhos conseguem localizar `dex-memoria`;
- um filho consegue classificar captura usando o prompt curto;
- memoria resolvida nao vira proximo passo;
- `HANDOFF.md` vence `MEMORY.ndjson` em conflito;
- nenhum script automatico foi criado.

## Criterio De Regressao

Falhou se:

- memoria resolvida aparecer como proximo passo;
- filho usar `dex-rede` para bug do pai;
- filho usar `dex-pai` para handoff entre filhos;
- ledger vencer `HANDOFF.md`;
- uma memoria operacional nao tiver `quando_nao_lembrar`;
- algum script V1 tentar escrever memoria automaticamente.

## Fora Do Corte V1

- scripts `add`, `resolve`, `archive`, `status`, `audit`;
- migracao de memorias antigas;
- mudanca no runtime;
- mudanca em `memoryRecallEngine`;
- UX nova de botoes Telegram.
