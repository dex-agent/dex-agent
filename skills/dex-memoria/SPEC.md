# Spec - Dex Memoria

## 1. Objetivo

Definir um contrato operacional para memoria com ciclo de vida em projetos Dex Agent e fluxos relacionados.

O objetivo nao e "lembrar tudo". O objetivo e preservar memoria util, auditavel e recuperavel sem deixar achados resolvidos continuarem vivos como proximo passo.

`memorizador`, neste pacote, e o contrato de memorizacao do `dex-memoria`. Ele
define como lembrar, quando lembrar, quanto lembrar, por que lembrar, por quanto
tempo lembrar, quando nao lembrar, qual fonte viva vence e se existe ponteiro
global minimo a registrar.

O pacote/skill experimental antigo com esse nome foi arquivado e nao e rota
viva. O termo continua valido quando apontar para este contrato dentro do
`dex-memoria`.

## 2. Escopo

Dentro do escopo:

- classificar capturas;
- definir fonte de verdade;
- criar contratos de memoria;
- resolver, arquivar ou superseder memoria;
- separar memoria viva, ledger historico e arquivo;
- orientar integracao com Dex Agent.

Fora do escopo da V1:

- runtime do bot;
- comandos `/inbox` e `/memory`;
- escrita automatica em ledger;
- scripts `add`, `resolve`, `archive`, `status` ou `audit`;
- alteracao automatica de skills globais;
- push para repos remotos.

## 3. Conceitos

### Memoria Viva

Memoria que orienta o trabalho atual ou uma retomada operacional.

Ela deve apontar para fonte viva, criterio de resolucao e condicao de parada.

### Ledger

Historico duravel. Pode ser consultado, mas nao deve competir com `HANDOFF.md` ou `ACTIVE.md` por proximo passo.

### Arquivo

Memoria resolvida, arquivada, supersedida ou descartada. Arquivo preserva historico, mas nao reabre trabalho sozinho.

## 4. Estados Oficiais

- `ativa`
- `resolvida`
- `arquivada`
- `superseded`
- `descartada`
- `estacionada`

## 5. Campos Obrigatorios

Toda memoria operacional forte deve ter:

- `id`
- `titulo`
- `tipo`
- `estado`
- `escopo`
- `projeto`
- `origem`
- `evidencia`
- `o_que_lembrar`
- `por_que_lembrar`
- `quando_lembrar`
- `quanto_lembrar`
- `por_quanto_tempo_lembrar`
- `quando_nao_lembrar`
- `ponteiro_global_recomendado`
- `fonte_viva`
- `quem_vence_em_conflito`
- `criterio_de_resolucao`
- `proximo_dono`

## 6. Fluxo De Criacao

1. Classificar a captura.
2. Decidir se e memoria viva, ledger, arquivo, estacionamento, skill-candidate ou descarte.
3. Preencher `templates/memory-contract.md`.
4. Atualizar superficies vivas somente se a memoria realmente orientar retomada.
5. Registrar evidencia minima.
6. Declarar quando nao lembrar.
7. Se houver valor cross-project, criar apenas ponteiro global curto; o conteudo
   grande fica na fonte viva local.

## 7. Fluxo De Resolucao

1. Provar que a correcao, decisao ou fechamento aconteceu.
2. Remover ponteiros vivos.
3. Marcar historico sem virar fila viva.
4. Avisar o dono afetado quando houver.
5. Testar regressao de retomada.
6. Fechar somente quando `templates/memory-resolution-checklist.md` passar.

## 8. Criterio De Pronto Da V1

A V1 esta pronta quando:

- `SKILL.md` direciona para este contrato;
- templates permitem criar e resolver memoria sem campos ocultos;
- exemplos mostram memoria ativa, resolvida, ledger-only e handoff;
- a fronteira com Dex Agent esta documentada;
- a V1 nao promete scripts inexistentes.

## 9. Criterio De Regressao

Ha regressao se:

- ledger vencer `HANDOFF.md` em conflito operacional;
- memoria resolvida orientar proximo passo;
- a skill sugerir scripts V1 inexistentes;
- exemplos contiverem estado real sensivel;
- o pacote for confundido com o runtime do Dex Agent.

## 10. Proximo Passo

Integrar referencias a partir do `dex-agent` e das skills globais somente depois de revisar a fronteira de responsabilidade com este pacote.
