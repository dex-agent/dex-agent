# Dex Agent Skills

Mapa das skills locais e das skills globais espelhadas que hoje fazem parte do ecossistema do `Dex Agent`.

Este arquivo e a regra viva de classificacao entre skill local do produto e skill espelhada do vault global.

Regras:

- quando uma skill global vier deste contexto e fizer parte do jeito de operar o Dex Agent, manter uma copia aqui
- a copia do repo nao substitui o vault global da maquina; ela existe para distribuicao, publicacao, recuperacao dentro do proprio projeto e portabilidade para outra maquina ou clone sem o mesmo ambiente global
- se uma skill local usar o mesmo nome de uma skill global, ela deve ser espelho fiel do vault global
- se o repo precisar de uma variante especifica do produto, ela deve ganhar outro nome em vez de divergir sob o mesmo nome
- se a classificacao entre local e global estiver obvia e forte, atualizar a casa canonica correta sem esperar nova decisao do usuario; consultar so em ambiguidade material
- nao remova o espelho do repo so porque o ambiente atual ja enxerga a skill global; o espelho protege o projeto contra drift ou ausencia futura do vault global
- quando o objetivo for reuso cross-project, a evolucao deve partir do core `src/orchestrator/reuseEngine.ts`; a UX do Telegram continua sendo apenas um adapter desse motor
- se uma acao ou evento recorrente ainda nao revelar metodo claro e contrato explicito, ele nao esta pronto para virar skill estavel; primeiro clarifique o metodo, depois o contrato, e so entao classifique o destino

Skills locais do repo:

- `dex-memoria`
- `refinador-intencao`

Skills espelhadas:

- `avaliador-memory-candidate`
- `dex-agent-audio-summary`
- `dex-pai`
- `dex-print`
- `dex-rede`
- `promocao-memoria-para-skill`

Detalhe importante:

- `skills/dex-agent-audio-summary/SKILL.md` e espelho fiel da skill global canonica; ela cobre resumo em audio e audio explicativo enviado pelo proprio bot via `Dex Agent`
- alias curto oficial dessa skill: `dex-audio`
- pedidos de audio real, nota de voz, TTS ou explicacao falada pelo bot devem ir para `dex-agent-audio-summary`; `tele-codex` nao e dona desse envio e deve encaminhar para `dex-audio` ou governanca de fluxo quando o contrato estiver ambiguo
- `skills/dex-pai/SKILL.md` e espelho fiel da skill global canonica para encaminhar achados de repos filhos ao Dex Agent pai (`codex10_bot`) com artefato local e envio por helper, sem depender de aba do Telegram Web
- `skills/dex-print/SKILL.md` e espelho fiel da skill global canonica para enviar prints/screenshot pelo Dex Agent no Telegram como `photo`/`document`, com fallback e confirmacao por `message_id`; audio continua separado em `dex-agent-audio-summary` / `dex-audio`
- `skills/dex-rede/SKILL.md` e a skill de roteamento entre projetos Dex Agent por alias (`memoria`, `controle/opusclip`, `agendador`, `dex-pai`), usando helper por API e retornando `message_id`
- `skills/dex-memoria/SKILL.md` e a skill local de contrato de ciclo de vida da memoria operacional: criar, lembrar, resolver, arquivar ou superseder memoria sem deixar achado resolvido continuar vivo como proximo passo; ela substitui o uso pratico solto de `docs/memory-system`, mas nao a documentacao tecnica de runtime; o guia de implantacao fica em `skills/dex-memoria/IMPLANTACAO.md`
- `skills/avaliador-memory-candidate/SKILL.md` e espelho fiel da skill global canonica dedicada a revisar `memory candidate` e `skill_candidate` com profundidade operacional, emitindo avancos e retrocessos via `ancora-fluxo`
- `skills/refinador-intencao/SKILL.md` e a skill local para capturas soltas ou confusas; gatilhos comuns: `guarda isso`, `isso devia virar skill`, `nao sei se isso e memoria ou skill`; use-a antes de `/remember` quando o destino ainda estiver nebuloso
- `skills/promocao-memoria-para-skill/README.md` explica a motivacao e a organizacao dessa skill
- `skills/promocao-memoria-para-skill/PROMPT_AGENTE_CODEX_CONTEXTO.md` e o prompt pronto para explicar esse sistema a outro agente Codex
- `skills/promocao-memoria-para-skill/SKILL.md` e espelho fiel da skill global canonica
