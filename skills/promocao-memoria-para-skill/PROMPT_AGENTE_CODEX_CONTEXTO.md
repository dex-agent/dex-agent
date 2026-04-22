Voce esta trabalhando em um sistema em que memoria e skill nao sao a mesma coisa.

Objetivo principal:
criar um mecanismo confiavel para capturar aprendizados reais da conversa e transformar o que for repetivel em habilidades recuperaveis e reutilizaveis.

Por que estamos fazendo isso:

- porque memoria so lembra
- skill ensina a executar de novo
- e o usuario nao pode precisar repetir sempre a mesma explicacao quando um processo ja foi aprendido

O problema que queremos eliminar:

- um fluxo da certo hoje
- volta daqui a alguns dias
- e o agente reaprende tudo do zero
- ou pede de novo a mesma explicacao longa

O comportamento esperado do agente e este:

1. perceber quando algo deixou de ser apenas nota ou memoria curta
2. avaliar se aquilo ja virou procedimento repetivel
3. decidir o destino correto:
   - fica so como memoria
   - vira skill de projeto
   - vira skill global
4. criar a skill no lugar certo
5. deixar facil de achar depois

Regra de promocao:
promover quando houver sinais como:

- processo com varios passos
- necessidade de reaprender
- repeticao real
- alto custo de esquecimento
- pedido explicito do usuario para transformar em habilidade

Regra de localizacao:

- skill de projeto:
  - fica dentro do repo quando depende fortemente daquele projeto
- skill global:
  - vai para o vault global quando atravessa projetos ou faz parte do jeito de operar Codex em varios repositorios

Metodo padrao:

- se a classificacao ficar obvia e forte, nao transforme isso em decisao manual do usuario
- se o caso for claramente cross-project, atualize a skill global canonica e o espelho local quando esse espelho fizer parte do contrato
- se o caso for claramente local, atualize so a skill do repo
- consulte o usuario apenas quando houver ambiguidade material sobre destino, contrato ou impacto

Sinais de "obvio e forte":

- o contrato serve para mais de um repo sem remendo conceitual
- o reuso ja aconteceu ou esta claramente implicito pelo proprio fluxo
- a recuperacao por nome, comando ou entrada canonica ficou estavel
- nao existe conflito serio entre variante local e global

Regra adicional importante:
quando uma skill global nascer do contexto operacional do Dex Agent, ela nao deve existir apenas no vault global da maquina.
ela tambem precisa manter uma copia espelhada dentro do proprio repo do Dex Agent em:

<repo-root>/skills/

Isso existe para:

- publicacao
- distribuicao
- recuperacao dentro do produto
- portabilidade para outra maquina ou outro clone sem o mesmo vault global
- protecao contra mudanca, limpeza ou ausencia futura do ambiente global

Regra de compatibilidade:

- se a copia local usar o mesmo nome da skill global, ela deve ser espelho fiel da versao canonica
- se houver comportamento especifico do Dex Agent, isso deve virar outra skill com outro nome
- nao remover o espelho local so porque a maquina atual enxerga o vault global; o repo precisa continuar recuperavel mesmo fora desse ambiente

Heuristica proativa obrigatoria:
se ficar evidente que um processo:

- teve varios passos
- precisou ser refeito
- ou provavelmente sera pedido de novo

voce deve sugerir explicitamente:

- isso quer virar skill de projeto?
- isso ja merece promocao para skill global?

Nao espere o usuario pedir a mesma coisa muitas vezes.

Resultado esperado:

- menos reexplicacao
- menos dependencia de memoria vaga
- mais habilidades localizaveis
- mais continuidade real entre conversas e projetos

Se precisar resumir a filosofia em uma frase:
memoria guarda o aprendizado; skill transforma o aprendizado em capacidade reutilizavel.
