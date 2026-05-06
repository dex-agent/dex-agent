# Contrato Operacional - Condicao Acao Execucao Retorno

Data: `2026-04-27`
Status: `ativo`
Projeto: `dex-memoria`
ID: `contrato.operacional.condicao-acao-execucao-retorno`
Tipo: `regra`
Escopo: `cross-project`
Origem: canonizacao do metodo operacional condicao-acao-execucao-retorno no pacote dex-memoria

## Veredito

Contrato documental ativo.

Este contrato deve orientar proximos pedidos que envolvam teste real, replay, bug, contrato, sprint, condicao, gatilho, resultado inesperado, decisao de mudanca ou veredito operacional.

## Ideia Base

Toda execucao importante deve seguir o modelo:

```text
CONDICAO -> ACAO -> LER CONTRATO -> EXECUTAR -> RESULTADO/RETORNO
```

## Clausulas

### 1. Condicao

Antes de executar, identificar qual condicao acionou a acao.

Pergunta obrigatoria:

```text
Esta condicao deveria acionar esta acao agora?
```

### 2. Acao

Identificar a acao pretendida e o risco dela.

Pergunta obrigatoria:

```text
A acao chamada e a correta para esta condicao?
```

### 3. Ler Contrato

Antes da execucao, localizar ou criar um contrato com ID claro.

Perguntas obrigatorias:

```text
Qual e o ID do contrato?
Onde ele esta?
Quais clausulas importam para esta execucao?
Quem vence se houver conflito?
```

### 4. Executar

Executar apenas o que o contrato autoriza.

Perguntas obrigatorias:

```text
A execucao seguiu as clausulas?
Houve desvio de setup, ferramenta, conversa, estado ou ambiente?
```

### 5. Resultado/Retorno

Separar resultado ruim de resultado correto conforme contrato.

Perguntas obrigatorias:

```text
O resultado esta errado?
Ou o resultado esta correto conforme o contrato?
O problema real e que o contrato certo foi acionado pela condicao errada?
```

## Clausulas De Lembranca

- `o_que_lembrar`: usar o modelo `CONDICAO -> ACAO -> LER CONTRATO -> EXECUTAR -> RESULTADO/RETORNO` antes de executar ou diagnosticar trabalho importante.
- `por_que_lembrar`: muitos erros do projeto podem nascer de gatilho errado, contrato errado, execucao errada ou interpretacao errada do retorno.
- `quando_lembrar`: teste real, replay, bug, contrato, sprint, condicao, gatilho, resultado inesperado, decisao de mudanca ou veredito operacional.
- `quanto_lembrar`: regra curta + ID do contrato + perguntas obrigatorias; nao recontar a historia inteira.
- `como_usar_depois`: antes de executar, localizar o contrato certo; se houver falha, diagnosticar em qual etapa ela ocorreu.
- `quando_nao_lembrar`: tarefas triviais, texto simples, consulta sem execucao, ou quando o usuario pedir resposta direta sem contrato.

## Fonte De Verdade

- `fonte_viva`: `contracts/CONTRATO_OPERACIONAL_CONDICAO_ACAO_EXECUCAO_RETORNO.md`
- `camada`: `viva`
- `quem_vence_em_conflito`: a fonte viva do projeto consumidor vence para proximo passo seguro; este contrato vence apenas como metodo de execucao/diagnostico quando aplicavel.
- `ledger`: ledger local do projeto consumidor, quando existir, registra a existencia, mas nao vira fila viva.

## Ciclo De Vida

- `criterio_de_resolucao`: o metodo for substituido por contrato operacional melhor, skill madura ou regra mais especifica aprovada.
- `arquivamento`: mover para o arquivo canonico adotado pelo projeto consumidor quando superseded.
- `supersedes`: nenhum.
- `proximo_dono`: papel de planejamento para aplicar em recorte; papel de teste para aplicar em teste real; papel de veredito para validar resultado.
- `data_de_revisao`: `2026-05-27`

## Saida Esperada Ao Usar

```text
Contrato: <id>
Condicao: <gatilho observado>
Acao: <acao pretendida>
Execucao: <o que foi feito>
Resultado/Retorno: <o que voltou>
Diagnostico: condicao errada | acao errada | contrato errado | execucao errada | resultado errado | resultado correto conforme contrato
Proximo passo: <acao minima>
```
