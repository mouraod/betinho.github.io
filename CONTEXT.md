# Contexto canônico

Este documento fixa o vocabulário usado pelo jogo e pela documentação.

- **Etapa**: uma das 16 travessias numeradas da campanha. A Etapa 16 é o confronto final.
- **Interlúdio**: capítulo curto e obrigatório entre as Etapas 8 e 9. Seu ID é `o-rastro-de-quindim`; ele não é uma Etapa 17 e não entra no recorde.
- **Ponto de troca**: marco dourado reutilizável no cenário. Tocar nele alterna o personagem que conduz a caixa física.
- **Líder**: Betinho ou Quindim enquanto conduz o movimento, o tamanho, o salto e a entrada em túneis.
- **Pista**: objetivo sequencial do Interlúdio. Pegada, tufo dourado e latido também criam os três marcos de retorno.
- **Sombra**: inimigo ligado ao Lobo das Sombras. Sentinela, Eco e Espreita têm telegráfos e janelas de vulnerabilidade próprias.
- **Lobo das Sombras**: presença do medo no portão. Ele não é morto nem domesticado; desaparece quando a luz ocupa o caminho.

O jogo mantém `LEVELS.length === 16`. O estado ativo carrega separadamente a identidade do capítulo (`activeChapter`) e o índice da Etapa (`levelIndex`), permitindo replay do Interlúdio sem renumerar a campanha.
