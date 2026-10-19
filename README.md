# Vincol Pneus — Damas 3D

Jogo de damas em 3D, feito para rodar no navegador do celular (Android e iPhone). As peças são pneus em pé que rodam ao andar, e o tabuleiro fica no centro de um autódromo oval no estilo NASCAR, com arquibancada lotada de pneus torcedores e carros dando voltas na pista.

**Jogar agora:** https://frossard33.github.io/vincol-damas-3d/

## Como jogar

1. Digite **nome e sobrenome** (precisa deles para entrar no ranking).
2. Escolha **Contra a IA** ou **2 jogadores**. Contra a IA há quatro níveis: Fácil, Médio, Difícil e Mestre.
3. Toque num pneu Prata para selecioná-lo. As casas verdes são movimentos e as vermelhas são capturas.
4. Arraste com um dedo para girar a câmera e use a pinça com dois dedos para dar zoom.
5. Numa captura em cadeia, toque na próxima casa vermelha para continuar ou em **Encerrar jogada** para parar.

**Pelo teclado:** foque o tabuleiro com Tab, mova o cursor amarelo com as setas e use Enter ou Espaço para selecionar e jogar. As jogadas são anunciadas para leitores de tela.

### Regras usadas

- As peças andam 1 casa na diagonal, sempre para a frente. A dama anda até 2 casas livres em qualquer diagonal (para a frente ou para trás) e captura saltando a peça adversária vizinha, também em qualquer direção.
- **Capturar não é obrigatório**, nem mesmo durante uma captura em cadeia.
- Chegar à última linha promove o pneu a dama (ele ganha uma coroa) e encerra a jogada.
- A partida empata depois de 50 lances seguidos só de damas, sem nenhuma captura.
- Quem fica sem jogadas perde.

### Ranking

- Só vitórias contra a IA entram no ranking. A ordem é pelo nível (o mais difícil vem primeiro) e depois pelo menor tempo.
- Cada **Desfazer** contra a IA soma **+10 s** ao tempo.
- O ranking fica salvo **apenas neste aparelho** (`localStorage`). Não existe ranking online. A lista já vem com 15 recordes de referência para incentivar os jogadores.

## Tecnologia

| Item | Detalhe |
|---|---|
| 3D | [Three.js r128](https://threejs.org/), cópia local em `vendor/` (se faltar, usa o CDN cdnjs) |
| IA | Minimax com poda alfa-beta, aprofundamento iterativo, quiescência, tabela de transposição (Zobrist), killer moves e history heuristic, num Web Worker. Estilo ofensivo: as damas caçam peças, evitam bordas e a IA não repete posições nem enrola perto do empate. Se o Worker falhar, roda na thread principal |
| Interface | HTML + CSS puros, sem build, tudo em português |
| Fontes e ícones | Inter (Google Fonts, com fonte do sistema como reserva); ícones em SVG embutido |
| Desempenho | Cerca de 125 draw calls: malhas dos pneus unificadas e torcida com InstancedMesh. Renderiza a 30 fps quando nada se mexe e a 4 fps com menu aberto. O estádio aparece em etapas para a abertura não travar, e a qualidade cai sozinha (resolução, depois sombras) em celular fraco |
| Acessibilidade | Diálogos com foco preso e Esc, abas e seletores com setas, contraste AA, zoom liberado, jogo completo pelo teclado (`a11y.js`) |
| Robustez | Vigia do Worker da IA, recuperação de perda do WebGL (iOS) e validação dos dados salvos |

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Estrutura da página: placar, barra de ações, tela inicial, ranking e fim de jogo |
| `style.css` | Estilos *mobile first*, com safe-area do iPhone e layout para celular deitado |
| `script.js` | Cena 3D, animações, motor da IA, regras, ranking e eventos de toque |
| `a11y.js` | Acessibilidade: diálogos, foco, teclado e anúncios |
| `logo-data.js` | Logo da Vincol em base64, carregado só ao abrir via `file://` (o navegador bloqueia imagens locais no WebGL) |
| `logo-vincol.png` | Logo da tela inicial |
| `logos.jpg.jpeg` | Favicon |
| `vendor/three.min.js` | Three.js r128 (licença MIT) |

## Rodar localmente

Não há dependências nem build. Escolha uma das opções:

```bash
# opção 1: abrir direto
start index.html            # Windows (funciona via file://)

# opção 2: servidor local
python -m http.server 8000  # depois abra http://localhost:8000
```

## Publicação

O site é publicado no **GitHub Pages** a partir da branch `main`, pasta raiz (`/`).

---

Desenvolvido por **Victor Frossard**, Engenheiro de Software.
