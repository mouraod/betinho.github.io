# Betinho — O caminho de casa

Jogo de plataforma em Canvas e JavaScript puro. Betinho e Quindim se afastam de casa e atravessam a serra e o bosque para voltar à luz do portão.

## Jogar localmente

Nesta pasta, execute `python3 -m http.server 8743` e abra http://localhost:8743. Não há dependências ou build.

## Estrutura da aventura

São 16 Etapas numeradas e um Interlúdio obrigatório entre as Etapas 8 e 9. O Interlúdio, **O rastro de Quindim**, pede três pistas sequenciais — pegada, tufo dourado e latido — e cria um marco de retorno a cada descoberta. O Lobo das Sombras protege o portão na Etapa 16; ele se dissolve na luz quando o medo é atravessado.

Cada Etapa tem cartão narrativo que pausa a simulação até confirmação. A direção visual acompanha a jornada: luz quente, entardecer, ruptura na entrada do bosque, noite densa no resgate e luzes da vila. O HUD mostra o avanço, o Líder e a disponibilidade do dash.

## Movimentos

| Ação | Teclado | Controle Xbox | Toque | Função |
|---|---|---|---|---|
| Mover | Setas | Direcional / analógico | ◀ ▶ | Posicionamento |
| Pulo duplo | ↑ / Espaço | A / B | A | Soltar e apertar outra vez no ar |
| Dash na plataforma | X / Shift | X | X | Distância e ataque horizontal |
| Mergulho | ↓ no ar | Direcional ↓ no ar | ▼ | Impacto em área; 2 de dano por cima no chefe |
| Planar | Segurar pular com a pena | Segurar A / B com a pena | Segurar A | Controlar a descida |
| Trocar o Líder | Tocar um ponto TROCA | — | Tocar o ponto TROCA | Alterna entre Betinho e Quindim |
| Entrar no túnel | ↓ na entrada | Direcional ↓ | ▼ na entrada | O Líder menor passa nos espaços menores |
| Soco na arena | Z | B | B | 1 de dano, curto alcance |
| Chute na arena | Y | Y | Y | 2 de dano, maior alcance |
| Esquiva na arena | X / Shift | X | X | Breve invulnerabilidade |
| Pausa | P / Esc | Start | Ⅱ | Menu, assistência e guia contextual |

O chefe fica vulnerável depois de errar; bater na parede torna o próximo golpe recebido duas vezes mais forte. A investida tem aviso antes do avanço. Cada confronto tem duas vitórias necessárias, com maior velocidade na segunda parte.

## Pausa e progressão

O menu aceita mouse, toque, Tab, setas e gamepad. No iPad, os controles aparecem automaticamente sobre o jogo e funcionam com múltiplos dedos; o modo paisagem é recomendado. Permite continuar, reiniciar a Etapa, alternar som, vidas infinitas e proteção contra quedas, ou voltar ao título. Reiniciar e sair exigem confirmação dentro do jogo, com Cancelar selecionado inicialmente. Os cartões narrativos e cenas têm confirmação própria, ficam visíveis indefinidamente e ignoram qualquer confirmação durante o primeiro segundo.

Decisões definidas com Davi:

- O desafio vem da precisão nos pulos e domínio dos movimentos.
- Cada nova sessão começa na fase 1; o recorde é informativo.
- Game Over reinicia a Etapa atual com três vidas, zerando moedas e checkpoints da tentativa. No Interlúdio, volta ao último marco de pista; o replay retorna ao título quando concluído ou abandonado.
- Perder uma vida durante a tentativa mantém o retorno ao checkpoint.
- Sair da janela pausa a partida e solta os comandos; voltar não retoma automaticamente.

## Verificação e arquivos

Execute `node --test tests/input.test.cjs`. A suíte cobre entradas, pausa, confirmação, progressão nas 16 fases, dano real dos golpes, separação dos botões, travessia dos novos vãos e encerramento do chefe. Os vãos são simulados sem inimigos para verificar a geometria separadamente do combate. Os testes não substituem uma partida completa nem testes com controle físico.

`game.js` contém simulação, capítulos e renderização. `ui.js` integra o menu HTML com os estados do jogo. `style.css` cuida da moldura e da pausa. Para abrir uma Etapa no desenvolvimento, use `?fase=N` (1 a 16); use `?fase=bonus` para abrir O rastro de Quindim. O replay do Interlúdio aparece no título depois da primeira conclusão e fica salvo em `localStorage`.

Os termos canônicos ficam em [CONTEXT.md](CONTEXT.md) e a decisão estrutural dos personagens em [docs/adr/0001-personagens-distintos-e-pontos-de-troca.md](docs/adr/0001-personagens-distintos-e-pontos-de-troca.md).
