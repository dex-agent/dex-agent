# Checklist - Memoria Em Camadas

Use este checklist antes de promover uma captura para L1/L2/L3.

## L1 - Lembranca

- [ ] `lembranca.md` tem no maximo 30 linhas uteis, salvo justificativa.
- [ ] Cada linha tem gatilho curto.
- [ ] Cada gatilho aponta para `memoria.md#ancora` ou fonte viva equivalente.
- [ ] L1 nao contem tutorial, historico longo ou dump de contexto.
- [ ] O escopo esta correto: global, tema ou projeto.
- [ ] `DEX_MEMORIA_HOME` foi resolvido quando o escopo e global ou tema.
- [ ] `global` aponta para `<DEX_MEMORIA_HOME>/global`, nao para `<WORKSPACE>/global`.
- [ ] `tema` aponta para `<DEX_MEMORIA_HOME>/temas/<tema>`, nao para `<WORKSPACE>/temas`.
- [ ] `projeto` aponta para `<WORKSPACE>/.agents`.
- [ ] Tema representa dominio reutilizavel, nao projeto, conversa ou combinacao projeto-ferramenta.
- [ ] Nome composto de tema foi revisado e justificado antes de gravar.

## L2 - Memoria

- [ ] Toda ancora apontada por L1 existe em `memoria.md`.
- [ ] Nenhuma secao L2 foi criada sem gatilho L1 ou fonte viva equivalente.
- [ ] Cada secao tem problema, mecanismo, verificacao e prevencao quando aplicavel.
- [ ] Cada secao declara quando lembrar e quando nao lembrar.
- [ ] L2 aponta para L3 quando o detalhe ultrapassa uso recorrente.

## L3 - Conhecimento

- [ ] `conhecimento/INDEX.md` existe.
- [ ] L3 foi linkada por uma ancora L2.
- [ ] Subpastas longas tem `INDEX.md` proprio quando existirem.
- [ ] L3 nao e tratada como contexto sempre carregado por padrao.

## Seguranca

- [ ] Nao ha `api_key`, token, segredo, senha, `.env`, log, screenshot ou estado real.
- [ ] Exemplos usam paths ficticios ou relativos.
- [ ] Configs mostradas sao abstratas e nao copiadas de ambiente privado.

## Veredito

- [ ] Promover para L1/L2/L3.
- [ ] Manter como memoria operacional comum.
- [ ] Registrar apenas em ledger.
- [ ] Descartar.
