# Plano — controles de toque para iPad

## Objetivo

Permitir jogar toda a campanha no Safari do iPad sem teclado ou controle, preservando os controles atuais.

## Decisões simples

- Usar botões HTML sobre o canvas; não criar joystick virtual.
- Usar Pointer Events (`pointerdown`, `pointerup`, `pointercancel`) para suportar múltiplos dedos.
- Mostrar os controles com `@media (any-pointer: coarse)` e manter teclado/gamepad inalterados.
- Recomendar modo paisagem, sem tentar bloquear a orientação.
- Não adicionar dependências.

## Controles

- Esquerda e direita: movimento contínuo enquanto o botão estiver pressionado.
- Baixo: mergulho e entrada em túnel.
- Pular: toque inicia o pulo; segurar mantém o planar; também confirma títulos e cartões narrativos.
- Dash: dash na plataforma e esquiva na arena.
- Soco e chute: disponíveis na arena.
- Pausa: abre o menu HTML existente, que já funciona por toque.

## Implementação

### 1. Adicionar a interface — `index.html` e `style.css`

- Inserir `#touch-controls` dentro de `#stage`, entre o canvas e `#pause-panel`.
- Criar botões com `data-touch-action`: `left`, `right`, `down`, `jump`, `dash`, `punch`, `kick` e `pause`.
- Usar `aria-label` em todos os botões e texto/ícones curtos visíveis.
- Posicionar direção no canto inferior esquerdo, ações no inferior direito e pausa no superior direito.
- Aplicar alvos de toque de pelo menos 48 px, contraste suficiente, transparência moderada e `touch-action: none`.
- Deixar `#pause-panel` acima dos controles para que o modal continue recebendo os toques.
- Ocultar os controles fora de dispositivos com ponteiro grosseiro; ocultar `punch` e `kick` fora da arena.
- Atualizar os query strings dos arquivos alterados (`?v=7`) para evitar cache antigo no Safari.

### 2. Integrar ao sistema de entrada — `game.js`

- Criar um estado `touch` paralelo a `keys` e `pad`, sem simular eventos de teclado.
- Registrar os Pointer Events dos botões e capturar cada `pointerId`, permitindo segurar uma direção e apertar uma ação ao mesmo tempo.
- Ao pressionar:
  - `left`, `right`, `down` e `jump`: atualizar o estado contínuo correspondente;
  - `jump`, `down` e `dash`: preencher também suas flags de borda (`jumpPressed`, `downPressed`, `dashPressed`);
  - `jump`: preencher `confirmPressed` para telas narrativas e de início;
  - `punch` e `kick`: preencher `punchPressed` e `kickPressed`;
  - `pause`: chamar o fluxo existente de pausa uma única vez;
  - qualquer ação: chamar `Sound.ensure()` para liberar áudio no primeiro toque.
- Ao receber `pointerup`, `pointercancel` ou `lostpointercapture`, liberar apenas a ação daquele ponteiro.
- Incluir `touch.left/right/down/jump` nas mesmas verificações que hoje combinam `keys` e `pad`, inclusive movimento, planar e entrada em túnel.
- Limpar ponteiros e estados de toque em `suspendInput()` para evitar personagem andando sozinho após trocar de app ou bloquear o iPad.

### 3. Sincronizar contexto e instruções — `ui.js` e `README.md`

- Em `syncGameUI()`, indicar no contêiner de toque se a fase atual é arena; o CSS usa esse estado para mostrar ou esconder soco/chute.
- Atualizar o texto do guia e a tabela de movimentos com os equivalentes de toque.
- Manter as opções de pausa como botões HTML nativos, sem criar uma segunda navegação touch.

### 4. Verificar — `tests/input.test.cjs`

- Estender o mock do DOM para registrar os listeners dos botões touch.
- Adicionar um teste mínimo cobrindo:
  - direção mantida e liberada;
  - direção + pulo simultâneos;
  - pulo segurado disponível para planar;
  - `pointercancel` e perda de foco limpando todas as entradas;
  - soco/chute/dash acionando apenas a flag esperada.
- Executar:

```bash
node --test tests/input.test.cjs tests/story-regression.test.cjs
```

## Validação manual no iPad

1. Abrir no Safari em modo paisagem e iniciar o jogo apenas por toque.
2. Jogar uma fase de plataforma usando movimento + pulo/dash simultâneos.
3. Confirmar cartão narrativo e entrar em túnel.
4. Testar planar segurando pulo.
5. Abrir a Etapa 16 com `?fase=16` e testar soco, chute, esquiva e mergulho.
6. Abrir/usar/fechar a pausa por toque.
7. Trocar de aplicativo durante um comando pressionado e confirmar que nenhuma ação fica presa ao voltar.
8. Verificar que teclado, mouse e gamepad continuam funcionando.

## Critérios de conclusão

- A campanha pode ser iniciada, jogada, pausada e concluída sem periféricos.
- Dois comandos touch funcionam ao mesmo tempo.
- Nenhum gesto do Safari interfere enquanto os controles são usados.
- As entradas são liberadas em cancelamento, perda de foco e mudança de aba.
- As duas suítes de teste passam sem regressões.
