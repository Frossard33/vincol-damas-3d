# Vincol Pneus — Damas 3D

Jogo de damas em 3D, feito para rodar no navegador do celular (Android e iPhone). As peças são pneus em pé que rodam ao andar, e o tabuleiro fica no centro de um autódromo oval no estilo NASCAR, com arquibancada lotada de pneus torcedores e carros dando voltas na pista.

**Jogar agora:** https://victorfrossard.github.io/vincol-damas-3d/ <!-- ajuste se o usuário/repositório for outro -->

## Como jogar

1. Digite **nome e sobrenome** (precisa deles para entrar no ranking).
2. Escolha **Contra a IA** ou **2 jogadores**. Contra a IA há quatro níveis: Fácil, Médio, Difícil e Mestre.
3. Toque num pneu Prata para selecioná-lo. As casas verdes são movimentos e as vermelhas são capturas.
4. Arraste com um dedo para girar a câmera e use a pinça com dois dedos para dar zoom.

### Regras usadas

- As peças andam 1 casa na diagonal, sempre para a frente. A dama também anda 1 casa, mas em qualquer diagonal.
- **Capturar não é obrigatório**, nem mesmo durante uma captura em cadeia.
- Chegar à última linha promove o pneu a dama (ele ganha uma coroa) e encerra a jogada.
- A partida empata depois de 50 lances seguidos só de damas, sem nenhuma captura.
- Quem fica sem jogadas perde.

### Ranking

- Só vitórias contra a IA entram no ranking. A ordem é pelo nível (o mais difícil vem primeiro) e depois pelo menor tempo.
- Cada **Desfazer** contra a IA soma **+10 s** ao tempo.
- O ranking fica salvo **apenas neste aparelho** (`localStorage`). Não existe ranking online nem jogadores fictícios.

## Tecnologia

| Item | Detalhe |
|---|---|
| 3D | [Three.js r128](https://threejs.org/), cópia local em `vendor/` (se faltar, usa o CDN cdnjs) |
| IA | Minimax com poda alfa-beta, aprofundamento iterativo e quiescência, rodando num Web Worker (se o Worker falhar, roda na thread principal) |
| Interface | HTML + CSS puros, sem build, tudo em português |
| Fontes e ícones | Inter (Google Fonts, com fonte do sistema como reserva); ícones em SVG embutido |
| Desempenho | Cerca de 125 draw calls: malhas dos pneus unificadas, torcida com InstancedMesh e renderização a 30 fps quando nada se mexe (10 fps com menu aberto) |

### Arquivos

| Arquivo | Conteúdo |
|---|---|
| `index.html` | Estrutura da página: placar, barra de ações, tela inicial, ranking e fim de jogo |
| `style.css` | Estilos *mobile first*, com safe-area do iPhone e layout para celular deitado |
| `script.js` | Cena 3D, animações, motor da IA, regras, ranking e eventos de toque |
| `logo-data.js` | Logo da Vincol embutido em base64 (usado no letreiro 3D, inclusive via `file://`) |
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
