"use strict";

const pausePanel = document.getElementById("pause-panel");
const pauseButtons = [...document.querySelectorAll("[data-pause-action]")];
const pauseMain = document.getElementById("pause-main");
const pauseConfirmation = document.getElementById("pause-confirmation");
const pauseCancelButton = document.getElementById("pause-cancel");
const pauseAcceptButton = document.getElementById("pause-accept");
let uiSignature = "";

pauseButtons.forEach((button, index) => {
  button.addEventListener("click", () => { pauseFocus = index; pauseAction(index); syncGameUI(); });
  button.addEventListener("focus", () => { pauseFocus = index; });
});
pauseCancelButton.addEventListener("click", () => { pauseAccept = false; pauseAction(pauseFocus); syncGameUI(); });
pauseAcceptButton.addEventListener("click", () => { pauseAccept = true; pauseAction(pauseFocus); syncGameUI(); });
pauseCancelButton.addEventListener("focus", () => { pauseAccept = false; });
pauseAcceptButton.addEventListener("focus", () => { pauseAccept = true; });
// Native button activation owns Enter/Space; the game owns arrows, P/Esc and gamepad.
pausePanel.addEventListener("keydown", e => {
  if (e.code === "ArrowUp" || e.code === "ArrowDown") {
    e.preventDefault(); e.stopPropagation();
    if (e.repeat) return;
    if (pauseConfirm) pauseAccept = !pauseAccept;
    else pauseFocus = (pauseFocus + (e.code === "ArrowUp" ? 5 : 1)) % 6;
    syncGameUI();
    return;
  }
  if (e.code === "Enter" || e.code === "Space") e.stopPropagation();
});
pausePanel.addEventListener("keyup", e => {
  if (e.code === "Enter" || e.code === "Space") e.stopPropagation();
});

function syncGameUI() {
  const open = state === STATE.PAUSED;
  const touchControls = document.getElementById("touch-controls");
  if (touchControls) touchControls.dataset.fight = String(currentLevel().type === "fight");
  const signature = [open, pauseFocus, pauseConfirm, pauseAccept, Sound.muted,
    assist.infiniteLives, assist.noFallDeath, levelIndex, bonusActive, currentLevel().type,
    interlude && interlude.clueIndex].join("|");
  if (signature === uiSignature) return;
  uiSignature = signature;
  document.getElementById("hint").textContent = currentLevel().type === "fight"
    ? "Arena · ← → / ◀ ▶ mover · Espaço / A / toque A pular · Z / B / toque B soco · Y / toque Y chute · X / toque X esquiva · ↓ / ▼ mergulho · P / Ⅱ pausa"
    : bonusActive
      ? "← → / ◀ ▶ mover · Espaço / A / toque A pular · X / toque X dash · ↓ / ▼ mergulho · P / Ⅱ pausa · encontre 3 pistas"
      : "← → / ◀ ▶ mover · Espaço / A / toque A pular · X / toque X dash · ↓ / ▼ mergulho · P / Ⅱ pausa · toque em TROCA para alternar o líder";
  const wasOpen = !pausePanel.hidden;
  pausePanel.hidden = !open;
  pausePanel.setAttribute("aria-labelledby", pauseConfirm ? "confirm-title" : "pause-heading");
  if (!open) {
    if (wasOpen) canvas.focus({ preventScroll: true });
    return;
  }
  document.getElementById("pause-stage").textContent = bonusActive ? "Interlúdio · entre as etapas 8 e 9" : `Etapa ${levelIndex + 1} de 16`;
  document.getElementById("pause-title").textContent = bonusActive ? "O rastro de Quindim" : JOURNEY[levelIndex][0];
  document.getElementById("pause-story").textContent = bonusActive ? "Betinho segue três pistas obrigatórias. Cada pista vira um marco de retorno." : JOURNEY[levelIndex][1];
  document.getElementById("pause-tip").textContent = bonusActive ? "Pistas encontradas: " + (interlude ? `${interlude.clueIndex} de 3` : "0 de 3") : JOURNEY[levelIndex][2];
  pauseButtons[1].textContent = bonusActive ? "Refazer o Interlúdio" : "Recomeçar esta Etapa";
  pauseButtons[2].textContent = "Som: " + (Sound.muted ? "desligado" : "ligado");
  pauseButtons[3].textContent = "Vidas infinitas: " + (assist.infiniteLives ? "sim" : "não");
  pauseButtons[4].textContent = "Proteção contra quedas: " + (assist.noFallDeath ? "sim" : "não");
  for (const index of [2,3,4]) pauseButtons[index].setAttribute("aria-pressed", String(index === 2 ? !Sound.muted : index === 3 ? assist.infiniteLives : assist.noFallDeath));
  document.querySelector(".guide-key").textContent = "Teclado · Controle Xbox · Toque";
  const guide = document.getElementById("move-guide");
  guide.replaceChildren(...moveGuide().map(([name, key, description]) => {
    const row = document.createElement("li");
    const label = document.createElement("strong"); label.textContent = name;
    const command = document.createElement("span"); command.textContent = key;
    const detail = document.createElement("p"); detail.textContent = description;
    row.append(label, command, detail); return row;
  }));
  pauseMain.hidden = !!pauseConfirm;
  pauseConfirmation.hidden = !pauseConfirm;
  if (pauseConfirm) {
    document.getElementById("confirm-title").textContent = pauseConfirm === "restart" ? (bonusActive ? "Refazer o Interlúdio?" : "Recomeçar esta Etapa?") : "Encerrar esta viagem?";
    document.getElementById("confirm-description").textContent = pauseConfirm === "restart" ? (bonusActive ? "O rastro volta à primeira pista. O replay continua independente da campanha." : "Você volta ao início desta Etapa com 3 vidas. Moedas e checkpoints da tentativa serão reiniciados.") : "A próxima viagem começa na Etapa 1. Seu recorde fica guardado.";
    (pauseAccept ? pauseAcceptButton : pauseCancelButton).focus({ preventScroll: true });
  } else pauseButtons[pauseFocus].focus({ preventScroll: true });
}

pausePanel.addEventListener("keydown", e => {
  if (e.key !== "Tab") return;
  const buttons = pauseConfirm ? [pauseCancelButton, pauseAcceptButton] : pauseButtons;
  const current = buttons.indexOf(document.activeElement);
  e.preventDefault();
  buttons[(current + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
});
