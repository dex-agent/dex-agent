# Memory Home

`DEX_MEMORIA_HOME` e a raiz canonica de memoria cross-project do
`dex-memoria`.

Ela existe para impedir que um projeto crie acidentalmente pastas `global/` ou
`temas/` dentro do proprio workspace quando a memoria deveria ser reutilizavel
entre projetos.

## Resolucao

1. Se `$env:DEX_MEMORIA_HOME` existir, use esse caminho.
2. Se nao existir, use `$HOME/.agents/memories`.

No Windows, o fallback normalmente resolve para:

```text
C:\Users\<usuario>\.agents\memories
```

## Mapeamento

```text
<DEX_MEMORIA_HOME>/
  global/
    lembranca.md
    memoria.md
    conhecimento/
  temas/
    <tema>/
      lembranca.md
      memoria.md
      conhecimento/

<WORKSPACE>/
  .agents/
    lembranca.md
    memoria.md
    conhecimento/
```

## Regras

- `global` fica em `<DEX_MEMORIA_HOME>/global`.
- `tema` fica em `<DEX_MEMORIA_HOME>/temas/<tema>`.
- `projeto` fica em `<WORKSPACE>/.agents`.
- `DEX_AGENT_HOME` nao e raiz de memoria cross-project por padrao.
- `$HOME/.codex/memories` pertence ao host Codex e nao e destino padrao do
  `dex-memoria`.

## Taxonomia De Temas

Tema e dominio reutilizavel. Nao use tema como apelido de projeto, conversa,
sprint, bug isolado ou combinacao projeto-ferramenta.

Exemplos preferidos:

- `temas/deepseek`
- `temas/delphi`
- `temas/php`
- `temas/codex`

Use `temas/<area>/<tema>` apenas quando `<area>` ja for uma familia real e
repetida. Se uma captura mistura projeto e ferramenta, guarde o estado do
projeto em `<WORKSPACE>/.agents` e o aprendizado reutilizavel em
`<DEX_MEMORIA_HOME>/temas/<dominio>`.

Se um ambiente quiser usar outro local, deve configurar `DEX_MEMORIA_HOME`
explicitamente.

## Bloqueios

Antes de escrever memoria:

- se `escopo=global` e o destino esta dentro do workspace, pare;
- se `escopo=tema` e o destino esta dentro do workspace, pare;
- se `escopo=projeto` e o destino nao esta em `<WORKSPACE>/.agents`, peça
  confirmacao;
- se o destino contem `templates/`, `examples/`, logs, screenshots ou secrets,
  pare.
