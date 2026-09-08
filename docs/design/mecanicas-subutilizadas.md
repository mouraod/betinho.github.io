# Passada de design — mecânicas subutilizadas (S4)

Decisões propostas para dar identidade às mecânicas que hoje se repetem ou não
rendem. Nada aqui é código novo de fase — são **critérios** para as próximas
fases e **candidatos concretos** de interação, ranqueados por custo/valor. A
regra de ouro da gramática: *introduzir → praticar → combinar → torcer →
dominar*, com **uma fase de torção por verbo** no lugar de "mais inimigos".

## 1. Estrela — dar identidade ou remover

**Problema:** a Estrela (invencibilidade temporária) sobrepõe quase tudo: o dash
já atravessa inimigos comuns, a Pena já absorve um golpe, os i-frames já cobrem o
pós-dano. O "mata no toque" raramente importa.

**Proposta (escolher uma):**
- **A:** remover da rota principal (deixar só em secret/bônus).
- **B (recomendada):** redefinir como *quebra-sombras*: durante a Estrela, o toque
  derruba Sentinela/Eco/Espreita **fora da janela de vulnerabilidade** — nada
  mais no jogo faz isso, e ela vira a ferramenta de "atravessar a noite sem
  esperar" nas fases 9–14.

## 2. Troca de líder — tornar a escolha uma decisão com custo

**Problema:** pontos TROCA são gratuitos, instantâneos, ilimitados e quase sempre
colados no portão que abrem. O gameplay é só "porte físico".

**Propostas (custo crescente):**
- **Baixo:** uma fase em que o ponto TROCA vem **depois** do trecho apertado —
  você se compromete com Quindim (alcance de dash menor) por um trecho onde
  Betinho faria falta. Timing da troca = decisão.
- **Baixo:** tetos baixos de **mão única** que isolam uma reversão cedo (já
  existem "bolsões" de cano em E6; generalizar).
- **Médio:** uma única seção por mundo em que os dois precisam limpar **lados
  diferentes** (companheiro vira agente, não sombra) — o interlúdio já é a
  desculpa narrativa perfeita.
- **Evitar:** custo por troca (moeda/tempo). Punição não é decisão interessante
  aqui.

## 3. Túneis — o verbo-assinatura só aparece em 2 das 16 fases

**Problema:** o diferenciador do jogo é subusado.

**Proposta:** uma fase de **torção de túnel** no Mundo 2 (E12 tem túneis de
escolha; E6 os introduz): um túnel que leva a uma **rota secreta de moedas/
atalho** cuja saída exige *voltar a ser Betinho antes de sair* (espaco de teto
logo na saída, então o jogador decide se quer o atalho ainda como Quindim).
Regra de ouro: túnel deve **escolher o que você perde/ganha**, não só transportar.

## 4. Dash — dar interação com o mundo

**Problema:** o dash só mata inimigos e corrige distância. Nunca abre caminho.

**Proposta:** **barreiras quebráveis por dash** (madeira/teia) introduzidas na
torção de E7 e reutilizadas como segredos. Uma linha de dados nova
(`breakables: [rect(...)]`) + resolução de colisão; o dash ganha "chave" sem novo
verbo. **Não** criar dash infinito/aéreo.

## 5. Mergulho — de ataque a ferramenta de rota

**Problema:** mergulho é só "dano em área + quique".

**Proposta:** **almofadas de mergulho** (1 tipo novo de sólido): mergulhar em cima
lança o jogador para cima numa rota superior. Cria correntes de quique sobre vãos
(combina com o pulo-duplo) e um uso de *movimento* para o verbo mais forte do
kit. Custo pequeno; alto rendimento em variedade.

## 6. Sombrias — interagir com o windup, não só com a janela

**Problema:** hoje o padrão é "espere a janela abrir e acerte a cabeça". O estado
de *windup* (Sentinela erguendo, Eco carregando) não tem valor de jogo.

**Proposta:** em fases 12–14, um inimigo sombra que **reage ao dash** durante o
windup (vira de frente / avança), ensinando a *segurar* o dash e a usar o
mergulho como alternativa. Torna o vocabulário (dash vs. mergulho) uma escolha
contra o mesmo inimigo.

## 7. Plataformas móveis + inimigos — timing dos dois

**Proposta:** em 1–2 fases do Mundo 2, um mover que cruza o arco de patrulha de
um chase (você espera os dois), e um mover que **só desce quando mergulhado**
(peso). Não aumentar densidade; aumentar **relação entre sistemas**.

## Regra de produção para as próximas fases

- Cada fase nova declara, no config, **uma lição** (verbo novo ou torção) e
  **reutiliza no máximo um twist antigo**. Se a fase não tem lição além de
  densidade, é candidata a corte.
- Fases de densidade/combo só como checks de domínio (uma por mundo, no máximo).
- **Não** adicionar verbo novo (corrida à parte, HUD novo, inimigo com nova regra
  de dano) sem antes torcer os verbos existentes — é mais barato e mantém o jogo
  coeso.
