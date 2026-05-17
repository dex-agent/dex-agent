# Layered Memory Simulations

Data: `2026-05-15`
Status: `validacao antes de aprovacao`

Este documento registra simulacoes sanitizadas feitas a partir de uma memoria em
camadas ja usada em ambiente local. O objetivo e testar se a arquitetura
`L1 lembranca -> L2 memoria -> L3 conhecimento` realmente recupera aprendizado
ou se apenas organiza arquivos bonitos.

As simulacoes abaixo nao copiam configs privadas, tokens, logs, screenshots,
paths sensiveis ou estado real de projeto. Elas preservam apenas o aprendizado
tecnico reutilizavel.

## Criterio De Funcionamento

Uma memoria em camadas funciona quando:

1. um sintoma real dispara um gatilho L1 curto;
2. o gatilho aponta para uma ancora L2 existente;
3. L2 entrega mecanismo, verificacao e prevencao suficientes para agir;
4. L2 aponta para L3 somente quando o detalhe longo e necessario;
5. o escopo esta correto: global roteia, tema reutiliza, projeto opera.

Ha falha quando:

- L1 dispara, mas a ancora L2 nao existe;
- L2 tem conteudo sem gatilho L1;
- L3 existe sem ancora L2 que a acione;
- o aprendizado de um projeto e promovido para global sem ser cross-project;
- o arquivo cresce ate virar dump de contexto.

## Simulacao 1 - PHP: Duplicacao De Funcao

### Entrada

```text
Runtime falha com "Cannot redeclare function".
```

### Recuperacao Esperada

```text
L1: `Cannot redeclare function`
  -> procurar duplicacao em includes
  -> memoria.md#include-duplicacao

L2: #include-duplicacao
  -> explica que arquivos incluidos podem definir a mesma funcao
  -> pede busca da assinatura em todos os arquivos do dominio
  -> recomenda fonte canonica para utilitarios

L3: abrir somente se for preciso documentar include/require em detalhe.
```

### Veredito

`PASS`.

O caso recupera aprendizado real: o gatilho curto aciona uma regra operacional
que muda a acao do agente antes de editar codigo. O destino correto e `tema/php`,
nao global e nao estado vivo de projeto.

### Captura Recomendada Para Codex

```text
tema/php/lembranca.md
- `Cannot redeclare function` -> procurar duplicacao em includes -> [memoria.md#include-duplicacao]

tema/php/memoria.md
## Include E Duplicacao {#include-duplicacao}
- verificar assinatura em todos os arquivos do dominio;
- escolher uma fonte canonica para funcoes utilitarias;
- nao adicionar `function` nova sem busca previa.
```

## Simulacao 2 - PHP: Edicao Falha Por Whitespace Invisivel

### Entrada

```text
Ferramenta de edicao retorna "Search string not found".
```

### Recuperacao Esperada

```text
L1: `Search string not found`
  -> suspeitar de whitespace invisivel
  -> memoria.md#whitespace-invisivel

L2: #whitespace-invisivel
  -> explica que match exato depende do texto real em disco
  -> recomenda ler caracteres invisiveis ou reduzir o patch
```

### Veredito

`PASS COM AJUSTE`.

O aprendizado e bom, mas deve ser generalizado como `tema/ferramentas-edicao`
ou `tema/php` conforme o caso. Se ficar preso a um unico editor ou ferramenta,
vira memoria estreita demais.

### Captura Recomendada Para Codex

```text
tema/ferramentas-edicao/lembranca.md
- `Search string not found` -> verificar whitespace invisivel antes de repetir a edicao -> [memoria.md#whitespace-invisivel]
```

## Simulacao 3 - Delphi/Windows: Console Real Embutido

### Entrada

```text
App desktop tenta embutir console real em uma area visual, mas o host moderno do
terminal assume a janela.
```

### Recuperacao Esperada

```text
L1: console real embutido + host moderno do terminal
  -> memoria.md#console-real-embutido

L2: #console-real-embutido
  -> explica risco de host moderno substituir janela classica
  -> recomenda validar classe de janela e input por buffer do console
  -> marca veredito como pronto com ressalvas

L3: conhecimento/documentacao/console-real-embutido-windows.md
  -> guia longo com procedimento, riscos e checklist de validacao
```

### Veredito

`PASS`.

Este e o exemplo mais forte de L1/L2/L3: o gatilho e curto, L2 da o suficiente
para nao repetir o erro, e L3 guarda procedimento longo sob demanda. O destino
correto e `tema/delphi-windows` ou `tema/windows-console`.

### Captura Recomendada Para Codex

```text
tema/windows-console/lembranca.md
- console real embutido + host moderno do terminal -> validar superficie visual e input de console -> [memoria.md#console-real-embutido]

tema/windows-console/memoria.md
## Console Real Embutido {#console-real-embutido}
- nao assumir que a janela visual sera a classe classica do console;
- validar classe de janela antes de `SetParent`;
- preferir input por buffer do console a input global;
- tratar resize fluido como risco separado ate haver prova.
```

## Simulacao 4 - Delphi: Gatilhos Sem Ancora

### Entrada

```text
L1 contem gatilhos de erro Delphi apontando para temas como region/endregion,
interface vs implementation e end orfaos.
```

### Recuperacao Esperada

```text
L1 -> memoria.md#region-endregion
L1 -> memoria.md#interface-vs-implementation
L1 -> memoria.md#end-orfaos
```

### Resultado Observado

Alguns gatilhos apontam para ancoras que nao estavam materializadas em L2 na
amostra consultada.

### Veredito

`FAIL UTIL`.

Isso prova o valor da arquitetura: ela nao apenas organiza aprendizado, ela
tambem revela quando uma lembranca virou promessa sem memoria. Pelo principio
`memoria sem lembranca e entulho`, o inverso tambem vale operacionalmente:
lembranca sem ancora vira alarme sem procedimento.

### Acao Recomendada Antes De Promover Para Codex

Nao importar esses gatilhos como aprovados. Primeiro criar L2 para cada ancora:

```text
tema/delphi/memoria.md
## Region Endregion {#region-endregion}
## Interface Vs Implementation {#interface-vs-implementation}
## End Orfaos {#end-orfaos}
```

Depois ligar L1 a essas ancoras e validar.

## Simulacao 5 - Principio Global

### Entrada

```text
memoria sem lembranca = entulho
```

### Recuperacao Esperada

```text
<DEX_MEMORIA_HOME>/global/lembranca.md
  -> quando for criar memoria detalhada, exigir gatilho L1 ou fonte viva

<DEX_MEMORIA_HOME>/global/memoria.md
  -> explicar o criterio: L2 sem gatilho tende a nao ser recuperada
```

### Veredito

`PASS COMO GLOBAL MINIMO`.

Este principio muda o comportamento em qualquer tema. Ele pode ir para global,
mas como ponteiro curto. A explicacao longa deve ficar em `dex-memoria` ou em
uma fonte viva de governanca.

## Resultado Da Simulacao

A arquitetura funciona, mas somente se houver validacao de integridade.

Achados:

- PHP mostrou recuperacao boa em L1 -> L2.
- Delphi/Windows mostrou recuperacao completa L1 -> L2 -> L3.
- Delphi tambem mostrou que L1 pode ficar inconsistente se as ancoras L2 nao
  forem mantidas.
- A decisao `global roteia, tema reutiliza, projeto opera` evita promover
  detalhe local como memoria global.

## Recomendacao

Aprovar a arquitetura com uma condicao:

```text
Nenhum pacote L1/L2/L3 deve ser considerado pronto sem validar:
- links L1 -> L2;
- ancoras L2 existentes;
- L3 acionada por L2;
- escopo correto: global, tema ou projeto;
- ausencia de secrets e estado privado.
```

Para capturar conhecimento gerado em outro agente para Codex, use este fluxo:

1. extrair apenas o aprendizado reutilizavel;
2. remover paths privados, nomes de projeto sensiveis, tokens e logs;
3. decidir escopo (`global`, `tema`, `projeto`);
4. criar ou atualizar L1;
5. criar ou atualizar L2 com ancoras;
6. mover detalhe longo para L3;
7. rodar checklist de integridade;
8. so entao considerar o aprendizado aprovado.
