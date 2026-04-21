# Dex Agent Skills

Mapa das skills locais e das skills globais espelhadas que hoje fazem parte do ecossistema do `Dex Agent`.

Regras:

- quando uma skill global vier deste contexto e fizer parte do jeito de operar o Dex Agent, manter uma copia aqui
- a copia do repo nao substitui o vault global da maquina; ela existe para distribuicao, publicacao e recuperacao dentro do proprio projeto
- se uma skill local usar o mesmo nome de uma skill global, ela deve ser espelho fiel do vault global
- se o repo precisar de uma variante especifica do produto, ela deve ganhar outro nome em vez de divergir sob o mesmo nome
- quando o objetivo for reuso cross-project, a evolucao deve partir do core `src/orchestrator/reuseEngine.ts`; a UX do Telegram continua sendo apenas um adapter desse motor

Skills locais do repo:

- `dex-agent-audio-summary`

Skills espelhadas:

- `promocao-memoria-para-skill`

Detalhe importante:

- `skills/dex-agent-audio-summary/SKILL.md` e uma skill local do repo, com comandos e contrato especificos do runtime do `Dex Agent`
- `skills/promocao-memoria-para-skill/README.md` explica a motivacao e a organizacao dessa skill
- `skills/promocao-memoria-para-skill/PROMPT_AGENTE_CODEX_CONTEXTO.md` e o prompt pronto para explicar esse sistema a outro agente Codex
- `skills/promocao-memoria-para-skill/SKILL.md` e espelho fiel da skill global canonica
