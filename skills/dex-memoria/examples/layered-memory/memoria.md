# Example - L2 Memoria

> Exemplo sanitizado. Esta camada detalha as ancoras apontadas por L1.

Escopo: `tema`.

## Include E Duplicacao {#include-duplicacao}

### Problema

Um runtime falha quando a mesma funcao e definida em mais de um arquivo
carregado por include ou require.

### Mecanismo

Arquivos incluidos podem ser carregados em ordem diferente da esperada. Se uma
funcao ja foi definida, redefini-la causa falha em tempo de execucao.

### Verificacao

```text
buscar a assinatura da funcao em todos os arquivos do dominio
confirmar qual arquivo deve ser a fonte canonica
```

### Prevencao

- manter uma fonte canonica para funcoes utilitarias;
- verificar duplicacao antes de adicionar funcao nova;
- preferir carregamento explicito e documentado.

### Quando Lembrar

- erro de redefinicao;
- refatoracao que move funcao entre arquivos;
- adicao de funcao utilitaria em projeto com includes.

### Quando Nao Lembrar

- codigo sem includes ou sem funcoes globais;
- falha causada por autoload, pacote ou namespace diferente.

### Conhecimento Sob Demanda

- [conhecimento/INDEX.md](conhecimento/INDEX.md)

## Whitespace Invisivel {#whitespace-invisivel}

### Problema

Uma edicao textual falha porque o trecho buscado parece igual na leitura, mas o
arquivo contem espacos, tabs ou quebras invisiveis.

### Mecanismo

Ferramentas de edicao por match exato dependem do texto real em disco, nao da
representacao visual exibida em uma leitura curta.

### Verificacao

```text
ler o trecho com representacao de caracteres invisiveis
comparar bytes ou usar uma substituicao mais estreita
```

### Prevencao

- preferir patch pequeno;
- verificar o trecho real antes de substituir;
- evitar reescrever arquivo inteiro sem necessidade.

### Quando Nao Lembrar

- edicao feita por parser estruturado;
- arquivo recem-formatado com whitespace conhecido.

## Detalhe Sob Demanda {#detalhe-sob-demanda}

### Problema

Memoria detalhada demais polui o contexto e reduz a chance de recuperar o ponto
certo na hora certa.

### Mecanismo

L1 deve disparar, L2 deve explicar o suficiente para agir, e L3 deve guardar o
detalhe longo que so importa quando a investigacao pede profundidade.

### Verificacao

```text
se a secao L2 virou tutorial, mover o tutorial para conhecimento/
```

### Prevencao

- manter L1 curta;
- manter L2 operacional;
- mover exemplos longos, tutoriais e modelos para L3.

### Conhecimento Sob Demanda

- [conhecimento/INDEX.md](conhecimento/INDEX.md)
