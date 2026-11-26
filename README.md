# Faixa Oculta

Jogo musical em Modo Misto, solo ou por equipes. O baralho reúne seleções fixas e é embaralhado a cada partida. Os palpites são dados em voz alta. Depois de revelar a resposta, quem conduz marca os acertos de título e de origem antes de passar à próxima rodada.

Em **Equipes**, adicione quantas equipes precisar e dê um nome a cada uma, se quiser. A vez segue a ordem da configuração e o placar acompanha a equipe ativa. A primeira a alcançar a meta vence.

Cada equipe tem uma **Troca de faixa** por partida, disponível depois de abrir a faixa e antes de revelar. A troca descarta a faixa atual e mantém a vez e o dobro, se estiver ativo. No solo, você também tem uma troca.

Novas partidas começam com **Poderes** ligados. Você pode desligá-los na configuração ou tocar em **Ativar poderes** durante a escuta de uma partida que começou com eles desligados. Se o DJ marcar um acerto de título em até 3 segundos de áudio e a partida continuar, toque em **Sortear poder** para ver a equipe, o nome do poder e seu efeito. A recompensa já está guardada e fica na tela até o DJ tocar em **Próxima rodada**. Em equipes podem sair sete poderes. No solo podem sair **Duas tentativas**, **Pular música** e **Vale o dobro**.

Durante a escuta, **Usar poder** abre os poderes guardados pelas equipes e indica quando cada um pode ser usado. Selecione a equipe, escolha o poder e confirme em **Aplicar poder**. Antes de o DJ abrir a pista, qualquer equipe adversária pode gastar um ataque. A equipe da vez recebe o efeito imediatamente e continua jogando. Cada rodada admite um ataque.

- **Só 10 segundos** limita a audição a 10 segundos. O DJ pausa a faixa.
- **Só um responde** permite à equipe que atacou indicar, em voz alta, quem dará o palpite pela rival.
- **Só a letra** pede ao DJ que leia um trecho da letra sem revelar o título.
- **Sem vocal** mostra o botão **Buscar instrumental** para o DJ escolher uma versão instrumental ou de karaokê.
- **Duas tentativas** é um poder da própria equipe. Ela pode ativá-lo antes de revelar, inclusive quando recebeu um ataque. O botão **2º palpite** libera a nova tentativa. Esse poder também funciona no solo.
- **Pular música** troca a faixa por outra na vez da própria equipe, antes da revelação e enquanto houver outra faixa no baralho. A equipe mantém o turno, o placar e o bônus de troca por partida.
- **Vale o dobro** pode ser usado na vez da própria equipe, antes de abrir a faixa. O título passa a valer 4 pontos e a origem, 2. Cada equipe pode usar um poder próprio por rodada. Nas partidas salvas antes desta mudança, o dobro que a equipe ainda tinha fica guardado em **Usar poder**.

O treino pode ser aberto pelo endereço do jogo com `#teste-poderes` no final. Ele começa na vez da Equipe 2, com poderes guardados para experimentar um ataque da Equipe 4.

## Seleções

Em **Preparar partida**, toque no botão com a quantidade de playlists e escolha pelo menos uma. **Aplicar seleção** lembra as listas neste navegador, inclusive depois de fechar a aba. Você pode mudar a escolha antes de cada partida. No primeiro uso, todas aparecem marcadas. Se já houver uma partida de uma versão anterior, a configuração começa com as playlists daquela partida.

O contador mostra as faixas únicas. Uma música compartilhada continua no sorteio quando alguma de suas listas está marcada, e a revelação aceita apenas as origens escolhidas para aquela partida.

- **my mind**, de Felipe Sakai, tem 70 faixas famosas e 30 de estilos variados. Para a seleção de 26/11/2026, cruzamos as 175 posições documentadas da playlist com o ranking global de reproduções por música. As 70 escolhidas como famosas ultrapassavam 870 milhões de reproduções cada. As outras 30 trazem 30 artistas principais diferentes. Os dois grupos entram juntos no sorteio. [Playlist no Spotify](https://open.spotify.com/playlist/5tB8NlRXqnMo6pDehea3VW) · [Ranking de reproduções por música](https://kworb.net/spotify/songs.html)
- **Hits Brasil** reúne as posições 1 a 100 e 25 faixas extras selecionadas entre as posições 101 e 142 da parada diária do Spotify Brasil de 24/11/2026. Os dados estão nos dois arquivos com prefixo `top-brasil` em `src/data`. [Parada diária do Spotify Brasil no Kworb](https://kworb.net/spotify/country/br_daily.html)
- 121 faixas de **Suas músicas mais ouvidas de sempre**, seleção personalizada de Leleco registrada em 26/11/2026. [Playlist no Spotify](https://open.spotify.com/playlist/37i9dQZF1CL4yrIE2NRPWT)
- 20 faixas selecionadas entre as 68 de **Minha playlist nº 5 ⑤⒌**, de Júnior Rego, consultada em 26/11/2026. [Playlist no Spotify](https://open.spotify.com/playlist/1L5FS5zUrDX9oOMOq6Unsn)
- **Flashback**, do Matchola, tem 20 faixas na seleção do jogo, entre elas “Seven Nation Army”, “Beat It” e “Zombie”. [Playlist no Spotify](https://open.spotify.com/playlist/1iOmgAZwXihxZqamYmALPF)
- **PLAYLIST ANTIDEPRESSIVA**, da Yaschan, tem 18 faixas no jogo, entre elas “Timber”, “Break Free” e “Tears Dry On Their Own”. [Playlist no Spotify](https://open.spotify.com/playlist/64PYrXeE4lwN8ZVGuoAr29)
- **2028**, da Bela, traz 20 faixas para o jogo, entre elas “Paparazzi”, “Skyfall” e “Good Luck, Babe!”. [Playlist no Spotify](https://open.spotify.com/playlist/7c9CclMaw2Tsb4lgl0j1hM)
- **Clássicos BR** reúne 63 faixas de MPB, bossa nova, rock nacional, samba, pagode, sertanejo, forró, brega, axé e funk, incluindo o Hino do Santos na versão da Banda Gol. Os links de cada gravação ficam em `src/data/classicos-br.json`.
- **Clássicos Internacionais** reúne 58 faixas entre pop, rock, disco, rap, eletrônica e hits latinos. Os links de cada gravação ficam em `src/data/classicos-internacionais.json`.

Cada faixa usa um link individual. Abra a faixa no Spotify, dê play e volte para o jogo. O Spotify pode mostrar o título ao abrir o link.

Para o ponto de origem, o DJ pode aceitar o nome da lista ou da pessoa associada a ela. Quando o mesmo link aparece em mais de uma seleção, a faixa sai uma vez no baralho. A revelação mostra cada origem em uma linha e qualquer uma vale o ponto.

## Rodar localmente

Use Node.js 22.12 ou posterior.

```sh
npm ci
npm run dev
```

## Salvamento e retomada

O jogo grava a ordem das músicas, as origens habilitadas para cada faixa e a configuração uma vez por partida no `localStorage`. Cada jogada atualiza um registro pequeno com o progresso. Ao voltar ao mesmo endereço no mesmo perfil, escolha **Continuar partida**. Partidas da versão anterior são convertidas na retomada, usando a ordem, as faixas e o placar já salvos. Depois do fim, **Ver resultado** recupera o placar final.

O botão **Nova partida** abre a configuração e pede confirmação antes de substituir uma partida em andamento. Limpar os dados do site, trocar de navegador, mudar de endereço ou encerrar uma sessão privada pode tirar o acesso ao salvamento. Se o navegador bloquear a gravação, o jogo avisa e continua na aba aberta.

## Hospedar

Para publicar, use `npm ci` e `npm run build` e sirva o conteúdo de `dist/` em um endereço HTTPS estável. O pacote já inclui `dist/index.html` pronto para hospedagem estática. O HTML também abre diretamente para uma prévia, mas o armazenamento de arquivos abertos por duplo clique depende do navegador.

A aplicação usa JavaScript com JSX, React, HTML e CSS. O Vite gera o HTML final. Os arquivos JSON em `src/data/` alimentam o catálogo no build e incluem metadados de playlists. Quem receber o código ou o HTML publicado consegue consultar essa seleção. A hospedagem dispensa servidor de aplicação, banco de dados, migrations, credenciais e integração com a API do Spotify. Cada aparelho mantém seu próprio placar.

## Créditos do visual

- [TasteSkill](https://www.tasteskill.dev/), referência de composição, tipografia e movimento de entrada.
- [Transitions.dev](https://transitions.dev/), padrões para entrada de telas, seleção de acertos e confirmação de pontos.
- [React Bits — Blur Text](https://reactbits.dev/text-animations/blur-text), referência da revelação em foco implementada em `src/BlurReveal.jsx`.
- [React Bits — Count Up](https://reactbits.dev/text-animations/count-up), referência do contador animado em `src/Scoreboard.jsx`.
- Arte do disco criada para o projeto com ImageGen.

### Prompt da arte

> Use case: product-mockup. Asset type: square hero photograph for Faixa Oculta, a Brazilian music guessing browser game. A single authentic glossy black vinyl LP shot from directly overhead against a saturated vermilion-orange seamless paper surface (#fb562e), with sharply resolved concentric grooves, a single strong cream-white wedge of reflected studio flash across the lower-left grooves, subtle analog film grain, and a diagonal shadow. Center of the record at 60% horizontal and 51% vertical, record diameter 77% of canvas. The record is a full readable circle with space around its top and left. Center label is simple matte orange-red with a small black spindle hole; no printed lettering. The lower-left corner of the background has a darker red shade. Brutalist Brazilian dance-night poster energy, tactile professional record-catalog photograph, rich shadows, editorial clarity, no objects besides the record and backdrop. No typography, no logos, no watermarks, no graphic overlays. 1:1 composition.
