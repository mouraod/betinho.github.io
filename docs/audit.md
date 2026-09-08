# Auditoria técnica e de design — Betinho, o caminho de casa

Auditoria feita em set/2025 sobre `game.js` (4.040 linhas), `ui.js`, HTML/CSS e as
duas suítes de teste (20 testes verdes). Nenhuma reescrita foi feita durante a
auditoria; este documento é o projeto de referência para as mudanças seguintes.

**Decisões que são baratas AGORA e caras DEPOIS:**

1. **Matar as três cópias do passo de física do jogador.** Plataforma
   (`updatePlaying`), interlúdio (`updateInterlude`) e arena (`updateFight`) têm
   cada uma sua cópia de ~100–200 linhas de mover/pular/pulo-duplo/dash/mergulho/
   planar. As cópias **já divergiram** (regra de squash de aterrissagem e cooldown
   do dash diferem entre modos). Corrida virará uma quarta cópia, e todo ajuste de
   "feel" vira uma edição em 4 lugares em que a divergência silenciosa é o padrão.
2. **Transformar "qual capítulo/fase/modo roda em seguida" de índices fixos numa
   lista ordenada de marcos.** A história hoje é ligada com números mágicos:
   completar a fase de índice 7 dispara a cena de separação, a cena de reencontro
   chama `beginStage(8, ...)`, a fase 15 é especial como luta, `LEVELS.length` é o
   check de vitória, inimigos sombra são injetados em `LEVELS[8..14]` por faixa de
   índice e `LEVEL_MUSIC[14]`/`[15]` são trocados após definição porque os arrays
   são indexados por posição.
3. **Consolidar as 5 chaves soltas de `localStorage` num único objeto versionado.**
   Cinco chaves hoje, migração barata; corrida precisa de melhores tempos e
   desbloqueios, e schema de localStorage sem versão é o clássico "ok agora,
   migração depois".
4. **Centralizar o despacho de modos.** Hoje cada modo exige edições em ~10 lugares
   espalhados (`loadLevel`, `updatePlaying`, `setKey`, `pollGamepad`, `moveGuide`,
   `syncGameUI`, layout de toque, `render`, cópia da pausa). Um registro de modos
   de ~25 linhas transforma "adicionar corrida" em uma chamada de registro em vez
   de mais um caso especial em 10 pontos.

---

## 1. Arquitetura

**O que o código realmente é.** Um único `game.js` de 4.040 linhas: `let` globais
no nível de módulo para todo o estado do mundo (`enemies`, `coins`, `checkpoints`,
`movers`, `tunnels`, `exchangePoints`, `particles`...), um `player` e `companion`
globais, enum `STATE` com uma cadeia gigante de if/else no `frame()` mais um
`switch` paralelo no `render()`, e um loop de passo fixo no topo (acumulador de
1000/60, `dt` limitado a 250 ms). A geometria das fases já é genuinamente
orientada a dados: 16 objetos `makeLevel({...})` com helpers minúsculos
`rect()`/`coin()`. Esta é uma base *boa* para um jogo pequeno — plana, legível,
sem build, sem dependências.

**Problemas estruturais inofensivos hoje, dolorosos na escala "16 fases + 3 modos":**

| Problema | Por que dói depois | Veredito |
|---|---|---|
| Passo do jogador duplicado em 3 funções de update | Todo ajuste de feel é editado N vezes; divergência já visível | **Corrigir antes da corrida** |
| Ramificação de modo espalhada por ~10 arquivos/funções (`bonusActive`, `lv.type==="fight"`, checks de índice) | Cada modo novo multiplica pontos de ramificação | **Corrigir antes da corrida** |
| Ordem da história fixada como mágica de índice (7, 8, 15, `LEVELS.length`) | Reordenar/inserir conteúdo ou modos quebra silenciosamente | **Corrigir antes da corrida** (pequeno) |
| Resets de estado feitos à mão em 6 lugares (`loadLevel`, `loseLife`, respawn por queda, `initFight`, `resetRoundHP`, transição de túnel) | Resets já omitem campos de forma inconsistente; modo novo precisa de um 7º | Corrigir junto com a unificação do passo |
| Arrays paralelos indexados por posição (`PATROL_SPEED`, `CHASE_SPEED`, `LEVEL_MUSIC`, `JOURNEY`) + paletas por faixa de `levelIndex` | Qualquer fase inserida/reordenada os dessincroniza; o swap de `LEVEL_MUSIC[14]/[15]` é a prova | **Deveria corrigir** — dobrar no config da fase |
| `lv.sky`/`lv.hill` existem em todas as fases mas **nunca são lidos** — o tema vem de `sceneryPalette()` por faixa de índice | Duas fontes de verdade; uma pista de corrida não escolhe paleta sem truque de índice | Corrigir junto com o config da fase |
| 11 arrays mutáveis "da fase atual" no nível de módulo | Estado do modo A vaza para o modo B se um caminho de reset for esquecido | Corrigir via função de entrada do marco/modo |
| Posições das pistas do interlúdio fixas dentro de `startInterlude()` | Conteúdo de progressão escondido em código | Corrigir enquanto se mexe no arquivo |

**As partes genuinamente boas** (proteger): o loop de passo fixo com acumulador; a
entrada por flags de borda limpas centralmente no fim do frame; o DSL de dados de
fase; o objeto `Sound` de áudio sintetizado; a decisão de performance do canvas em
540p com escala CSS; o sistema de pausa/confirmação/assistência; o harness de
testes em vm com DOM falso.

**A arquitetura atual aguenta plataforma + luta + corrida?** Sim, desde que "modo"
deixe de ser expresso como condicionais espalhadas. A abstração concreta e pequena
que se paga: um registro de modos + lista de marcos da campanha + uma função de
passo compartilhada:

```js
// um passo, parametrizado pelo ambiente — substitui as 3 cópias
function stepPlayer(p, rules, env) { /* mover, pular, dash, mergulho, planar, colidir */ }
// rules = { moveSpeed, dash:{frames,cooldown,speed,invuln?}, canJump, canDoubleJump,
//           canPound, canFeather, gravity, maxFall, groundY?, bounds, invulnOnDash }
```

e, para o despacho:

```js
const MODES = {
  platform: { update: updatePlatform, render: drawWorld, hud: ..., guide: ... },
  fight:    { update: updateFight,    render: drawWorld, ... },
  race:     { update: updateRace,     ... },   // modo novo = linha nova
};
// campanha = marcos ordenados em vez de mágica de índice:
const CAMPAIGN = [
  { kind: "stage", level: 0 }, ... { kind: "stage", level: 7 },
  { kind: "interlude" }, { kind: "stage", level: 8 }, ..., { kind: "fight", level: 15 },
];
```

~50 linhas de mudança estrutural total, incrementais, no estilo plano atual.
**Sem ECS, sem framework, sem TypeScript, sem classes por entidade, sem build** —
nenhum deles se paga nesse escopo. O estilo de função plana não é o problema; a
*duplicação* e o *despacho espalhado* são.

---

## 2. Arquitetura de modos de jogo

**O que deve ser genuinamente compartilhado** (já é — manter):

- O loop de passo fixo e a temporização por frames.
- O estado virtual de entrada + flags de borda (`keys`/`pad`/`touch` →
  `left/right/jump/down/dash` + flags de um disparo). Esta já é a costura certa —
  corrida mapeia *para os mesmos botões virtuais*.
- A física AABB e, crucialmente, **a sensação de movimento**. A luta já prova a
  tese: pular/pulo-duplo/dash/mergulho são os mesmos verbos numa arena diferente,
  e a luta contra o chefe parece Betinho por causa disso. Corrida deve manter esses
  verbos contra o relógio.
- A identidade do personagem (`player.form`, troca de líder) e a apresentação;
  lógica de câmera; a infraestrutura de pausa/HUD/narrativa; `Sound`; partículas; a
  gramática de dados de fase (`solids`/`enemies`/`pickups`); persistência.

**O que deve permanecer deliberadamente independente:** a máquina de estados
lógica de cada modo (FSM do chefe, sequência de pistas do interlúdio, tempo/voltas/
resultado da corrida), seus *bindings* de entrada (uma tabela por modo
`ação → botões virtuais`, substituindo os ternários `inFight ? … : …` de
`setKey`/`pollGamepad`/toque), suas adições de HUD e suas transições.

**A abstração que permite um *quarto* modo inesperado sem virar coleção de casos
especiais** é exatamente essa: modo = uma linha fornecendo
`{ update, render, hudText, guide, bindings, onEnter }`, e o loop central despacha
pelo modo atual em vez de `if (bonusActive) … if (lv.type==="fight") … if
(levelIndex===7) …`. O quarto modo custa um registro + sua própria lógica, com zero
edições no código compartilhado. A arquitetura atual está a um registro de
distância disso — e corrida é o momento de pagar esse custo pequeno.

Um aviso: **não** deixar o modo corrida reutilizar estado da campanha (`lives`,
`checkpoints`, líder, `levelIndex`) para a própria contabilidade. Corrida precisa
do próprio objeto de resultado/tempo, exatamente como a luta já tem o objeto
`fight` próprio — esse padrão (estado do modo num objeto local do modo, estado da
campanha nos globais da campanha) é a peça a copiar do código da luta.

---

## 3. Dados vs. código

Onde design orientado a dados compra velocidade de iteração (vereditos):

| Item | Hoje | Veredito |
|---|---|---|
| Geometria, inimigos, moedas, pickups, túneis, movers | Já é dado (`makeLevel` + `rect`/`coin`) | **Como está — não migrar para JSON**; editar texto + recarregar com `?fase=N` já é o loop mais rápido possível |
| Velocidade de inimigos por fase | Arrays paralelos indexados por posição | **Dobrar no config da fase** (`lv.patrolSpeed`/`lv.chaseSpeed`) |
| Música por fase | Array paralelo `LEVEL_MUSIC` (+ hack de swap) | Dobrar no config da fase como referência/ID |
| Cartões narrativos + dicas | Array paralelo `JOURNEY` | Dobrar no config da fase (já carrega título/história/dica no menu de pausa) |
| Paleta/tema | Faixas de índice em `sceneryPalette()` | Dobrar no config da fase; apagar `lv.sky`/`lv.hill` mortos ou ligá-los |
| Ordem da campanha / marcos | Índices fixos | Lista de marcos (acima) — dado |
| Stats de personagem (perfil de movimento por forma) | Constante `FORM` + física fixa no passo | Extrair perfil por forma/modo **quando** corrida precisar de perfil diferente — não antes |
| Pistas do interlúdio | Fixas em `startInterlude` | Mover para `BONUS_LEVEL` |
| Ataques | `ATTACKS` — já tabela pequena de dados | Como está |
| Config do chefe | Na fase de luta (`boss: {…}`) | Como está — bom |
| *Comportamento* do chefe | FSM escrita à mão | **Fica em código** — máquina de estados é lógica, não dado |

Regra: orientação a dados paga onde você vai *autoral conteúdo repetidamente*
(fases, estágios, botões de dificuldade). É peso morto onde o conteúdo é único (o
interlúdio, o chefe).

---

## 4. Sensação e design

**O conjunto de mecânicas é coerente?** Em grande parte sim — e com disciplina
incomum para um projeto que cresceu em escopo. Os verbos centrais (mover,
pulo-duplo, dash, mergulho, planar) compartilham um eixo: *controlar o corpo no
ar*. Pisar/atravessar/mergulhar dão aos inimigos uma resposta consistente em 3
vias (por cima / por dentro / área). O modo luta reutiliza corretamente
pulo+dash+mergulho como esquiva — por isso o final parece o mesmo jogo. Esse é o
ativo de design mais forte; proteger.

**Mecânicas que se reforçam:** pulo-duplo + dash + planar formam uma escada real
de controle aéreo (cada um cobre o que o anterior não cobre); mergulho + quique
criam ritmo; líder-tamanho + túneis + tetos baixos é o verdadeiro diferenciador.

**Redundantes / fracas:**
- **Estrela** sobrepõe quase tudo: dash-atravessa + pena (armadura) + i-frames.
  Seu "mata no toque" raramente importa porque inimigos comuns já morrem de dash ou
  pisão. Candidata a remoção ou a identidade real (ex.: estrela = *quebra sombras
  fora da janela de vulnerabilidade*, que nada mais faz).
- **Super velocidade** é "tudo fica um pouco mais rápido" — o jeito menos
  interessante de usar a gramática da fase.

**Subutilizadas (risco de parecerem enfeite):**
- **Troca de líder** é a assinatura do jogo, mas seu peso de gameplay é quase só
  *porte físico* — "o pequeno passa, o grande precisa de espaço". Há pouco custo ou
  timing na escolha. O espaço de design mais subutilizado: decidir *quando* trocar
  (os pontos são hoje gratuitos, instantâneos, ilimitados e quase sempre ao lado do
  portão que abrem).
- **Companheiro** está presente visualmente mas é mecanicamente uma sombra — há
  oportunidade real em "os dois precisam limpar uma seção *separadamente*" que o
  interlúdio só toca narrativamente.
- **Túneis aparecem em 2 das 16 fases** (E6, E12) apesar de serem a mecânica
  principal; a variante de teto baixo em E6 é usada uma vez.

**Mudança de gênero — avaliação de risco.** O final de luta funciona *porque
mantém os verbos de movimento e só muda o objetivo e o oponente*. Corrida
fortalecerá o todo *se* for "os mesmos verbos contra o relógio" (contra-relógio /
corrida de checkpoints sobre a gramática de plataforma existente — correntes de
dash, rotas de planar, atalhos de mergulho). Virará minigame desconexo se
introduzir um conjunto novo de verbos (drift/aceleração/voltas) ou abandonar a
identidade dos personagens. Princípios para os modos parecerem o mesmo jogo:

1. **Mesmos verbos, objetivo diferente.** A sensação de movimento é a franquia;
   só o objetivo e o oponente mudam.
2. **Mesma linguagem de mundo.** Pistas de corrida reutilizam paletas/sólidos/
   vocabulário visual dos inimigos, não identidade visual nova.
3. **Um save, uma gramática de HUD, um título.** Desbloqueios/recordes de corrida
   vivem ao lado de `bestLevel` e do replay do interlúdio no mesmo save; menu de
   pausa, assistência e cartões narrativos idênticos em todos os modos.

---

## 5. Dificuldade e design de fases

**Check de profundidade combinatória.** As mecânicas realmente combinam: alcance
pulo-duplo + dash, rotas de planar, quique de mergulho sobre vãos, dash-atravessa
vs. janelas das sombras, rotas de tamanho do líder, movers com timing. Mas a
auditoria das 16 fases mostra a curva real apoiada fortemente em *densidade de
inimigos e espaçamento de vãos* (as fases finais são literalmente comentadas
"combo 1 … combo 6", "gauntlet", "os três juntos"). Densidade é um botão legítimo,
mas está sendo usado como o botão *principal*.

**Mapeamento atual na gramática** (já meio pronto — as dicas do `JOURNEY`
confirmam intenção): E1 ensinar pular/mover → E2 pulo-duplo → E3 dash no ar → E4
planar → E5 movers → E6 túnel/tamanho → E7–8 combinar. Mas de E9 em diante as
"lições" são variações de padrão de inimigo, e os verbos distintivos (túnel,
mergulho-em-coisas, escolha de líder) não ganham twists novos — são reutilizados
como estão enquanto a contagem de inimigos sobe.

**Gramática proposta e interações concretas que criam profundidade sem adicionar
inimigos:**

- **Introduzir → praticar → combinar → torcer → dominar** por verbo, com uma fase
  de "torção" designada por verbo no fim:
  - **Dash twist:** barreiras quebráveis por dash (dá ao dash interação com o mundo
    que hoje ele não tem — só mata inimigos).
  - **Mergulho twist:** almofadas que o mergulho aciona e lançam para cima numa
    rota superior (mergulho como *movimento*, não só ataque) e correntes de quique
    de mergulho sobre vãos.
  - **Planar twist:** corredores de vento onde segurar planar é *decisão de rota*,
    não conveniência de queda lenta.
  - **Líder twist:** seções onde o ponto TROCA fica *depois* do trecho apertado,
    forçando compromisso com Quindim num trecho em que o alcance de dash do
    Betinho faria falta — tornando o timing da troca uma escolha com custo.
    Também: tetos baixos de mão única que isolam uma reversão cedo (os bolsões sem
    saída de E6 já existem — generalizar a ideia).
  - **Mover twist:** movers que cruzam arcos de patrulha de inimigos (timing dos
    dois); um mover que você precisa mergulhar para redirecionar.
  - **Sombra twist:** interações de mergulho/dash com os estados de *windup* (não
    só as janelas abertas) — hoje é só "esperar abrir / acertar a cabeça".
- **Fases de densidade** (estilo E15) são aceitáveis como checks de *domínio*, mas
  devem ser a exceção, não a resposta padrão a "a fase 12 está fácil".

---

## 6. Risco técnico

**Bugs/classes a que o design atual é mais suscetível:**

1. **Divergência silenciosa do código triplicado** — o risco nº 1. Já aconteceu
   (squash, cooldown do dash, interlúdio sem animação de passada). Cada ajuste de
   feel seguinte agrava.
2. **Vazamento de estado entre modos** — seis blocos de reset feitos à mão que *já*
   discordam; modo novo multiplica a chance de um global velho (ex.: `starT`,
   `hasFeather`, `invuln`, flags `armed` dos pontos) cruzar fronteira de modo. Não
   há teste hoje de que plataforma→interlúdio→luta→título não preserva estado.
3. **Tunelamento AABB sem swept** — colisão por eixos com resolução por eixo.
   Seguro nas velocidades atuais (máx. 20 px/passo do mergulho vs. plataformas de
   24 px), mas **qualquer aumento de velocidade (corrida!) acima de ~22–24 px/passo
   atravessa plataformas finas de 24 px**, e dash contra cantos se comporta mal. Se
   corrida subir o teto de velocidade, esse é o momento de adicionar check X com
   swept ou sub-passos — não antes.
4. **Não-determinismo por RNG** — `Math.random()` para fases de wob dos inimigos,
   decisões do chefe, partículas, plateia. Inofensivo para plataforma casual, mas
   **recordes de corrida só são comparáveis se a pista não tiver RNG ou a tentativa
   for de passo fixo** (é) *e* sem jitter de frame de entrada. Manter pistas de
   corrida sem inimigos ou determinísticas, ou os tempos parecerão injustos.
5. **Durações contadas em frames em todo lugar** — consistentes *por causa* do
   passo fixo de 60 Hz, e o acumulador mantém a simulação a 60 passos/segundo mesmo
   em telas de 120 Hz. Feito certo. Única ressalva: em aparelho lento demais para
   rodar 60 passos por segundo real, timers em frames (o relógio de 60 s da luta)
   esticam em tempo real. Ok para este jogo; não trocar por relógio de parede no
   meio do caminho.
6. **Clamp de dt (250 ms) e suspensão de entrada em blur/visibilidade** — tratados
   bem (pausa + limpeza). O `try/catch` abrangente no `frame()` que zera `acc`
   evita travamentos, mas pode engolir corrupção de estado no meio de um fade — os
   guards `levelFinishing` e anulação do callback de fade já defendem o caso
   conhecido.
7. **Semântica de checkpoint mantida em dois lugares** — o README documenta "Game
   Over reinicia a fase zerando moedas/checkpoints; respawn por vida mantém", e
   `loseLife()` vs. o caminho GAMEOVER implementam isso corretamente mas em dois
   estilos manuais diferentes (respawn por pista do interlúdio é um terceiro).
   Codificar em uma função com teste ao mexer.
8. **Conflitos de entrada resolvidos em sua maioria bem** (flags de borda,
   multi-segurar, `padPrev` do gamepad, liberar em blur, `suspendInput`). Wrinkles
   restantes: chute `Y` é limitado por modo no `setKey` mas não no toque (o toque
   esconde os botões, então ok); gatilhos do gamepad (RT/LT) sem mapeamento — casa
   natural para um boost de corrida depois.

**Os testes protegem os invariantes certos?** Em grande parte sim — incomum para
um jogo de canvas de hobby. Testam: separação/limpeza de entrada em teclado/toque/
gamepad, semântica de confirmação de pausa, integridade de reinício nas *16 fases*,
luta única no fim, aplicação de dano de golpe uma única vez, caminho de Game Over
do chefe, travessia dos vãos do aqueduto por simulação real e o fluxo
plataforma→interlúdio pelo loop principal. É a camada de "máquina de estados e
resets", exatamente onde regressões mordem.

Lacunas que valem um teste cada (não mais): (a) estender o padrão de travessia de
vãos para *todo* vão/túnel crítico das 16 fases (nascer antes, simular, afirmar —
~15 min cada, pega regressão de geometria quando você mexe na física); (b) ciclo de
vida da troca de líder (trocar → espaço para reverter → túnel; sem `pendingRevert`
velho); (c) expiração de pena/estrela/boost vs. dano; (d) reset de round da luta
não vaza nada para o round seguinte. **Todo o resto — equilíbrio, ritmo, juice,
legibilidade de telegráfos, diversão de fase — é território de playtest e nenhum
teste automatizado vai cobrir.** Não tentar.

---

## 7. Performance e portabilidade

Avaliação honesta: **risco baixo no geral; quase nada aqui merece otimização.**

- Canvas 960×540 (0,5 MP) redesenhado por frame com ~80 retângulos máximos, colinas
  de parallax e sprites é trivial para qualquer aparelho que rode um navegador. O
  upscale via CSS é *a decisão certa* — troca suavidade em retina por taxa de frames
  garantida, e o estilo pixel-art esconde.
- `render()` roda uma vez por rAF mesmo sem passo de simulação — em telas de 120 Hz
  são 120 renders/s de simulação a 60; desperdício pequeno a esse custo de fill.
  Não vale portão.
- Alocações por frame (`lv.solids.concat(movers)` a cada passo, gradientes por
  frame) são ruído nessa escala.
- A preocupação móvel real já está tratada: botões de toque com Pointer Events +
  captura de `pointerId`, `touch-action: none`, alvos ≥ 48 px, recomendação de
  paisagem, controles que se reposicionam para longe dos personagens (a cada 6
  frames, `getBoundingClientRect` — ok).
- Nota de gamepad que vale manter no painel de diagnóstico: Safari falha em
  `getGamepads`, então controles não funcionam no iPad — toque é a história do iPad,
  e está ok.
- Áudio: WebAudio sintetizado com destravamento no primeiro input; música em
  `setInterval` é parada na pausa/blur. Ok.

**Único risco futuro significativo:** se corrida adicionar movimento em alta
velocidade ou pistas longas, re-checar tunelamento (acima) e considerar culling de
desenho por câmera — não antes.

---

## 8. Testes

**Invariantes que merecem teste automatizado** (conjunto pequeno):
1. Completabilidade por fase dos vãos/túneis críticos (estender o padrão existente
   às 16) — a rede de segurança da geometria.
2. Invariantes de reset/vazamento: entrar em cada modo (plataforma/interlúdio/luta/
   corrida) deixa mundo limpo; perder vida mantém checkpoint+moedas, Game Over
   zera (parcialmente coberto — formalizar).
3. Invariantes do passo do jogador compartilhadas entre modos após a unificação:
   pulo-duplo consome uma vez, cooldown do dash é respeitado, planar limita a queda,
   mergulho é de um disparo até aterrissar — um teste cada, rodado contra *todos*
   os modos que usam o passo compartilhado (é o teste que torna o refactor seguro).
4. Ciclo de vida de flags de borda: cada flag de um disparo dispara exatamente uma
   vez por pressão e limpa no fim do frame (quase coberto).
5. Fronteira de round da luta: round 2 começa com HP cheio, sem `doubleDmg`/stun/
   cooldown vazados (coberto implicitamente; tornar explícito).

**O que exige playtest, para sempre:** curvas de dificuldade, sensação de pulo/dash,
legibilidade de telegráfos, justiça do chefe, ritmo de fases, tom narrativo,
ergonomia de toque em iPads reais, sensação de gamepad em controles físicos. O
README já diz isso corretamente — manter essa separação.

---

## 9. Priorização

Formato dos itens principais: **Problema → Por que importa → Mudança → Custo de
migração → Consequência de não fazer**.

### Deve corrigir ANTES de adicionar o modo corrida

**M1 — Unificar o passo de física do jogador.**
Problema: código idêntico de mover/pular/dash/mergulho/planar em `updatePlaying`,
`updateInterlude`, `updateFight`. Por que: corrida é a 4ª cópia; cópias já
divergiram; todo ajuste de feel vira edição em 4 lugares com divergência
silenciosa. Mudança: extrair `stepPlayer(p, rules, env)`; cada modo passa suas
regras (a luta já prova a parametrização). Custo: médio-pequeno — uma tarde
cuidadosa, protegida pelos testes de vãos existentes + novos testes do passo
compartilhado. Consequência: corrida herda uma máquina de divergência em 4 vias;
bugs de sensação ficam impossíveis de achar.

**M2 — Registro de modos / lista de marcos.**
Problema: conhecimento de modo espalhado por ~10 pontos de ramificação; ordem da
história em índices mágicos. Por que: corrida precisa de uma terceira estrutura
(campanha + standalone) e um quarto modo deveria ser um registro, não mais 10
edições. Mudança: tabela `MODES` de ~25 linhas + lista `CAMPAIGN` substituindo a
mágica `levelIndex===7/8/15`; apagar o hack de swap do `LEVEL_MUSIC`. Custo:
pequeno; pode entrar incremental (lista de marcos primeiro, registro quando corrida
começar). Consequência: corrida vira o 10º caso especial; o jogo que você descreveu
("coleção de casos especiais") é o destino.

**M3 — Schema de save consolidado.**
Problema: 5 chaves sem versão (`betinho_*`). Por que: corrida adiciona melhores
tempos e desbloqueios; localStorage sem versão é o clássico barato-agora/
caro-depois. Mudança: um objeto `betinho_save` `{version:1, muted, bestLevel,
replayInterlude, assist:{...}}` com shim de migração lendo as chaves antigas
(~20 linhas). Custo: trivial agora. Consequência: migração forçada depois que toca
toda feature que salva.

### Deveria corrigir antes de a produção de conteúdo acelerar

**S1 — Dobrar metadados por fase no config da fase** (velocidade patrol/chase,
música, paleta, narrativa/dica). Mata os arrays paralelos indexados por posição.
Custo: movimento mecânico pequeno; fazer na próxima vez que mexer numa fase por
balanceamento. Consequência: cada inserção/reordenação de fase é uma caçada a bugs;
paleta/música seguem duplicadas ou mortas.

**S2 — Uma função de reset do player/companion**
(`resetPlayerTo(lv, {position, keep:{coins,checkpoints}})`) substituindo os 6
blocos feitos à mão. Custo: pequeno; fazer com M1. Consequência: o bug de reset do
próximo modo chega silencioso (a classe que aparece como "inimigo nasce errado"
duas semanas depois).

**S3 — Semântica de checkpoint codificada em uma função + teste** (Game Over vs.
por-vida vs. respawn de pista do interlúdio são três estilos hoje). Custo: pequeno.
Consequência: checkpoints de corrida serão um 4º estilo e um deles estará errado.

**S4 — Passada de design das mecânicas subutilizadas** (identidade da estrela,
aposta da troca de líder, twist de túnel, quebráveis de dash) antes de a esteira de
conteúdo acelerar — conteúdo construído no vocabulário atual trava a redundância.
Custo: tempo de design, quase zero código. Consequência: mais 20 fases dos mesmos
três botões de combos de inimigos; mecânicas assinatura seguem finas.

### Pode permanecer como está com segurança

- Arquivo único / sem build / sem módulos — ok até o arquivo doer de verdade, e
  corrida é o momento natural de *dividir por modo* (não "refatorar"): `game.js`
  continua o núcleo, um arquivo de modo por modo. Barato depois também.
- A FSM do chefe da luta — é lógica única; deixar.
- O harness de testes em vm com DOM falso — esquisito mas eficaz; manter.
- O atalho de dev `?fase=` e o painel de diagnóstico do gamepad.
- Paleta por índice e campos `lv.sky` mortos — até adicionar/reordenar fases (S1
  absorve).
- Pickups redundantes (estrela/boost) — decisão de conteúdo, não arquitetura;
  decidir por playtest.
- `render()` por rAF em 120 Hz — não vale portão a esse custo de fill.

### Não refatorar

- **O DSL de autoria de fases** (`rect()`/`coin()`/`makeLevel`) — migrar para
  JSON/ferramentas/editoria desaceleraria o loop que hoje funciona melhor.
- **Colisão para swept/contínua** — só adicionar sub-passos se corrida exceder
  ~24 px/passo.
- **Funções de desenho para classes de entidade** — código de desenho plano está ok
  nesse escopo.
- **O áudio sintetizado** — arquivos seriam piores.
- **ECS/TypeScript/framework** — o jogo é 60 Hz, escopo pequeno, e os testes rodam
  o arquivo cru; os três elevariam custo sem ganho concreto aqui.
- **O design de estado virtual de entrada** — é a melhor costura do projeto;
  corrida deve plugar nele, não substituí-lo.

---

**Versão de duas frases:** as decisões caras de reverter depois são todas sobre
*duplicação e despacho* — unificar o passo de movimento, rotear modos por
registro/lista de marcos, consolidar o save — e nenhuma exige migração de
arquitetura, só ~150 linhas de consolidação cuidadosa mais os testes que já provam
segurança. O design já é mais coerente do que o histórico de mudanças de gênero
sugere; o final de luta funciona porque manteve os verbos de movimento, e corrida
também funcionará se for "os mesmos verbos, contra o relógio", não um novo
conjunto de verbos.

---

## Status da implementação

- **M1 — passo de movimento unificado** ✔ (`stepPlayer(env)` + `poundLandingAOE()`;
  suíte `tests/player-step.test.cjs`).
- **M3 — save único versionado** ✔ (`betinho_save` com migração; suíte
  `tests/save.test.cjs`).
- **M2 — fluxo da campanha como dados** ✔ (`CAMPAIGN_FLOW`: interludeAfter/resumeAt/
  lastStage substituem os números mágicos 7/8/15; injeção de sombras e cópia do
  título derivadas do fluxo; hack do swap de `LEVEL_MUSIC` eliminado por troca
  inline dos dois literais).
- **M4 — despacho central de modos** ✔ (`MODES` + `modeKeyOf`/`chapterMode`/
  `modeInfo()`; `updatePlaying`/`drawWorld`/`loadLevel`/entrada/guia/UI consultam o
  registro; suíte `tests/mode-dispatch.test.cjs`).
- Pendente (auditoria): S1 (dobrar velocidades/música/paleta por fase no config da
  fase), S2 (reset único do jogador), S3 (semântica de checkpoint numa função),
  S4 (passada de design das mecânicas subutilizadas) — e o modo corrida em si,
  que agora é uma linha em `MODES` + sua lógica.
