// ============================================================================
// ACESSIBILIDADE (WCAG 2.1 AA) — Diálogos, Teclado, Roving Tabindex e Anúncios
// ============================================================================
(function () {
  'use strict';
  if (!window.THREE) return; // jogo não carregou: nada para tornar acessível

  const OVERLAY_IDS = ['load-error', 'gameover', 'ranking-screen', 'start-screen'];
  const BG_SELECTORS = ['#canvas-container', '.hud', '#toast', '.dock', '#btn-end-chain'];
  const COL_LETTERS = 'ABCDEFGH';

  function setAttrIfChanged(el, name, value) {
    if (el && el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }

  function removeAttrIfPresent(el, name) {
    if (el && el.hasAttribute(name)) {
      el.removeAttribute(name);
    }
  }

  // Região aria-live dedicada para leitores de tela (navegação no tabuleiro e ações)
  const announcer = document.createElement('div');
  announcer.id = 'a11y-announcer';
  announcer.className = 'sr-only';
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  document.body.appendChild(announcer);

  function announce(msg) {
    if (!msg) return;
    announcer.textContent = '';
    setTimeout(() => {
      announcer.textContent = msg;
    }, 20);
  }

  // --------------------------------------------------------------------------
  // 1. ATRIBUTOS ARIA E DIÁLOGOS MODAIS (Foco inicial, Focus Trap, Inert, Esc)
  // --------------------------------------------------------------------------
  const overlays = OVERLAY_IDS.map((id) => document.getElementById(id)).filter(Boolean);
  overlays.forEach((ov) => {
    setAttrIfChanged(ov, 'role', 'dialog');
    setAttrIfChanged(ov, 'aria-modal', 'true');
    if (ov.id === 'load-error' && !ov.hasAttribute('aria-labelledby')) {
      const h2 = ov.querySelector('h2');
      if (h2) {
        if (!h2.id) h2.id = 'load-error-title';
        setAttrIfChanged(ov, 'aria-labelledby', h2.id);
      }
    }
  });

  function isVisible(el) {
    return Boolean(el && !el.classList.contains('hidden') && !el.closest('.hidden'));
  }

  function getActiveOverlay() {
    for (let i = 0; i < overlays.length; i++) {
      if (!overlays[i].classList.contains('hidden')) return overlays[i];
    }
    return null;
  }

  function getFocusableIn(container, onlyTabbable) {
    if (!container) return [];
    const candidates = container.querySelectorAll(
      'input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([disabled])'
    );
    return Array.from(candidates).filter((el) => {
      if (!isVisible(el)) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (onlyTabbable && el.tabIndex < 0) return false;
      return true;
    });
  }

  let lastActiveOverlay = null;
  let lastTriggerBeforeRanking = null;

  const btnRanking = document.getElementById('btn-ranking');
  const btnStartRanking = document.getElementById('btn-start-ranking');
  if (btnRanking) {
    btnRanking.addEventListener('click', () => {
      lastTriggerBeforeRanking = btnRanking;
    });
  }
  if (btnStartRanking) {
    btnStartRanking.addEventListener('click', () => {
      lastTriggerBeforeRanking = btnStartRanking;
    });
  }

  function syncDialogsAndInert() {
    const activeOverlay = getActiveOverlay();
    const anyOverlayOpen = Boolean(activeOverlay);

    // Fundo inerte enquanto qualquer overlay estiver visível
    BG_SELECTORS.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (anyOverlayOpen) {
        setAttrIfChanged(el, 'inert', '');
      } else {
        removeAttrIfPresent(el, 'inert');
      }
    });

    // Se um overlay (ex.: ranking) abriu por cima de outro visível (ex.: start-screen),
    // deixa apenas o overlay visível de trás inerte.
    overlays.forEach((ov) => {
      if (ov === activeOverlay || ov.classList.contains('hidden')) {
        removeAttrIfPresent(ov, 'inert');
      } else {
        setAttrIfChanged(ov, 'inert', '');
      }
    });

    if (activeOverlay !== lastActiveOverlay) {
      const prevOverlay = lastActiveOverlay;
      lastActiveOverlay = activeOverlay;

      if (activeOverlay) {
        // Move foco para o primeiro controle visível dentro do diálogo aberto
        setTimeout(() => {
          if (getActiveOverlay() !== activeOverlay) return;
          if (
            prevOverlay &&
            prevOverlay.id === 'ranking-screen' &&
            activeOverlay.id === 'start-screen' &&
            lastTriggerBeforeRanking === btnStartRanking &&
            isVisible(btnStartRanking)
          ) {
            btnStartRanking.focus();
            return;
          }
          const focusables = getFocusableIn(activeOverlay, true);
          const first = focusables[0] || getFocusableIn(activeOverlay, false)[0];
          if (first) first.focus();
        }, 10);
      } else {
        // Todos os diálogos fecharam: devolve foco ao tabuleiro (ou botão que abriu o ranking)
        setTimeout(() => {
          if (getActiveOverlay()) return;
          const boardEl = document.getElementById('canvas-container');
          if (
            prevOverlay &&
            prevOverlay.id === 'ranking-screen' &&
            lastTriggerBeforeRanking === btnRanking &&
            isVisible(btnRanking)
          ) {
            btnRanking.focus();
          } else if (boardEl) {
            boardEl.focus();
          }
        }, 10);
      }
    }
  }

  const overlayObserver = new MutationObserver(() => {
    syncDialogsAndInert();
  });
  overlays.forEach((ov) => {
    overlayObserver.observe(ov, { attributes: true, attributeFilter: ['class'] });
  });

  // Focus trap (Tab / Shift+Tab) e tecla Esc para fechar o Ranking
  document.addEventListener('keydown', (e) => {
    const activeOverlay = getActiveOverlay();
    if (!activeOverlay) return;

    if (e.key === 'Escape') {
      const rankingEl = document.getElementById('ranking-screen');
      if (rankingEl && !rankingEl.classList.contains('hidden')) {
        e.preventDefault();
        const closeBtn = document.getElementById('btn-close-ranking');
        if (closeBtn) closeBtn.click();
      }
      return;
    }

    if (e.key === 'Tab') {
      const tabbables = getFocusableIn(activeOverlay, true);
      if (tabbables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = tabbables[0];
      const last = tabbables[tabbables.length - 1];
      const current = document.activeElement;

      if (e.shiftKey) {
        if (current === first || !activeOverlay.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last || !activeOverlay.contains(current)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // 2. ABAS DO RANKING (aria-selected + Setas Esquerda/Direita + Roving Tabindex)
  // --------------------------------------------------------------------------
  const rankingTabsContainer = document.getElementById('ranking-tabs');
  const rankingTabs = rankingTabsContainer
    ? Array.from(rankingTabsContainer.querySelectorAll('.tab'))
    : [];

  function syncRankingTabs() {
    if (rankingTabs.length === 0) return;
    let activeFound = false;
    rankingTabs.forEach((tab) => {
      const isActive = tab.classList.contains('active');
      if (isActive) activeFound = true;
      setAttrIfChanged(tab, 'aria-selected', isActive ? 'true' : 'false');
      setAttrIfChanged(tab, 'tabindex', isActive ? '0' : '-1');
    });
    if (!activeFound && rankingTabs[0]) {
      setAttrIfChanged(rankingTabs[0], 'aria-selected', 'true');
      setAttrIfChanged(rankingTabs[0], 'tabindex', '0');
    }
  }

  if (rankingTabsContainer) {
    const tabObserver = new MutationObserver(syncRankingTabs);
    rankingTabs.forEach((tab) => {
      tabObserver.observe(tab, { attributes: true, attributeFilter: ['class'] });
    });

    rankingTabsContainer.addEventListener('keydown', (e) => {
      const idx = rankingTabs.indexOf(document.activeElement);
      if (idx === -1) return;
      let nextIdx = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % rankingTabs.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + rankingTabs.length) % rankingTabs.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = rankingTabs.length - 1;
      }
      if (nextIdx !== -1) {
        e.preventDefault();
        rankingTabs[nextIdx].click();
        syncRankingTabs();
        rankingTabs[nextIdx].focus();
      }
    });
  }

  // --------------------------------------------------------------------------
  // 3. RADIOGROUPS (#mode-group, #level-group) — Roving Tabindex, Setas, aria-checked
  // --------------------------------------------------------------------------
  function setupRadiogroup(groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    if (radios.length === 0) return;

    function syncGroup() {
      const activeRadio = radios.find((r) => r.classList.contains('active')) || radios[0];
      radios.forEach((r) => {
        const isChecked = r === activeRadio;
        setAttrIfChanged(r, 'aria-checked', isChecked ? 'true' : 'false');
        setAttrIfChanged(r, 'tabindex', isChecked ? '0' : '-1');
      });
    }

    const obs = new MutationObserver(syncGroup);
    radios.forEach((r) => {
      obs.observe(r, { attributes: true, attributeFilter: ['class'] });
    });

    group.addEventListener('keydown', (e) => {
      const idx = radios.indexOf(document.activeElement);
      if (idx === -1) return;
      let nextIdx = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIdx = (idx + 1) % radios.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIdx = (idx - 1 + radios.length) % radios.length;
      } else if (e.key === 'Home') {
        nextIdx = 0;
      } else if (e.key === 'End') {
        nextIdx = radios.length - 1;
      }
      if (nextIdx !== -1) {
        e.preventDefault();
        radios[nextIdx].click();
        syncGroup();
        radios[nextIdx].focus();
      }
    });

    syncGroup();
  }

  setupRadiogroup('mode-group');
  setupRadiogroup('level-group');
  syncRankingTabs();

  // --------------------------------------------------------------------------
  // 4. JOGAR PELO TECLADO NO TABULEIRO 3D
  // --------------------------------------------------------------------------
  const boardContainer = document.getElementById('canvas-container');
  if (boardContainer) {
    setAttrIfChanged(boardContainer, 'tabindex', '0');
    setAttrIfChanged(
      boardContainer,
      'aria-label',
      'Tabuleiro de damas 3D. Use as setas para mover pelas casas escuras e Enter ou Espaço para selecionar ou mover.'
    );
  }

  // Cursor 3D adicionado diretamente na scene (sem alterar emissive das casas)
  let cursorR = 5;
  let cursorC = 2; // Casa C3 inicial (casa escura: (5 + 2) % 2 === 1)
  let cursorRing = null;

  if (typeof THREE !== 'undefined' && typeof scene !== 'undefined') {
    cursorRing = new THREE.Group();

    const outerGeo = new THREE.RingGeometry(0.41, 0.47, 36);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.rotation.x = -Math.PI / 2;
    outerMesh.renderOrder = 20;

    const innerGeo = new THREE.RingGeometry(0.37, 0.41, 36);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0x111114,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.rotation.x = -Math.PI / 2;
    innerMesh.renderOrder = 19;

    cursorRing.add(innerMesh);
    cursorRing.add(outerMesh);
    cursorRing.visible = false;
    scene.add(cursorRing);
  }

  function updateCursorPosition() {
    if (!cursorRing) return;
    cursorRing.position.set(cursorC - 3.5, 0.145, cursorR - 3.5);
  }
  updateCursorPosition();

  function squareCoord(r, c) {
    return `${COL_LETTERS[c]}${8 - r}`;
  }

  function describePiece(piece) {
    if (!piece || !piece.userData) return '';
    const isWhite = piece.userData.color === 'white';
    const isKing = piece.userData.isKing;
    if (isKing) return isWhite ? 'dama Prata' : 'dama Vermelha';
    return isWhite ? 'pneu Prata' : 'pneu Vermelho';
  }

  function describeSquare(r, c) {
    const coord = squareCoord(r, c);
    const piece = typeof boardState !== 'undefined' && boardState[r] ? boardState[r][c] : null;
    if (piece) {
      const desc = describePiece(piece);
      const sel = typeof selectedPiece !== 'undefined' && selectedPiece === piece ? ', selecionado' : '';
      return `Casa ${coord}, ${desc}${sel}`;
    }
    const isDest =
      typeof selectedPiece !== 'undefined' &&
      selectedPiece &&
      typeof validMoves !== 'undefined' &&
      validMoves.find((m) => m.toR === r && m.toC === c);
    if (isDest) {
      return `Casa ${coord}, ${isDest.captured ? 'destino de captura disponível' : 'destino válido'}`;
    }
    return `Casa ${coord}, vazia`;
  }

  if (boardContainer) {
    boardContainer.addEventListener('focus', () => {
      // Foco vindo de toque/mouse (ou devolvido ao fechar um diálogo) não mostra o cursor:
      // ele só aparece para quem navega pelo teclado
      if (!boardContainer.matches(':focus-visible')) return;
      if (cursorRing) {
        updateCursorPosition();
        cursorRing.visible = true;
      }
      announce(describeSquare(cursorR, cursorC));
    });

    boardContainer.addEventListener('pointerdown', () => {
      if (cursorRing) cursorRing.visible = false;
    });

    boardContainer.addEventListener('blur', () => {
      if (cursorRing) {
        cursorRing.visible = false;
      }
    });

    boardContainer.addEventListener('keydown', (e) => {
      if (getActiveOverlay()) return;

      // Navegação pelas casas escuras ((r + c) % 2 === 1) com as setas
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
        if (cursorRing) cursorRing.visible = true;

        let nr = cursorR;
        let nc = cursorC;

        if (e.key === 'ArrowLeft') {
          if (cursorC - 2 >= 0) {
            nc = cursorC - 2;
          } else if (cursorR > 0 && cursorC - 1 >= 0 && (cursorR - 1 + cursorC - 1) % 2 === 1) {
            nr = cursorR - 1;
            nc = cursorC - 1;
          } else if (cursorR < 7 && cursorC - 1 >= 0 && (cursorR + 1 + cursorC - 1) % 2 === 1) {
            nr = cursorR + 1;
            nc = cursorC - 1;
          }
        } else if (e.key === 'ArrowRight') {
          if (cursorC + 2 <= 7) {
            nc = cursorC + 2;
          } else if (cursorR > 0 && cursorC + 1 <= 7 && (cursorR - 1 + cursorC + 1) % 2 === 1) {
            nr = cursorR - 1;
            nc = cursorC + 1;
          } else if (cursorR < 7 && cursorC + 1 <= 7 && (cursorR + 1 + cursorC + 1) % 2 === 1) {
            nr = cursorR + 1;
            nc = cursorC + 1;
          }
        } else if (e.key === 'ArrowUp' && cursorR > 0) {
          nr = cursorR - 1;
          // Escolhe a casa escura adjacente na linha de cima de forma reversível com ArrowDown
          if (nr % 2 === 0) {
            nc = cursorC + 1 <= 7 ? cursorC + 1 : cursorC - 1;
          } else {
            nc = cursorC - 1 >= 0 ? cursorC - 1 : cursorC + 1;
          }
        } else if (e.key === 'ArrowDown' && cursorR < 7) {
          nr = cursorR + 1;
          if (nr % 2 === 1) {
            nc = cursorC - 1 >= 0 ? cursorC - 1 : cursorC + 1;
          } else {
            nc = cursorC + 1 <= 7 ? cursorC + 1 : cursorC - 1;
          }
        }

        if ((nr + nc) % 2 === 1 && nr >= 0 && nr <= 7 && nc >= 0 && nc <= 7) {
          cursorR = nr;
          cursorC = nc;
          updateCursorPosition();
        }
        announce(describeSquare(cursorR, cursorC));
        return;
      }

      // Enter ou Espaço: seleciona pneu ou executa o lance para a casa do cursor
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (cursorRing) cursorRing.visible = true;

        if (inputLocked || gameOver || isAITurn()) {
          announce('Aguarde a vez do jogador.');
          return;
        }

        const coord = squareCoord(cursorR, cursorC);
        const targetMove =
          selectedPiece &&
          validMoves &&
          validMoves.find((m) => m.toR === cursorR && m.toC === cursorC);

        if (chainPiece) {
          if (targetMove) {
            const pDesc = describePiece(selectedPiece);
            executeMove(targetMove);
            announce(`Casa ${coord}, ${pDesc} capturou para ${coord}.`);
          } else {
            const msg = 'Escolha uma casa vermelha para capturar de novo, ou em "Encerrar jogada".';
            setToast(msg);
            announce(`Casa ${coord}. ${msg}`);
          }
          return;
        }

        if (targetMove) {
          const pDesc = describePiece(selectedPiece);
          const action = targetMove.captured ? 'capturou para' : 'moveu para';
          executeMove(targetMove);
          announce(`Casa ${coord}, ${pDesc} ${action} ${coord}.`);
          return;
        }

        const piece = boardState[cursorR] && boardState[cursorR][cursorC];
        if (piece && piece.userData && piece.userData.color === currentTurn) {
          const moves = getAllMovesForPlayer(currentTurn).filter((m) => m.piece === piece);
          if (moves.length === 0) {
            const msg = 'Esse pneu está bloqueado. Escolha outro.';
            setToast(msg);
            announce(`Casa ${coord}, ${describePiece(piece)} bloqueado.`);
            return;
          }
          if (selectedPiece === piece) {
            selectPiece(null);
            announce(`Casa ${coord}, ${describePiece(piece)} desmarcado.`);
          } else {
            selectPiece(piece);
            const dests = validMoves.map((m) => squareCoord(m.toR, m.toC)).join(', ');
            announce(`Casa ${coord}, ${describePiece(piece)} selecionado. Destinos válidos: ${dests}.`);
          }
          return;
        }

        if (piece && piece.userData && piece.userData.color !== currentTurn) {
          announce(`Casa ${coord}, ${describePiece(piece)} adversário.`);
          return;
        }

        if (selectedPiece) {
          selectPiece(null);
          announce(`Casa ${coord}, vazia. Seleção removida.`);
        } else {
          announce(`Casa ${coord}, vazia.`);
        }
      }
    });
  }

  // Inicializa estado dos diálogos e inércia na carga
  syncDialogsAndInert();
})();
