# Próximos passos — v0.9 em diante

Atividades **em aberto**. Este documento existe pelo mesmo motivo do
[HANDOFF](HANDOFF.md): vive no repositório para que um `git clone` entregue o
contexto inteiro, sem depender de histórico de chat.

Última atualização: 2026-09-10.

Origem: análise de mercado de apps de academia (apps globais, mercado
brasileiro e evidência de gamificação) cruzada com auditoria do código.
Documento visual completo:
<https://claude.ai/code/artifact/41226593-1b31-44fc-91b5-e7f41f23d6b2>

---

## Estado atual — onde paramos (2026-09-10)

### Cold start resolvido, e uma correção de registro

**Em 03/09 eu escrevi neste documento que o cold start estava tratado. Não
estava.** A janela de nova tentativa somava 27s, calibrada pelos "30 a 60
segundos" que a documentação do Render promete — e o teste que a guardava
exigia 25s, repetindo o mesmo número errado e passando verde.

Medido em 10/09, com o serviço dormindo havia 7 dias:

| | |
|---|---|
| 1ª chamada (dormindo) | **73,1 s** até o primeiro byte |
| 2ª chamada (acordado) | 0,86 s |

O app desistia aos 27s — errava justamente no caso que a nova tentativa existe
para resolver. **A lição é geral: número que vem de documentação de fornecedor
entra no código como suposição, não como fato.** Medir custou um `curl -w
'%{time_starttransfer}'`.

Duas frentes. A janela foi para 90s e o teste passou a exigir os 73 medidos. E,
o que de fato resolve, `.github/workflows/manter-acordado.yml`: chama `/health`
de 5 em 5 minutos para nunca haver 15 min de silêncio.

**Só das 5h às 24h (Brasília), de propósito.** O plano free dá 750 horas de
instância por mês; acordado o mês inteiro consome ~744 — cabe, mas sem folga, e
**estoura se houver qualquer outro serviço free na mesma conta Render**.
Das 5h às 24h dá ~590 horas. O agendador do GitHub atrasa sob carga; se o
serviço ainda dormir de vez em quando, a alternativa é um monitor externo
(UptimeRobot, cron-job.org), que não depende da fila do GitHub.

### Sessão: 30 dias, e o 401 finalmente tratado

O token expirava em 12h e **ninguém tratava 401**. Na prática o app não voltava
para o login: mostrava **"Unauthorized"**, em inglês, em vermelho, com um botão
"Tentar de novo" que falharia para sempre. A única saída era descobrir sozinho
o caminho Perfil → Sair.

Agora são duas defesas. A camada de api avisa quando o servidor responde 401
numa rota **que mandou crachá** — e só nesse caso: sem essa checagem, o 401 de
"senha errada" faria a tela de login dizer "sua sessão expirou" para quem nunca
esteve logado. E `tokenExpirado` lê o prazo no próprio token na abertura, para
não sair pedindo dado com um crachá já vencido; **na dúvida ele responde "não
expirou"**, porque um erro de leitura no cliente nunca pode expulsar quem está
logado — quem decide é o servidor.

O prazo foi de 12h para **30 dias**. Com 12h praticamente toda visita caía
vencida, e digitar e-mail e senha antes de treinar é o atrito que faz desistir.
Token longo aqui **não é acesso irrevogável**: o `validate` da JwtStrategy
consulta o banco a cada requisição e recusa conta inativa, o que já está travado
pelo teste "lanca UnauthorizedException quando a conta foi desativada". Se essa
consulta sair um dia, o prazo tem de encolher junto.

Suíte: **358 no frontend** (era 337), **144 unitários no backend**. Quatro
mutações plantadas e mortas — a mais importante foi comparar `exp` em
milissegundos em vez de segundos, que expulsaria todo mundo a cada abertura.

No ar e verificado: bundle publicado com a janela de 90s e as mensagens novas,
`/health` reportando `4b2803e`, e o ping disparado à mão devolvendo
`GET /health -> 200`.

---

## Estado anterior (2026-09-03)

### Cold start e falha de rede — ENTREGUE

Seis correções, e **quatro das seis saíram do teste no iPhone real**, não da
suíte automatizada. Vale registrar porque diz onde a suíte é cega.

**O problema de origem:** o backend roda no plano free do Render, dorme depois de
~15 min e leva 30 a 60s para acordar. Isso acontece com sinal ótimo, todo dia, e
fazia a primeira abertura do dia mostrar erro na porta da academia.

- `b5c3e06` — nova tentativa com espera crescente (soma 27s, cobrindo a janela do
  Render) e, passados 4s, um aviso explicando que o servidor está acordando. Em
  cor **neutra**: vermelho ali ensinaria a desconfiar do app justamente quando
  ele está funcionando. Insiste só em 502/503/504 e falha de transporte — **4xx
  fica fora**, é veredito pensado e insistir gasta cota de rate limit. Se o
  aparelho **sabe** que está offline, desiste na hora.
- No mesmo commit: **escrita não se repete, se verifica.** Repetir o
  `POST /sessions/toggle` inverteria o estado quando foi a *resposta* que se
  perdeu — finalizaria o treino que a primeira chamada acabou de abrir. Então ao
  falhar o app **pergunta ao servidor como ficou** (`toggleFoiAplicado`) e
  compara com o estado anterior.
- `612b9f5` — o "Tentar de novo" só aparece quando repetir pode mudar algo.
  Estava sendo oferecido até no **cooldown** ("Aguarde 12 min para iniciar outro
  treino"), onde repetir devolve a mesma recusa. Reusa `ehRetentavel`: a pergunta
  é idêntica à do retry automático.
- `ffee493` — a falha de leitura deixou de ser beco sem saída. A mensagem era
  "Erro inesperado ao falar com o servidor", o rótulo de último recurso da
  `api.ts`, alcançado **por acidente** (o 502 do proxy vem em HTML, sem campo de
  mensagem). Agora `mensagemDeFalhaNaLeitura` decide o texto na ordem que
  importa: offline primeiro (estando sem rede, tudo que se diga do servidor é
  chute), depois transporte/proxy, e só no fim o texto do erro — **e apenas se
  veio de `ApiError`**, porque a mensagem de um `Error` comum é recado de
  programador ("Failed to fetch"), não informação para quem está na academia.
- `6bfd4c9` — o botão encostava no "Começar treino": o reset global zera margem,
  o `.btn-mini` não tem margem própria e nas outras telas herdava **por
  acidente** os 24px do `.btn` acima dele. E o que isso escondia: o botão
  principal ficava **ativo** sem o app saber se havia treino aberto.
- `15d6cbf` — flagrado na captura do iPhone: "o servidor está acordando" e "o
  servidor não respondeu a tempo" **na tela ao mesmo tempo**. O `carregar` não
  limpava o erro **ao começar**, só ao terminar.
- `9938c29` — a pílula "Fora do treino" afirmava estado não lido. Pré-existente,
  visível em todo carregamento; só ficou óbvio porque o erro dura 30s. Esconde
  quando não há dado **nenhum** — se uma leitura anterior deu certo, o que está
  na tela é fato, só velho.

**Onde a suíte era cega, e por quê:** ela verifica o que a tela *diz*, não como
as frases se combinam nem como as caixas se encostam. Contradição entre dois
avisos, encavalamento por margem herdada e rótulo que mente sobre estado
desconhecido passaram todos por uma suíte verde. Só o aparelho pegou.

**Dois erros meus no caminho, registrados porque a lição se repete:** pus o
retry dentro da `api.ts` e cada leitura passou a insistir 27s, estourando o
tempo dos testes — sintoma de projeto errado, porque política de retry é decisão
de experiência de uso, não de transporte. E escrevi "no fim, mostre o texto do
erro" sem separar erro do servidor de `Error` de programador.

**Mais testes que passavam por caso irreal** (o quarto e o quinto do dia): três
usavam `ApiError` **sem status** e um usava `TypeError("Failed to fetch")` para
simular falha de rede — coisas que a `api.ts` nunca produz, porque ela embrulha
falha de transporte em `ErroDeRede` e sempre passa o status.

Suíte: **337 no frontend** (era 284) e **339 no backend**, inalterado — nada de
`backend/` mudou. No ar e verificado no bundle publicado: as seis strings novas
presentes, as duas antigas ausentes. O `/health` de produção reporta `9957d2e` e
**está correto** — desde aquele build só mudaram `docs/` e `frontend/`.

---

## Estado anterior (2026-09-02)

### v1.1 — navegação por abas — ENTREGUE

A tela única virou **três abas** no rodapé: **Treino / Histórico / Perfil**.
`PontoScreen` foi de 504 para 373 linhas e virou container de estado; a
renderização mora em `TreinoScreen`, `HistoricoScreen` e `PerfilScreen`.

**Sem aba Grupo**, apesar de o roadmap listar quatro: hoje só uma pessoa usa o
app (ver a nota de uso real mais abaixo), então ela abriria vazia. Entra na
v1.3, quando houver gente. Construir tela para usuário imaginário é custo que a
v1.3 paga, não esta.

**Router próprio, por hash (`#/treino`), sem biblioteca.** O motivo não é
economia de bytes: o GitHub Pages serve arquivo estático e **não tem fallback de
SPA**, então com rota de caminho de verdade um F5 em `/historico` devolveria
404. A saída usual é duplicar o `index.html` como `404.html`, truque que depende
de detalhe de hospedagem. Com hash o servidor nunca vê a rota, e o botão voltar
do aparelho funciona de graça. São três abas, sem rota aninhada nem parâmetro —
quando a v2.0 pedir parâmetro, o lugar de trocar por biblioteca é o `rota.ts`,
porque os componentes só conhecem `useAba`.

**O registro do treino recém-finalizado abre na aba Treino.** Antes abria dentro
da lista, que era a mesma tela; com abas, abriria numa tela que a pessoa não
está olhando — e o instante seguinte ao check-out é o de maior intenção.

**Sair e Painel saíram do cabeçalho para o Perfil**: sair obriga a logar de novo
e ficava num alvo pequeno, no topo, colado no botão mais usado do app. O botão de
tema **fica** ao lado do nome GYM MONKEY, por pedido explícito.

Validado no iPhone pelo dono do produto: barra não cobre a última linha,
formulário abre na aba certa, botão voltar troca de aba, tema escuro ok, Painel
abre do Perfil.

### Dicas (`?`) explicando os conceitos — ENTREGUE

Pedido depois do teste no aparelho: *"eu sei o que o floco de neve faz porque
desenvolvi, outras pessoas não vão saber"*.

Componente próprio em vez de `title`: o atributo do HTML **só aparece no hover
do mouse**, e em celular hover não existe — a dica nunca apareceria justamente
onde o app é usado. Abre no toque, fecha tocando fora / de novo / com Escape.

A distinção que decidiu onde colocar: os ícones do MetaSemana **já têm texto ao
lado** ("2 congelamentos"), então o que faltava não era o nome, era **o que o
conceito faz**. Os dois botões de cada treino no histórico eram os únicos só
ícone, e ganharam uma dica no título da seção em vez de um `?` por linha.

Os números saem da regra do servidor (`TOKENS_MAX`, `SEMANAS_POR_TOKEN`,
`AUMENTO_MAX_CORRECAO_MIN`). **Risco de desvio registrado**: a API não envia
essas constantes, então o texto as repete à mão. Se mudarem no servidor, o texto
mente — e o teste em `MetaSemana.test.tsx` é onde isso aparece.

### Tipografia padronizada — ENTREGUE

Pedido do dono do produto ao ver a tela: *"as fontes/letras não estão
padronizadas"*. Medido antes de mexer: **19 tamanhos de fonte**, dez deles
apertados entre 0.68 e 0.88rem, mais 4 pesos, 5 espaçamentos e a pilha de
`font-family` repetida à mão em 6 lugares.

Agora: **8 degraus, 3 pesos, 1 espaçamento, 2 famílias** — todos em token. As 61
declarações de `font-size` saem da escala.

Dois defeitos que não eram estética:

- **O Safari do iOS dá zoom sozinho** ao focar campo com fonte menor que 16px. O
  `select` da meta estava em 12px e os campos da correção em 14px, então abrir o
  seletor de data/hora entortava a página. Daí o degrau `--txt-campo`,
  obrigatório em todo campo. Como 16px alarga o seletor, o rótulo encurtou de
  "3x por semana" para **"3x"** — o título ao lado já diz "Meta da semana", e o
  rótulo acessível do campo segue completo.
- **A caixa da dica herdava o estilo do rótulo em que nascia.** No histórico ela
  nasce dentro de um `<h2>` com Anton (fonte de display) e foi lida como "toda
  em negrito" — não era negrito, era outra fonte. Na meta, nascia dentro de um
  rótulo em CAIXA ALTA e saía em maiúscula. Agora a caixa declara família, peso,
  espaçamento e caixa por inteiro: é **superfície própria**, não pedaço do
  título.

O guarda vive em `frontend/test/tipografia.test.ts` e reprova valor cru de
tamanho, peso, espaçamento e família, exige `--txt-campo` em campo de formulário
e exige o reset da `.dica-caixa`. Escala sem guarda apodrece no primeiro
`font-size: 0.83rem` escrito com pressa.

### O que o teste de mutação pegou nesta rodada

Vale registrar porque três dos quatro achados eram **testes que passavam por
motivo errado** — o tipo de falha que uma suíte verde esconde:

1. `"treino em andamento nao oferece registro"` passou a passar por estar na aba
   errada: o botão não existia porque a lista não estava na tela, não porque a
   regra vale.
2. Dava para **apagar a leitura do hash na abertura** — quebrar o router
   inteiro — com a suíte verde, porque todo teste começava na aba inicial e
   navegava por clique. Faltavam "abre na aba que a URL pede" e "botão voltar
   troca de aba".
3. O primeiro teste escrito para o item 2 também passava errado: atribuir
   `window.location.hash` enfileira um `hashchange` que chega **depois** da
   montagem, e o ouvinte salvava o teste. Trocado por `history.replaceState`,
   que muda a URL sem disparar evento.
4. O guarda de tipografia, na primeira versão, importava o CSS com `?raw` de
   dentro de `src/`: compilava, passava, e **passava vazio**, porque o Vitest
   roda com `css: false`. Só a asserção "achou pelo menos um degrau" revelou.

Suíte: **284 no frontend** (era 229) e **339 no backend**, inalterado — nada de
`backend/` mudou hoje.

Commits: `70c6784` (abas), `677d8b9` (aba Treino + dicas), `476d8e2`
(tipografia). No ar e verificado no bundle publicado, não só no workflow verde.

### O que falta da v1.1

- **Offline-first com fila de sync — DESCARTADO em 2026-09-03.** Decisão do
  dono do produto, depois de mapeado o custo real: *"não é o momento; talvez se
  o projeto expandir"*. **Não reofertar** sem que ele traga o assunto.

  Fica registrado o que exigiria, porque o levantamento tem valor se um dia a
  decisão mudar — e porque três dos quatro itens não são código, são projeto:

  1. **Aceitar horário do cliente, com desconfiança.** A v0.9 fixou que
     *timestamp nasce no servidor*, e é o que garante o histórico. Precisaria de
     uma rota que aceite o horário do celular marcando a sessão com origem
     `CLIENT` e **revalidando** no servidor (nada no futuro, nada fora da janela
     de 6h, teto de aumento aplicado) — o horário entra como *alegação*, não como
     fato, e o rastro diz que foi alegada.
  2. **Idempotência.** A fila reenvia, e reenvio duplicado não pode virar dois
     treinos. Exige chave de idempotência gerada no celular e guardada no
     servidor. Sem isso, uma fila é uma máquina de duplicar registros.
  3. **Reconciliar duas verdades na tela** — e é aqui que mora o risco de
     reintroduzir o que a v0.9 consertou. Streak, meta e conquistas vêm do
     servidor; mostrar um toque pendente **sem** recalcular nada localmente
     provavelmente significa exibi-lo como item separado que não soma em nada até
     o servidor confirmar.
  4. **Onde guardar a fila.** `localStorage` não serve (síncrono, e o iOS limpa
     dados de PWA depois de ~7 dias sem uso). Seria IndexedDB, com Background
     Sync onde existir — no iOS não existe, então a fila sobe na abertura do app.

  **O gatilho para reabrir é evidência**, não calendário: alguém perder um treino
  por falta de sinal. Enquanto isso não acontece, o que cobre a dor real é a nova
  tentativa na leitura + verificação na escrita, entregue em 2026-09-03.
- **Comprovante compartilhável.**
- **Onboarding de instalação PWA** — hoje existe a dica flutuante, não um fluxo.
- Design system: cor e tipografia feitos; falta revisar espaçamento e raio.

---

## Estado anterior (2026-08-31)

### Mapa do ano — ENTREGUE

A grade de dias treinados, no estilo do heatmap do GitHub, logo abaixo do card
da meta. `GET /sessions/mapa` — **só leitura, sem migration**.

A decisão que importa aqui não é técnica: **um ano inteiro de quadradinhos
vazios, para quem começou faz um mês, lê como fracasso.** Por isso:

- A janela **começa na semana do primeiro treino da pessoa**, não em 1º de
  janeiro. Quem nunca treinou vê só a semana corrente, e não um ano de vazio.
- Teto de 52 semanas, para a grade não ficar ilegível em celular.
- **Ausência é fundo neutro, nunca alerta.** Nada de vermelho em dia sem treino
  — a grade não serve para cobrar. Tem teste garantindo isso.
- `fim` é **hoje**, não o domingo da semana corrente: dia que ainda não
  aconteceu não é "dia sem treino", e aparece em branco.
- Três níveis de intensidade só (sem treino / 1 treino / 2+). Um degradê fino
  sugeriria uma quantidade que o dado não tem — quase todo dia treinado tem
  exatamente um treino.

A resposta traz **só os dias com treino contável**; o resto é fundo na tela.
Isso mantém o payload curto mesmo com um ano de janela.

Onde mora: `backend/src/sessions/mapa.ts` (a janela, pura),
`frontend/src/mapa.ts` (as colunas, puro) e `frontend/src/MapaDoAno.tsx`.

Suíte: **304 no backend** (120 unitários + 184 e2e) e **212 no frontend**.

### Conquistas: marcos, recordes e fresh start — ENTREGUE

Os três itens que faltavam viraram **um sistema só**, porque marcos e recordes
compartilham a mecânica — o que muda é se o valor é fixo ou pode melhorar. Uma
tabela `Achievement`, avaliada preguiçosamente na leitura de `/sessions`, como o
fechamento semanal.

**16 marcos**, em escada, para sempre haver um próximo degrau visível:
primeiro treino, primeira semana cheia, primeiro mês, 10/25/50/100/200 dias,
4/6/12/26/52 semanas seguidas, 24 horas somadas, e — os dois que mais importam —
`REPAROU` e `RECOMECOU`.

**Por que premiar quem volta:** um catálogo que só premia a sequência perfeita
diz a quem falhou que não há mais nada a ganhar, que é exatamente quando a
pessoa desiste. Voltar depois de um mês fora é o comportamento mais difícil e o
que o produto mais quer.

**3 recordes**: mais semanas seguidas, mais dias seguidos, semana mais cheia.
A **primeira marca não vira festa** — comemorar "1 dia seguido" no primeiro
treino seria barulho em cima de um marco que já está comemorando a mesma coisa.
Só a superação comemora.

`seenAt` guarda se a festa já aconteceu. Sem ele, a tela comemoraria o mesmo
marco em toda visita. Se o `POST /sessions/conquistas/vistas` falhar, a festa
reaparece depois — é o erro certo a cometer: comemorar duas vezes incomoda menos
que nunca comemorar.

**Fresh start** no 1º do mês e do ano (Dai, Milkman & Riis, *Management Science*
2014): marcos temporais separam a pessoa de quem ela era antes. A segunda já
ganha isso de graça, porque a semana reinicia. O texto **nunca menciona o que
ficou para trás**.

Restrições que valem em cada linha de `conquistas.ts`, e estão testadas: nada
compara com outra pessoa; nada pune; zero dado corporal ou clínico; e o que
ainda não foi conquistado aparece como progresso, nunca como dívida.

Rotas: `GET /sessions/conquistas` e `POST /sessions/conquistas/vistas`. O resumo
de `/sessions` já traz `conquistas` e `freshStart`, para a festa aparecer no
mesmo instante do check-out.

**A v1.0 está completa.** Suíte: **339 no backend** (144 unitários + 195 e2e) e
**229 no frontend**.

### O deploy da v1.0 completa (2026-08-31)

Commits `5603da4` (mapa do ano) e `9957d2e` (conquistas). Confirmado nos dois
lados: `{"status":"ok","database":"up","version":"9957d2e"}` e frontend no bundle
`index-VbXX8xSp.js`, com as telas novas dentro dele. As rotas novas respondem
`401` sem token, como as demais. O deploy levou ~2 minutos.

Migration `20260831194313_conquistas_marcos_e_recordes` — **aditiva e toda
nullable**, aplicada pelo `npm run release` do `startCommand`, sem passo manual.

**O que esperar da primeira visita de cada pessoa.** A avaliação preguiçosa vai
encontrar vários marcos de uma vez: quem já treina há semanas recebe "Primeiro
treino", "Primeira semana cheia", "10 dias" e possivelmente "4 semanas seguidas"
na mesma festa. É o comportamento correto — a alternativa seria fingir que a
história anterior não existiu. Os **recordes**, ao contrário, não fazem barulho
retroativo: a primeira marca é gravada com `seenAt` já preenchido, então ninguém
recebe festa de recorde só por ter histórico. Foi exatamente para isso que a
regra existe.

Desta vez a verificação pré-push rodou **os comandos do CI**, não parecidos —
a lição de 28/08 aplicada.

### Scan do GitGuard (2026-08-31) — corrigido em `64a9601`

Os 8 findings eram a mesma regra repetida, `github-actions-mutable-action-tag`:
uma por linha `uses:`. **Tag do Git se move** — quem controlar o repositório da
action reaponta `v4` e o build seguinte executa outro código, sem commit nosso e
sem revisão. Aconteceu de verdade com a `tj-actions/changed-files` em março de
2025. As 8 foram pinadas por SHA de 40 caracteres, com a versão em comentário.

Três coisas que o scanner **não** reportou entraram junto:

1. O CI não tinha bloco `permissions`, então o `GITHUB_TOKEN` herdava o padrão
   do repositório, que pode ser read/write. Agora é `contents: read`. É o que
   **limita o estrago** quando a pinagem falhar.
2. No deploy do Pages, `pages: write` e `id-token: write` valiam para os dois
   jobs — o de build, que roda `npm ci` (código de terceiros), recebia a chave
   de publicação sem precisar dela. Movidas para o job de deploy.
3. `${{ vars.VITE_API_URL }}` era interpolado como **texto** dentro do `run:`,
   antes de o shell existir. Passa por `env:` agora.

Pinar sem atualizador vira dívida — o SHA não muda nem quando a versão nova
conserta uma falha. Por isso o [dependabot.yml](../.github/dependabot.yml) entra
junto: ele atualiza o SHA *e* o comentário da versão, e o CI decide.

**O aviso de `deepmerge-ts` (3 HIGH) fica como está, de propósito.** Chega por
`@prisma/config` ← `prisma`. Só o CLI do Prisma o alcança, no `migrate deploy`,
sem entrada de atacante; e o 6.19.3, o mais novo do 6.x, ainda fixa a versão
vulnerável — o próprio Dependabot não abriu PR, pela mesma razão. Forçar um
`override` poria uma troca de major transitiva no `&&` que decide se a API sobe:
trocar um DoS inalcançável por risco de o backend não iniciar é mau negócio.

**O `fast-uri` (1 HIGH) no frontend também fica, e pelo mesmo raciocínio.**
Apareceu no `npm audit` durante a verificação do #8, mas **não veio dele**: já
estava no lock da `main`. Chega por `vite-plugin-pwa` ← `workbox-build` ← `ajv`,
ou seja, é ferramenta de **build**. Conferido que não vai para o navegador (não
aparece em `dist/assets/`), e as falhas são SSRF e confusão de host — precisam de
uma URI de atacante sendo resolvida em tempo de execução, o que não acontece num
gerador de service worker. Reavaliar quando o `vite-plugin-pwa` subir o
`workbox-build`.

**Vale lembrar o que este scan não cobre:** Semgrep e busca de segredo não olham
regra de negócio — nada ali verifica se uma pessoa consegue ler o treino de
outra. Isso foi a auditoria à mão de 27/08. Relatório limpo não é app seguro.

### Os 8 PRs do Dependabot, testados um por um (2026-09-02)

Cada um foi aplicado num branch local e submetido aos **comandos do CI**, não a
comandos parecidos. Resultado:

| PR | O que traz | Veredito |
|---|---|---|
| #2 | `deploy-pages` 4.0.5 → 5.0.0 | seguro, risco revisado |
| #3 | `checkout` 4.4.0 → 7.0.1 | seguro, risco revisado |
| #4 | `setup-node` 4.4.0 → 7.0.0 | seguro, risco revisado |
| #5 | `upload-pages-artifact` 3.0.1 → 5.0.0 | seguro, risco revisado |
| #6 | `lucide-react` 1.31 → 1.37 | **MERGEADO** (`7acb6dd`) |
| #7 | produção do backend: NestJS 12, Prisma 7 | **FECHADO** — bloqueado |
| #8 | dev do frontend: TypeScript 7, Vite 8.2 | **MERGEADO** (`cf45bd9`) |
| #9 | dev do backend: NestJS 12, Jest 30, TS 7 | **FECHADO** — bloqueado |

**Desfecho (2026-09-02):** #6 e #8 mergeados; #7 e #9 fechados, cada um com o
motivo registrado no próprio PR. O CI do branch do #7 fechou em `failure`, o que
confirma o diagnóstico: não foram fechados por precaução, eles quebravam mesmo.

Antes do merge, o #6 foi **reverificado** — e valeu a pena. A tabela acima dizia
`1.31 → 1.35`, mas o PR estava em **1.37**: o Dependabot o atualizou às 16:20Z,
antes da rodada de teste, e o número velho foi copiado da tabela do dia 31. O
veredito se sustentou (lint, 229 testes e build verdes em 1.37), mas por um turno
este documento afirmou verde sobre uma versão que não era a do PR. **Registrar o
resultado sem registrar a versão exata é registro que envelhece mal.**

O #8 também foi verificado **depois** do merge do #6, não antes: os dois mexiam
em `frontend/package.json` e no mesmo `package-lock.json`. O GitHub ainda dizia
`MERGEABLE` porque não havia recalculado, e um lockfile mesclado por texto pode
sair válido e semanticamente errado — a mesma classe de falha do #7/#9. O merge
foi ensaiado localmente e submetido a `npm ci` (que reprova lock fora de sincronia)
antes de valer no GitHub.

**#7 e #9 não podem ser mergeados, nem juntos nem separados.** O motivo é
`@nestjs/throttler`: a versão mais nova que existe (6.5.0) declara peer
`@nestjs/common` só até `^11.0.0`. NestJS 12 não tem como entrar enquanto o
throttler não sair. E ele não é removível — é o rate limit que protege o login,
a trava que veio da auditoria de 27/08. Forçar com `--legacy-peer-deps` seria
trocar um bump por risco de o limitador de login parar calado.

Separar o Prisma 7 do resto também não resolve, e o motivo é maior que o bump:
**o Prisma 7 removeu `datasource.url` do schema.** A URL passa a viver em
`prisma.config.ts` e o `PrismaClient` precisa receber um `adapter`. Isso mexe em
`PrismaService`, no setup do e2e, no script de semear e no `migrate deploy`. Pior:
o `tsconfig.json` do backend não restringe a `src/`, e o `start:prod` é
`node dist/main` — **um `prisma.config.ts` na raiz entraria na compilação e o
`dist/main.js` viraria `dist/src/main.js`, derrubando a API em produção.** É a
mesma armadilha de `.ts` fora de `src/` que já derrubou o start antes.

E o Prisma 7 **não** resolve o aviso de `deepmerge-ts`: o `@prisma/config@7.10.0`
ainda fixa a `7.1.5`. Ou seja, a migração custa código e não paga nada em
segurança. **Não é agora.**

Riscos que foram checados nos PRs de action, e estão limpos: o cache automático
do `setup-node` v5 só liga com o campo `packageManager` no `package.json`, que
não existe em nenhum dos dois; a v4 do `upload-pages-artifact` deixou de incluir
arquivos ocultos, e o `dist/` não tem nenhum nem precisa de `.nojekyll`; e o
bloqueio de fork PR do `checkout` v7 vale para `pull_request_target` e
`workflow_run`, que este repositório não usa. **#2 e #5 mexem no caminho de
publicação: merge um de cada vez**, para saber qual quebrou se quebrar.

O #8 traz 2 avisos novos do oxlint 1.80 (`set-state-in-effect` em `tema.ts:150`
e `PontoScreen.tsx:106`). Não reprovam — o lint sai com código 0. E são de baixo
valor: o do `PontoScreen` é o `carregar()` de busca de dados, e buscar dado em
effect necessariamente liga o estado de carregando.

### Os quatro PRs de action, mergeados em sequência (2026-09-02)

Fila do Dependabot zerada. Cada um foi mergeado com squash, e os dois do caminho
de publicação **isolados**, como o registro acima mandava.

| PR | Ação | Commit | CI | Pages |
|---|---|---|---|---|
| #3 | `checkout` 4.4.0 → 7.0.1 | `d7237e6` | cancelado (ver abaixo) | verde |
| #4 | `setup-node` 4.4.0 → 7.0.0 | `0cfd020` | verde | verde |
| #5 | `upload-pages-artifact` 3.0.1 → 5.0.0 | `7a59276` | verde | verde |
| #2 | `deploy-pages` 4.0.5 → 5.0.0 | `fdae51f` | verde | verde |

Nos dois de publicação a verificação **não** parou no workflow verde: `index`,
bundle, `manifest.webmanifest` e `sw.js` foram buscados no site e voltaram 200.
Workflow verde diz que o passo rodou, não que o site está servindo. O hash do
bundle não mudou (`index-DuGwuMc8.js`), o que é o esperado — mudou o workflow,
não o código.

**O CI do #3 saiu `cancelled`, e a causa fui eu.** O CI tem
`cancel-in-progress: true` agrupado por workflow+ref; mergear o #4 logo em
seguida cancelou o run do #3. Não houve risco pendente (o Pages do #3 fechou
verde e o run do `0cfd020` cobre os dois commits), mas o sinal **isolado** do #3
foi perdido. A regra de "um de cada vez" só foi de fato respeitada no #5 e no
#2. Fica anotado: em bump de action, esperar o run fechar antes do próximo
merge, senão a checagem em série vira checagem em lote sem ninguém decidir isso.

As quatro seguem **fixadas por SHA** com a versão no comentário ao lado, que era
a exigência que veio do GitGuard.

### Plugin de skills de terceiro — avaliado e descartado (2026-09-02)

Avaliado o [mattpocock/skills](https://github.com/mattpocock/skills) (MIT,
ativo). **Decisão do dono: não adotar.** Não voltar a propor sem pedido novo.

Registrado porque a avaliação tem valor mesmo com a resposta negativa: as skills
úteis seriam `tdd`, `diagnosing-bugs` e `grill-with-docs`; `code-review` e
`handoff` duplicariam o que já existe aqui; e as de ticket/triagem pressupõem um
board que este projeto não tem. O custo real estava no
`setup-matt-pocock-skills`, **obrigatório uma vez por repositório**, que escreve
`CONTEXT.md`, `CONTEXT-MAP.md`, `docs/adr/`, `docs/agents/` e altera uma seção
do `CLAUDE.md` — scaffolding em cima de uma convenção de documentação que já
funciona, e em inglês, num projeto que é todo em português.

### O agrupamento do Dependabot estava errado, e foi consertado

A primeira versão do [dependabot.yml](../.github/dependabot.yml) agrupava só por
`dependency-type`. O efeito foi partir o major do NestJS em dois PRs — `core` no
de produção, `testing` no de desenvolvimento — que **se anulavam** (um exige o
outro) e ainda conflitavam no `package-lock.json`. Agora `@nestjs/*` e
`prisma`/`@prisma/*` têm grupo próprio, e o frontend tem grupo para
`react`/`@types/react` pelo mesmo motivo. **Pacote que sobe de major junto
precisa viver no mesmo grupo.**

---

## Estado anterior — v1.0 e Fase A (2026-08-28)

### Registro de treino, Fase A — ENTREGUE

Pedido que **veio dos usuários**, não do roadmap: "quero registrar os exercícios
que fiz". Entregue a **Fase A**, como a decisão das duas fases manda.

No check-out, o formulário abre sozinho — é o momento de maior intenção; pedir
depois é pedir para quem já guardou o celular. Três campos, **todos opcionais**:

- **Tipo de treino**: até 3 chips (Peito, Costas, Pernas, Ombros, Braços,
  Abdômen, Cardio, Corpo inteiro, Outro). Lista, e não valor único, porque
  "peito e tríceps" é o caso comum — forçar um só empurraria a maioria para
  "Outro" e estragaria o sinal.
- **Esforço 1–5** percebido. Clicar no que já está marcado desmarca.
- **Anotação** de até 280 caracteres. É aqui que "supino 4x10 com 40kg" cabe.

Decisões que não são estilo:

1. **Nada disso entra em contagem.** Rótulo não decide streak, meta nem placar.
2. **Fica fora da trava de correção.** A trava (uma por sessão, teto de +1h)
   existe porque horário decide o que conta. Anotar é livre e ilimitado — gastar
   a única correção da sessão para consertar um erro de digitação puniria
   exatamente o comportamento que se quer estimular nesta fase. Por isso a rota
   é separada: `PATCH /sessions/:id/registro`, não `PATCH /sessions/:id`.
3. **Preencher é sempre opcional**, e a tela diz isso. O check-out sustenta
   streak, meta e placar; pôr fricção ali arriscaria a métrica que já funciona
   para ganhar uma que ainda não existe.
4. **Campo ausente não mexe, `null` limpa.** Sem essa distinção, salvar só o
   esforço apagaria a nota — é o bug mais caro possível nesta tela, e tem teste
   com mutação provando que é pego.

**Como decidir a Fase B:** a evidência é o próprio conteúdo. Se as pessoas
escreverem "supino 4x10 com 40kg" nas notas, o registro estruturado se
justifica; se as notas ficarem vazias, não se justificava mesmo. O número sai de
uma consulta (`workoutTypes`, `effort` ou `note` preenchidos ÷ total de sessões)
— não foi construído painel para isso, de propósito.

Migration `20260828181025_registro_de_treino_fase_a`, aditiva e nullable.
Suíte: **291 no backend** (112 unitários + 179 e2e) e **194 no frontend**.

---

## Estado da v1.0 (2026-08-28)

A **v1.0 está entregue e EM PRODUÇÃO** desde 2026-08-28. O que entrou:

- **Meta semanal** de 3 a 6 treinos (padrão 3), trocável pela pessoa, valendo
  sempre **a partir da semana seguinte**.
- **Streak de semanas** como número principal da home. A streak diária virou
  **recorde histórico**.
- **Congelamento**: 2 tokens acumuláveis, +1 a cada 4 semanas cumpridas
  seguidas, aplicados automaticamente e em silêncio.
- **Reparo**: depois de uma semana perdida, fazer `meta + 1` na seguinte
  devolve a sequência. Um por trimestre.
- **Modo recomeço** depois de 4 semanas sem treino, sem nenhuma cobrança.

Junto entrou o **`/health` devolvendo a versão do build** (`version` com o SHA
curto do commit): a pendência de "confirmar o que está no ar" existia porque não
havia como saber qual build rodava, e a alternativa era criar conta de teste em
produção — que a API não sabe apagar.

Suíte: **262 no backend** (96 unitários + 166 e2e) e **169 no frontend**,
verdes. Build e lint limpos, com o aviso antigo de `react(only-export-components)`
em `frontend/src/AuthContext.tsx:87`.

### Decisão de arquitetura: o fechamento é preguiçoso, não agendado

A especificação pedia "job de fechamento na segunda 00:05". **Não existe job.**
No plano free do Render o backend dorme depois de 15 min sem uso — 00:05 de
segunda é justamente o horário em que ele com certeza está dormindo, então um
cron in-process nunca dispararia. Um agendador externo resolveria, ao custo de
mais um segredo e mais uma peça que cai calada.

Em vez disso, a semana fecha **na primeira leitura depois que ela acabou**
(`SemanasService.fecharPendentes`). As linhas são idempotentes por
`(usuário, semana)`, então repetir não muda nada, e quem ficou um mês fora tem
todas as semanas fechadas em ordem quando volta. Abrir o app *é* o job.

Limite: reconstrói até **53 semanas** para trás. Ausência maior volta do zero —
que é onde a regra de ausência longa levaria de qualquer forma.

### O que faltava da v1.0 — FECHADO em 2026-08-31

O deploy de 28/08 entregou só a especificação *Meta semanal, streak de semanas e
congelamento*. Os outros quatro itens da linha da v1.0 — ~15 marcos curados,
heatmap do ano, prêmio na quebra de recorde e *fresh start* no dia 1º — foram
entregues e subiram em 31/08 (ver o topo deste documento). **Não há item da v1.0
em aberto.**

### O deploy (2026-08-28)

Commits: `096d5b1` (v1.0), `5af064c` (`/health` com versão), `68cf2c6` (docs) e
`d66bf61` (conserto do build do Pages). Backend confirmado em
`{"status":"ok","database":"up","version":"68cf2c6"}` e frontend no bundle
`index-DsLHd7ox.js`.

**Não houve passo manual de migration**: o `startCommand` do
[render.yaml](../render.yaml) é `npm run release && npm run start:prod`, e
`release` é `prisma migrate deploy`. Isso também serve de prova: como a API nova
está servindo, o `&&` garante que o `migrate deploy` passou. Nenhum backfill foi
necessário.

**O que deu errado, e o que ensina.** O primeiro push subiu o backend e deixou o
frontend no bundle antigo: `tsc -b` (o que o CI roda) reprovou um objeto `resumo`
inline em `PontoScreen.test.tsx` que não tinha ganhado os campos novos. A
checagem local havia sido feita com `npx tsc --noEmit`, que não cobre os
arquivos de teste da mesma forma — **conferir com o comando do CI, não com um
parecido**. Ninguém foi afetado no intervalo, porque o backend novo continua
devolvendo `streak` e `semana`, que é tudo o que a tela antiga lê.

**Sobre o `version` do `/health`:** ele mostra o último commit que chegou ao
build do *backend*, então pode ficar atrás do `HEAD` quando o commit é só de
frontend — foi o caso de `d66bf61`.

---

## Estado anterior — v0.9 (2026-08-27)

App **no ar** (ver [HANDOFF](HANDOFF.md)). A **v0.9 está entregue e em
produção**: a tela roda sobre `WorkoutSession` (`/sessions`), com `Group` +
`Membership`, `User.timezone`, auditoria `SessionCorrection`, streak e resumo
semanal calculados no servidor. O backfill já rodou no Neon. Além do escopo da
v0.9, no mesmo dia entraram tema claro/escuro, polimento mobile, a auditoria de
segurança e a trava de correção de datas.

Commits que subiram em 2026-08-27, em ordem:

| Commit | O que entrou |
|---|---|
| `9b419fe` | v0.9: cutover da tela para `/sessions` |
| `0afdffe` | v1.1 antecipado: tema claro/escuro e polimento mobile |
| `8015b33` | Auditoria de segurança: fecha a escrita em `/time-entries`, conserta o rate limit do login |
| `eb0cc06` | Trava a correção de datas, tema simplificado para dois estados |
| `988f64f` | Fecha o furo do +4h na correção e dá retorno na tela (erro, loading, sucesso) |
| `c54308c` | Ferramenta para desfazer as correções feitas antes da trava |

Suíte ao fim do dia: **200 no backend** (62 unitários + 138 e2e) e **148 no
frontend**, verdes. Build e lint limpos, com o aviso antigo de
`react(only-export-components)` em `frontend/src/AuthContext.tsx:87`.

### O que ficou pendente para a pessoa fazer (não é código)

1. ~~**Rotar a senha do Neon.**~~ **FEITO em 2026-08-28.** A string antiga tinha
   sido colada em chat; foi resetada no Neon e trocada no Render, com o
   `/health` confirmando o banco de pé.

   Como refazer, se um dia precisar: Neon → `Roles` → `Reset password`; depois
   Render → `Environment` → `DATABASE_URL` → Save Changes (redeploya sozinho).

   **A pegadinha que custou uma tentativa:** o Neon mostra a string no formato
   `.env`, ou seja, a linha inteira `DATABASE_URL="postgresql://..."`. No campo
   do Render vai **só o valor** — sem `DATABASE_URL=` e sem as aspas. Colar a
   linha toda faz a API subir e o `/health` devolver 503 com
   `"database":"down"`. Confira também o `?sslmode=require` no fim e prefira a
   conexão **direct** à **pooled** (sem `-pooler` no host): o `startCommand`
   roda `prisma migrate deploy` antes de subir, e migration por conexão pooled
   pode falhar.

   Onde ficam os passos, concretamente:

   | Passo | Onde |
   |---|---|
   | Resetar a senha | Painel do Neon → o projeto → `Roles` → `Reset password` |
   | Trocar no Render | [dashboard.render.com](https://dashboard.render.com) → serviço **`gym-monkey-api`** → menu da esquerda → **Environment** → editar `DATABASE_URL` → **Save Changes** (redeploya sozinho) |
   | Conferir | Abrir <https://gym-monkey-api.onrender.com/health> no navegador |

   O `/health` serve exatamente para isso porque faz um `SELECT 1` antes de
   responder: `{"status":"ok","database":"up"}` = senha nova funcionando; **503
   com `"database":"down"` = a API subiu mas não conecta**, quase sempre string
   incompleta ou sem `?sslmode=require`. Demora de 30–60 s no primeiro acesso é
   cold start do plano free, não erro. Depois, fazer login no app confirma ponta
   a ponta (o login lê a tabela `User`).

   **A senha nova não entra em chat nem em arquivo do repositório.** Migration
   não precisa de comando manual (o Render roda no start). Para manutenção
   pontual (`set-role`, `reverter-correcao`), exportar a variável no próprio
   shell e rodar o comando ali. O `.env` do repositório aponta para o Postgres
   local e deve continuar assim.
2. ~~**Reverter a sessão de 240 min do Flávio.**~~ **Dispensado em 2026-08-28**:
   decisão de manter, é conta de teste. A ferramenta continua disponível
   (`npm run reverter-correcao -- --listar`, depois `-- <sessionId>` para
   simular e `--confirmar` para aplicar) caso a decisão mude. Vale notar o
   efeito na v1.0: como a meta conta **dias distintos com treino**, essa sessão
   vale 1 dia como qualquer outra — os 240 min só inflam o "tempo essa semana".
3. ~~**Confirmar o teto de +1h em produção.**~~ **RESOLVIDO em 2026-08-28**: o
   `/health` devolve `version` e o build no ar (`68cf2c6`) é muito posterior a
   `988f64f`, o commit da trava — que tem teste no CI. Como funciona:
   (`{"status":"ok","database":"up","version":"988f64f"}`). A trava entrou em
   `988f64f` — se a `version` for esse commit ou posterior, o código está lá, e
   a regra tem teste no CI.

   Testar o comportamento de ponta a ponta exigiria uma conta comum, e **criar
   uma conta de teste em produção é irreversível**: `POST /auth/register` é
   público mas nasce pendente de aprovação, e `users.controller.ts` só tem `GET`
   e `PATCH` de `active`/`role` — **não existe rota de exclusão de usuário**.
   Uma conta de teste ficaria para sempre na lista e apareceria no painel "quem
   sumiu" (v1.2) e no placar (v1.3). Se quiser a prova comportamental mesmo
   assim, o caminho limpo é pedir ao Flávio (que já é conta comum) para tentar
   um +4h e ver se aparece "A correcao pode aumentar o treino em no maximo
   60 min".
4. ~~**Avisar o grupo** das mudanças visíveis.~~ **FEITO em 2026-08-28.**
   Quando a v1.0 subir, vale um segundo aviso: a home muda de cara (a meta
   semanal passa a ser o número principal, no lugar da streak diária).

### Próximo passo de código

Feito em 2026-08-28 — ver [Estado atual](#estado-atual--onde-paramos-2026-08-28).

## Decisões já tomadas (não re-discutir)

| Decisão | Escolha |
|---|---|
| Público | Grupo fechado agora; expandir depois via **verificação por e-mail** (aprovação manual pelo supervisor é só o mecanismo inicial) |
| Multi-tenant | **Modelar `Group` + `Membership` já na primeira migration**, mesmo com um grupo só — evita migration dolorosa depois, com dados em produção |
| Ordem | **Fundação técnica primeiro** (v0.9), antes de UI, engajamento e painel do supervisor |
| Registro de treino | **Duas fases**: Fase A leve; Fase B completa (séries/cargas/PRs) só se a Fase A mostrar adesão real |
| Ambição (pessoal / portfólio / SaaS) | **Em aberto de propósito.** Não trava nada até a v1.3, quando passa a decidir arquitetura (cobrança, isolamento entre grupos) |

## Diagnóstico que motiva a v0.9

1. **Não existe entidade "sessão de treino".** `time-entries.service.ts` infere
   o próximo tipo a partir do último registro: esquecer o check-out faz o botão
   abrir escrito "Finalizar treino" no dia seguinte e pareia um treino de 18h.
   Sem sessão, não há onde pendurar séries e cargas.
2. **Histórico editável e deletável pelo próprio usuário, sem rastro.**
   Inviabiliza qualquer placar ou relatório: dá pra fabricar 30 dias de streak
   em dois minutos.
3. **Supervisor não vê frequência.** `GET /users` devolve nome, e-mail, papel e
   status; o painel aprova conta e nada mais.
4. **Streak diária pune o descanso.** `calcularStreak` conta qualquer registro,
   inclusive um check-in solto de 40 segundos, e não tem dia de folga.
5. **Inteligência toda no cliente, sem fuso e sem paginação.** Streak, sessões
   e semana são calculados em `calculos.ts` com o fuso do dispositivo, e
   `GET /time-entries` devolve o histórico inteiro. No iOS o cache do PWA
   expira após ~7 dias de inatividade — estado de streak no cliente é bug
   garantido.

---

## v0.9 — Fundação — ENTREGUE (2026-08-27)

Estimativa: ~5 a 7 dias de trabalho focado. Nada aqui aparece na tela, e é
justamente por isso que vem primeiro: as demais versões dependem desta camada.

### Checklist

- [x] **Migration**: entidade `WorkoutSession` — `startedAt`, `endedAt`,
      `durationMin`, `status`, `source`, mais `dayKey` (o dia já resolvido no
      fuso do usuário, para a regra de "1 contável por dia" virar `group by`).
- [x] **Migration**: `Group` + `Membership` (mesmo com um grupo só). A migration
      já cria o grupo `gym-monkey` e vincula todos os usuários existentes.
- [x] **Migration**: `User.timezone`, default `America/Sao_Paulo`. A trava de
      "só o supervisor altera" fica na camada de serviço (ainda a fazer).
- [x] **Garantia de banco**: índice único parcial impedindo **duas sessões
      abertas** para a mesma pessoa (`WHERE status = 'OPEN'`). Não dá para furar
      nem com dois cliques simultâneos — não depende da regra de serviço.
- [x] **Auditoria**: tabela `SessionCorrection` (somente-append) com autor,
      motivo e o antes/depois. `authorId` é nulável com `ON DELETE SET NULL`:
      excluir a conta apaga de verdade (LGPD) sem destruir o rastro nem ser
      bloqueado por ele.
- [x] **Backfill**: `npm run backfill-sessoes` converte os `TimeEntry` em
      sessões pareadas, preservando o histórico como auditoria. A lógica vive em
      `src/sessions/backfill.ts` (testada, 12 casos); o script é só a casca.
      Idempotente por usuário, e aceita `userIds` para reprocessar uma pessoa
      só. **Precisa ser rodado à mão em produção**, como o `set-role`.
- [x] **`SessionsService`** com as regras de integridade (tabela abaixo):
      duração mínima, truncamento no máximo, auto-encerramento, cooldown e
      "1 contável por dia". Streak e resumo semanal calculados no servidor, no
      fuso do usuário (`Intl`, sem biblioteca nova). Ainda **sem controller** —
      os endpoints vêm no passo seguinte.
- [x] **Timestamps gerados exclusivamente no servidor**, nunca aceitos do
      cliente (persiste em UTC, agrega no fuso do usuário). A única porta que
      aceita horário do cliente é a correção — e justamente por isso ela é
      auditada e revalidada. O `PATCH /time-entries/:id` antigo continua no ar
      até o cutover da tela.
- [x] **Auditoria imutável**: `PATCH /sessions/:id` exige motivo e grava o
      antes/depois com o autor **na mesma transação** da alteração — não existe
      mudança sem rastro. A correção passa pelas mesmas regras de duração, então
      não é atalho para burlar o mínimo. `GET /sessions/:id/corrections` expõe a
      trilha. Dono corrige o próprio treino; supervisor corrige de qualquer um.
- [x] **`GET /sessions` paginado** (cursor), devolvendo streak e resumo semanal
      já calculados no servidor, e um campo `contavel` por sessão para a tela
      não reimplementar a regra. Cursor em vez de offset porque a lista cresce
      pelo topo. `POST /sessions/toggle` não aceita horário do cliente.
- [~] **Mover a lógica de `calculos.ts` para o backend**: streak e resumo
      semanal já existem no `SessionsService`, com testes próprios. O
      `calculos.ts` do frontend continua no ar até o cutover da tela — por ora
      as duas implementações coexistem de propósito.
- [x] Manter a suíte verde e aplicar as migrations em dev / test / CI / Neon.
      Ao fechar a v0.9: **180 no backend** (66 unitários + 114 e2e) e 134 no
      frontend, todos verdes. Migrations aplicadas em dev, test, CI e **Neon** (2026-08-26), e o
      backfill rodado em produção: 11 sessões criadas a partir de 19 `TimeEntry`,
      todas vinculadas ao grupo, nenhuma `OPEN`. Rodar de novo é seguro
      (idempotência confirmada no próprio Neon).

### Cutover da tela — FEITO

O frontend fala com `/sessions`. As rotas `/time-entries` seguem no ar como
auditoria, mas a tela não as usa mais (há teste garantindo que as funções
antigas não voltem ao `api.ts`).

O que mudou para quem usa:

1. **O botão "excluir registro" saiu.** Histórico apagável pelo próprio usuário
   é o que inviabiliza qualquer placar, então a API de sessões **não tem
   `DELETE`**. Corrigir é o caminho — com motivo obrigatório e com rastro.
2. **O histórico mostra sessões, não check-ins soltos**: uma linha por treino,
   com início, fim e duração.
3. **Sessão que não conta aparece apagada e explicada** ("Abaixo de 20 min: nao
   conta na semana"), para o número da semana ser explicável olhando a lista.
4. **Streak e resumo vêm do servidor**; `calculos.ts` ficou só com formatação e
   agrupamento.
5. **Paginação por cursor** com "Carregar mais".

Dois cuidados que só apareceram ao olhar a tela renderizada, ambos sobre
`AUTO_CLOSED` (fim sintético = início + 6h): a duração mostra **"nao
finalizado"** em vez de "6h", e o **horário de fim não é exibido** — mostrar
"18:00 - 00:00" sugeriria treino até meia-noite.

O teto de correções foi resolvido em 2026-08-27, junto com a trava de datas —
ver "Correção de treino" abaixo.
**Os números da semana caem para quem inflou.** Medido em produção antes de
   rodar o backfill (simulação) e confirmado depois, com resultado idêntico:

   | Pessoa | Treinos/semana antes | Depois | Por quê |
   |---|---|---|---|
   | Gabrielly | 4 | **0** | 10 registros viraram 5 sessões de 0 min |
   | Flavio | 1 | **0** | sessão abaixo de 20 min |
   | Nicolas | 1 | 1 (95 min intactos) | treino real, não muda |

   **Ninguém perdeu streak** — todas já estavam em 0. O que cai são contagens
   que nunca corresponderam a treino de verdade.

### Correção de treino (revisto em 2026-08-27)

A auditoria de segurança olhou de novo a correção e achou o furo mais grave até
agora: a correção era o caminho para **fabricar treino**. Medido no ambiente de
dev, com um usuário comum:

| Passo | Efeito |
|---|---|
| Sessão de **3 min** de hoje, reescrita como 62 min num dia 9 dias atrás | virou `COMPLETED`, contável, e o `dayKey` **mudou** |
| Segunda correção na mesma sessão, movendo para ontem | **streak foi de 1 para 3**; semana de 2 para 3 treinos, 107 → 169 min |

A auditoria registrava as duas correções fielmente. E não impedia nada — o que
mostra a diferença entre *rastrear* e *restringir*.

Três travas, todas com o caso legítimo ("esqueci de finalizar") preservado:

| Trava | Usuário comum | Supervisor |
|---|---|---|
| **O início não se mexe** — é o único dado de onde sai o `dayKey`, ou seja, em que dia o treino conta | `startedAt` recusado (400) | pode, auditado |
| **Uma correção por sessão** — o golpe precisou de duas | 2ª recusada (400) | sem limite |
| **O fim cabe na janela de 6h do início** | vale | **vale também** |

A janela de 6h substitui a ideia de "tem de ser no mesmo dia" de propósito: quem
treina 23:30 e termina 00:30 atravessa a meia-noite legitimamente, e uma regra de
mesmo-dia barraria justo esse caso. Sem a janela, pôr o fim dias depois fazia a
duração ser truncada no teto de 4h e a sessão virar `COMPLETED` — qualquer toque
de 1 segundo virava treino contável de 4 horas.

#### Quarta trava: teto de aumento (2026-08-27, relatado em produção)

As três acima **não bastaram**, e quem achou foi o Flávio, usando o app: ele
iniciou um treino e pôs o fim 4h à frente. Reproduzido: sessão de **1 min → 240
min contáveis**, semana de 0 para 240 min.

O motivo de a janela de 6h não pegar: **4h cabe dentro de 6h**, e 4h é exatamente
o `DURACAO_MAX_MIN`. O abuso vivia na folga entre as duas regras — eu tinha
fechado o teto e o piso, e deixado o meio aberto.

A trava: a correção pode **reduzir a duração à vontade**, mas só pode
**aumentá-la em até 60 min** (`AUMENTO_MAX_CORRECAO_MIN`) para usuário comum.
Reduzir não infla número nenhum; aumentar é a única direção abusável. Supervisor
não tem teto.

Dois detalhes que só apareceram implementando:

- **O aumento é medido na duração bruta, não na classificada.** `classificar`
  trunca em 240 min, então medir na duração já truncada deixaria esticar uma
  sessão de 200 min para 300 (aumento real de 100) parecendo aumento de 40.
- **Em `AUTO_CLOSED` a base é zero, não o `durationMin` gravado.** Ali os 360 min
  são o *teto* de auto-encerramento, não uma medida: a pessoa nunca tocou em
  finalizar. Se fossem a base, corrigir de 360 para 360 seria "aumento zero" e
  entregaria uma sessão contável de 4h de graça.

Medido depois, usuário comum com sessão de 1 min: **+4h → 400**, **+2h → 400**,
**+55min → 200** (55 min, contável). Semana ficou 55 min em vez de 240.

#### Como consertar o que já passou

A trava impede correções novas — **não desfaz** a que já foi feita. Para isso há
`npm run reverter-correcao`, no mesmo padrão do `set-role` e do `backfill`
(lógica em `src/sessions/reverter-correcao.ts`, testada; o script é só a casca).

O valor original **não precisa ser adivinhado**: a linha de `SessionCorrection`
guarda o `startedAtBefore` / `endedAtBefore` / `statusBefore`. É exatamente para
isto que a auditoria existe.

```bash
cd backend
npm run reverter-correcao -- --listar                 # o que foi corrigido, atual vs original
npm run reverter-correcao -- <sessionId>              # SIMULA
npm run reverter-correcao -- <sessionId> --confirmar  # aplica
```

Em produção: `DATABASE_URL` apontando pro Neon. **Simula por padrão** — escrita
exige `--confirmar`, como o backfill.

A reversão **entra na trilha** como uma correção nova, em vez de apagar o que
houve: a auditoria é somente-append, então desfazer também deixa rastro. Senão o
histórico passaria a mentir na direção oposta.

Dois cuidados que os testes cobrem:

- **`AUTO_CLOSED` não vira `COMPLETED` de 4h na volta.** Ali os 360 min gravados
  são o teto do auto-encerramento; passá-los por `classificar` devolveria 240 min
  contáveis — a reversão criaria um treino que nunca existiu.
- **Reverte para a PRIMEIRA correção**, não a última: as seguintes partem de um
  valor já corrigido.

Ensaiado ponta a ponta no ambiente de dev, com o estado corrompido criado pela
API real (linha de auditoria genuína): sessão de 240 min → 1 min `SHORT`, semana
de 240 min → 0, e a trilha ficou com as duas linhas, nada apagado.

> Depois da reversão a sessão fica com duas correções, então o dono **não** pode
> mais corrigi-la (é uma por sessão). Se a pessoa realmente treinou, quem ajusta
> é o supervisor, que não tem esse limite.

#### Retorno na tela (mesmo relato)

A correção não dava nenhum sinal de que funcionou, e o erro aparecia no topo do
card — em celular, muitas vezes fora da tela de quem estava digitando. Agora:

- O **erro aparece dentro do formulário**, e o formulário **fica aberto** com o
  que foi digitado (o erro quase sempre é sobre o horário escolhido; fechar
  obrigaria a redigitar).
- O botão mostra **"Salvando..."** e os campos travam durante o envio. O
  recarregamento acontece **antes** de fechar o formulário, senão a lista velha
  aparecia por um instante como se nada tivesse ocorrido.
- **Confirmação que diz o resultado**, não só "salvo": corrigir para 5 min é
  aceito e a sessão continua não contando — sem essa frase, a pessoa olharia o
  número da semana parado e concluiria que o app errou. A mensagem some sozinha
  depois de alguns segundos.

A resposta da API passou a trazer **`corrigivel`** por sessão, na mesma ideia do
`contavel`: a tela esconde o lápis sem reimplementar a regra.

Medido depois, com usuário comum: mover o dia → 400; fim +10h → 400; **fim +55min
→ 200** (`COMPLETED`, 55 min, contável); segunda correção → 400. O `dayKey` ficou
onde estava.

> Cuidado ao testar: uma conta **supervisor** pode mexer no início por decisão de
> projeto. Testar a trava com conta de supervisor dá falso negativo — foi o que
> aconteceu na primeira tentativa de validação.

### Regras de integridade da sessão

Sem esta camada, toda gamificação premia quem toca no botão duas vezes.

| Regra | Valor | Comportamento |
|---|---|---|
| `DURACAO_MIN` | 20 min | Sessão menor entra no histórico como "sessão curta" e **não** conta para meta, streak, pontos ou placar |
| `DURACAO_MAX` | 4 h | Sessão maior é **truncada** nos minutos e ainda conta como 1 treino (protege quem esqueceu o check-out) |
| Auto-encerramento | 6 h | Sessão aberta há mais de 6h fecha como `AUTO_FECHADA` e não é contável |
| Aumento máximo na correção | 60 min | Reduzir é livre; aumentar além disso exige supervisor |
| Treinos contáveis por dia | 1 | Havendo várias sessões válidas no mesmo dia, conta a mais longa; a soma de minutos do dia continua sendo exibida |
| Cooldown | 30 min | Novo check-in só é aceito 30 min após o último check-out |

---

## Especificações prontas (para quando chegar a vez)

Ficam aqui porque a decisão é sutil e errar custa caro. O resto do roadmap é
trabalho conhecido.

### Meta semanal, streak de semanas e congelamento (v1.0) — ENTREGUE (2026-08-28)

`semana` = ISO week, segunda 00:00 a domingo 23:59:59, **no fuso do usuário**.
Job de fechamento na segunda 00:05, idempotente por `(user_id, iso_week)`.

```
treinos = dias distintos com treino contável na semana

se treinos >= meta:
    streak_semanas += 1
    status = CUMPRIDA

senão se tokens_congelamento > 0:
    tokens_congelamento -= 1
    status = CONGELADA          # não avança, mas NÃO zera

senão:
    streak_anterior = streak_semanas   # guardar para o reparo
    streak_semanas = 0
    status = PERDIDA
```

- `meta` = 3 a 6, default **3**. Alteração só vale a partir da semana seguinte
  (impede mudar a meta no domingo para forjar sucesso).
- **Tokens de congelamento**: máximo 2 acumuláveis; novo usuário começa com 2;
  ganha +1 a cada 4 semanas consecutivas `CUMPRIDA`. Aplicação é **automática e
  silenciosa** — o usuário descobre depois, vendo o floco de neve na semana.
- **Reparo**: após uma semana `PERDIDA`, atingir `meta + 1` na semana seguinte
  restaura `streak_anterior + 1`. Um reparo por trimestre.
- **Ausência longa**: 4 semanas ou mais sem sessão válida zera a streak e ativa
  o modo "recomeço", sem nenhuma mensagem de culpa.
- A streak diária continua **exibida como recorde histórico**, nunca punitiva.
  O contador principal da home passa a ser a semana.

Base: 4 ou mais sessões por semana durante 6 semanas é o limiar de formação de
hábito (Kaushal & Rhodes, *J Behav Med* 2015). Os parâmetros de congelamento
seguem o que o Duolingo mediu em teste A/B.

#### O que mudou na implementação (2026-08-28)

Três decisões que a especificação não previa, tomadas ao codar:

1. **Sem job agendado.** O fechamento é preguiçoso, na leitura. O motivo está
   em [Estado atual](#estado-atual--onde-paramos-2026-08-28).
2. **A semana é identificada pela segunda-feira** (`2026-08-24`), não pelo
   número ISO. É a mesma semana ISO, sem os casos de borda de W53 e de ano ISO
   diferente do ano civil.
3. **Congelamento não é gasto quando não há streak para proteger.** Queimar um
   token para "salvar" uma sequência de zero consumiria em silêncio o recurso
   de quem está voltando — justo quem mais vai precisar dele. Quem tem streak 0
   e falha a semana recebe `PERDIDA` sem perder token.

Onde mora o código:

| Arquivo | Papel |
|---|---|
| `backend/src/sessions/semanas.ts` | A máquina de estados, pura. Não conhece Prisma nem HTTP |
| `backend/src/sessions/semanas.service.ts` | Persistência e fechamento preguiçoso |
| `backend/src/sessions/tempo.ts` | `inicioDaSemana`, `semanasEntre` |
| `frontend/src/MetaSemana.tsx` | O card que virou o bloco principal da home |

Rotas novas: `PUT /sessions/meta` (troca a meta) e `GET /sessions/semanas`
(semanas fechadas). O `GET /sessions` passou a devolver `resumo.meta` e
`resumo.recordeDiario`.

### Pontos e níveis (v1.3)

Replicação do desenho do ensaio **STEP UP** (*JAMA Internal Medicine* 2019,
n=602, 24 semanas), traduzido de "passos/dia" para "treinos/semana". É a
especificação com melhor respaldo causal do plano: estes parâmetros exatos
produziram +920 passos/dia no braço de competição, com +569 mantidos 12 semanas
após o fim da intervenção.

- **Reset toda segunda**: saldo volta para **70 pontos**; não acumula entre
  semanas — o reset é parte do efeito.
- **Perda de 10 pontos**: no fim de cada dia, se
  `dias_restantes < meta − treinos_até_agora`. Quem treina no começo da semana
  nunca perde ponto; quem procrastina começa a sangrar na quinta.
- **Cinco níveis**: azul, bronze, **prata**, ouro, platina. Todo usuário novo
  entra em **prata**, deliberadamente: dá algo a perder desde o dia 1.
- **Fim de semana**: 40 pontos ou mais sobe um nível; abaixo de 40 desce um.
- Nível é **privado** por default — só o usuário e o supervisor veem.

### Placar de grupo, com salvaguardas obrigatórias (v1.3)

- **Top 5 nomeado + a sua própria linha.** Nunca renderizar a lista completa
  ordenada de baixo para cima, nunca destacar o último.
- Quem está abaixo da mediana vê distância, não posição ("falta 1 treino para
  o 5º lugar", não "você é o 27º de 30").
- **Placar de melhoria em paralelo** (quem mais subiu vs. a própria média das 4
  semanas anteriores) — dá vitória possível a iniciantes.
- **Opt-out sem penalidade**; continua ganhando streak, pontos e marcos, e o
  supervisor não é notificado do opt-out.
- Teto anti-inflação: 1 treino por dia conta, logo o máximo semanal é 7.

Motivo: em ambientes só-leaderboard, 31,3% relataram efeito psicológico
negativo da comparação de posição. O próprio Strava criou o *Local Legend*
(premia frequência, não velocidade) porque um ranking único desmotiva a
maioria.

---

## Pedidos novos (2026-08-26)

Anotados a pedido do dono do produto, **sem implementar agora**. Cada um já tem
um lugar natural no roadmap; onde há conflito com algo já decidido, o conflito
está explícito.

### 1. Modo claro e escuro na tela de marcar treino — FEITO (2026-08-27)

Entregue antecipado da v1.1, junto com o polimento mobile. Detalhes de
implementação e o que checar no aparelho estão em
[TESTE-MOBILE](TESTE-MOBILE.md); o resumo:

- Três estados no botão ao lado do nome GYM MONKEY: **automático → claro →
  escuro**. Automático segue `prefers-color-scheme` e continua seguindo em tempo
  real, porque em automático o `<html>` fica **sem** `data-tema` e quem decide é
  o CSS.
- A paleta virou **23 tokens CSS** num só lugar — meio caminho do design system
  da v1.1 já andado.
- A tela de login é **escura sempre** (vai receber fundo com o logo), via um
  atributo separado que não sobrescreve a escolha do usuário.
- `color-scheme` acompanha, então o seletor de data/hora da correção também
  escurece.

Fica **em aberto** um ponto do manifest: o `theme_color` é fixo (`#ff4d3d`) e
manifest não aceita media query, então no app instalado a barra de status pode
continuar vermelha no tema escuro, dependendo da versão do Chrome. A saída, se
incomodar, é fixar `#191919` — barra escura sempre, coerente com a splash.

### 2. Segunda tela: a pessoa monta o treino dela

Referências visuais trazidas pelo dono do produto (3 telas de apps de treino):

| Referência | O que ela mostra | O que aproveitar |
|---|---|---|
| Tela escura, acento verde-neon | Título "Chest, January 20"; barra de progresso "1/4 weekly workouts done"; cards de exercício com miniatura, nome e etiqueta (COMPOUND / ISOLATION); CTA grande "START WORKOUT"; **barra de abas embaixo** com 4 ícones | O layout mais próximo do que queremos: abas (v1.1), progresso semanal (v1.0) e lista de exercícios (v2.0 Fase B) |
| Amarelo e preto, com mascote | Tela de abertura: mascote grande, chamada e botão Start | Nosso macaco tem a mesma energia; serve pra onboarding e pra splash |
| Clara/lilás, "Select a challenge" | Busca, abas *My Workouts / All Workouts / Challenges*, cards de desafio com selo de dificuldade e "Daily challenge" | Desafios e níveis de dificuldade (v1.3) |

Encaixe no roadmap: a tela em si é a **v2.0 Fase B** (catálogo de exercícios,
séries, cargas), e a navegação por abas que ela pressupõe é a **v1.1**. A
decisão já tomada de fazer o registro **em duas fases** continua valendo: a
Fase A (tipo de treino + nota + esforço 1–5 no check-out) vem primeiro e só
passamos pra Fase B se houver adesão real.

Duas ressalvas que não são estilo:

- **CREF**: o usuário montar o **próprio** treino é livre — é exatamente o
  pedido, então está ok. O que não pode é o supervisor **prescrever** ficha pra
  outra pessoa (ver Restrições permanentes).
- **"Daily challenge" briga com o modelo escolhido.** Desafio diário empurra
  streak diária, e a v1.0 move o contador principal justamente pra semana, com
  dia de folga e congelamento. Se entrar, tem que ser como desafio **semanal**
  ou como algo cosmético que não alimente streak/pontos — senão volta a punir
  descanso, que é o que estamos evitando.

### 3. Vários check-ins no mesmo dia inflam o contador semanal

Relato do dono do produto: dá pra abrir e fechar treinos de 1 segundo e ganhar
streak várias vezes no mesmo dia.

**Medido nas funções reais** (5 sessões de 1 segundo no mesmo dia):

| Métrica | Resultado | Leitura |
|---|---|---|
| `calcularStreak` | **1** | A streak **não** multiplica no mesmo dia: ela conta *dias distintos* com registro (`Set` de chaves de dia) |
| `calcularResumoSemanal().treinos` | **5** | O contador semanal **infla 1:1** com as sessões, sem limite por dia |
| `calcularResumoSemanal().minutos` | **0** | Fica o par absurdo "5 treinos essa semana / 0min" |

Então o furo relatado existe, mas mira o **contador semanal**, não a streak. O
que a streak tem de frágil é outra coisa: **1 segundo de treino vale um dia
inteiro** de streak (não há duração mínima), então ela é forjável com um toque
por dia — e não perdoa nenhum dia de folga.

Isso é mais grave do que parece porque a v1.0 promove justamente o número
semanal a **contador principal da home**. O furo está exatamente na métrica que
está prestes a virar a mais visível do app.

Agrava tudo o fato de esses números serem calculados no **cliente**
(`calculos.ts`), sobre o histórico cru, que o próprio usuário pode editar e
apagar.

**Este item já está especificado na v0.9** e é justamente o motivo de ela vir
antes de UI e gamificação. As regras da tabela "Regras de integridade da sessão"
resolvem o caso relatado, combinadas:

| Regra | Valor | Como mata o caso |
|---|---|---|
| `DURACAO_MIN` | 20 min | Sessão de 1 segundo entra como "sessão curta" e **não** conta pra meta, streak nem placar |
| Cooldown | 30 min | Novo check-in só é aceito 30 min depois do último check-out, o que corta a repetição em rajada |
| Treinos contáveis por dia | 1 | Várias sessões válidas no mesmo dia contam **uma** (a mais longa) — é esta que fecha o furo do contador semanal |

Faltam ainda, no mesmo pacote: **timestamps gerados só no servidor**, **streak
calculada no servidor** e **auditoria imutável** (editar cria correção
vinculada, não muta o registro) — sem isso as regras acima seriam contornáveis
pelo cliente.

Nada a decidir aqui, então: é executar a v0.9. O relato só confirma a ordem já
escolhida.

## Auditoria de segurança (2026-08-27)

Levantamento pedido pelo dono do produto antes de um deploy. Cada item foi
**verificado no código e depois atacado** no backend local, não só lido.

### Já resolvido

| Tema | Prova |
|---|---|
| Hash de senha | bcrypt, 10 rounds |
| Rate limit | 30/min global; **5/min** em login e cadastro (8 erros seguidos → `401, 429, 429…`) |
| Queries parametrizadas | Prisma em tudo; a única query crua é `` $queryRaw`SELECT 1` ``, literal. Zero `$queryRawUnsafe` |
| Mass assignment | `whitelist + forbidNonWhitelisted` global. Forçar `status`, `durationMin`, `contavel`, `userId` e `source` na correção → **400 nas 5** |
| Promoção a admin | guard de supervisor na rota; usuário comum → **403** |
| Vazamento entre usuários | `select` explícito (sem `passwordHash`); corrigir treino alheio → **403**; conta nova vê 0 sessões |
| Secrets no Git | varredura de **todos** os commits: `backend/.env` nunca existiu na árvore |

Duas decisões que sustentam o resto: **o papel não vai no token** (o JWT carrega
só `exp/iat/sub`; o papel é lido do banco a cada requisição, então desativar
alguém corta o acesso na requisição seguinte, e token roubado não carrega papel
falso — testado com `sub` trocado, assinatura falsa e `alg=none`: 401 nos três);
e **o login não revela quais e-mails existem**, porque a senha é checada antes
de verificar a aprovação.

### Não se aplica a esta arquitetura

- **Public key do banco / RLS**: vêm do modelo Supabase, onde o navegador fala
  direto com o banco. Aqui só o backend tem `DATABASE_URL`. A "RLS" é a camada
  de serviço, e o isolamento foi provado. RLS só ajudaria contra um backend já
  comprometido — que teria a credencial de todo jeito.
- **Esconder a API**: impossível num SPA (a URL vai no bundle). O que importa é
  tudo exigir token, e só `/health` e `/auth/*` são abertos.
- **Cookie httpOnly**: não usamos cookies. E aqui seria **pior**: front em
  `github.io` e API em `render.com` são origens diferentes, o cookie seria de
  terceiros (`SameSite=None`) — justo o que os navegadores estão desligando. A
  mitigação real é não ter XSS (zero `dangerouslySetInnerHTML`/`eval`) e
  expiração curta (12h, já em vigor).
- **Criptografia por campo**: o Neon já faz TLS e criptografia em repouso, e o
  roadmap proíbe guardar dado sensível. Nome e e-mail não justificam.

### Achados

1. **Rotas de escrita de `/time-entries` ainda no ar.** O cutover tirou da tela,
   não da API. Com um token comum: `POST /time-entries/toggle` → 201;
   `PATCH /time-entries/<id>` aceitou timestamp de 2020 vindo do cliente, sem
   motivo e sem auditoria; `DELETE /time-entries/<id>` → 204, sem rastro. **Não
   afeta os números** (sessões são outra tabela — streak e semana conferidos
   intactos), mas destrói a trilha de `TimeEntry` que o backfill preservou de
   propósito, e é a única porta que ainda aceita horário do cliente sem exigir
   motivo.

   **Corrigido**: `/time-entries` ficou **somente leitura**. `POST /toggle`,
   `PATCH /:id` e `DELETE /:id` foram removidos — 404 para qualquer um,
   inclusive supervisor (não é permissão, a rota não existe). O `GET` continua,
   porque a pessoa tem direito de ver os próprios dados e o histórico antigo é
   auditoria. Há uma trava de regressão no teste unitário: o `TimeEntriesService`
   só pode expor `findAllForUser` — reintroduzir escrita ali quebra a suíte.
2. **Enumeração de e-mail no cadastro**: o 409 revela quem tem conta. Fica para
   a **v1.2**, quando entra verificação por e-mail e o fluxo muda de todo jeito.
3. **Rate limit do login por IP podia trancar o grupo**: eram 5/min por IP e na
   academia todos saem pelo mesmo IP, então quem errasse a senha travava o login
   dos outros — rate limit virando negação de serviço contra o próprio grupo.

   **Corrigido**: o login passou a contar por **(IP + e-mail)**, num throttler
   `por-conta` que só vale nas rotas marcadas com `@LimitePorConta()`. O teto
   por IP continua existindo (o throttler `default`, 30/min nesta rota), então um
   único IP não pode rodar e-mails diferentes à vontade. O e-mail é normalizado
   como no `AuthService`, senão alternar maiúsculas daria cota nova a cada
   variação.

   Medido depois da mudança, duas contas do mesmo IP: Ana errando 7x →
   `401, 401, 401, 401, 401, 429, 429`; Bruno, no mesmo IP, → `401` (passou).
   Ana com o e-mail em caixa alta → `429` (sem cota nova).
4. ~~**Rotar a senha do Neon**~~ — **FEITO em 2026-08-28**, antes deste scan.
   Esta linha ficou dizendo "pendência do dono" por descuido: o item já estava
   resolvido e registrado mais acima. Documento que contradiz a si mesmo é pior
   que documento incompleto — quem lê não sabe em qual metade acreditar.

## Roadmap resumido (v1.0 → v2.x)

| Versão | Foco | Itens principais |
|---|---|---|
| **v1.0** | Hábito honesto | ~~Meta semanal, streak de semanas, congelamento, recorde pessoal + prêmio na quebra, 16 marcos curados, heatmap do ano, *fresh start* na segunda e no dia 1º~~ — **COMPLETA** (28/08 e 31/08) |
| **v1.1** | Front melhor | ~~Router e abas~~ (Treino/Histórico/Perfil — **sem Grupo**, que entra na v1.3), ~~dark mode~~, ~~design system: cor e tipografia~~ — **entregues em 02/09**; ~~cold start e falha de rede tratados~~ — **03/09**. **Offline-first DESCARTADO em 03/09** por decisão do dono do produto. Falta: onboarding de instalação PWA, comprovante compartilhável |
| **v1.2** | Supervisor | Painel "quem sumiu", **aprovação por e-mail**, fila de sessões suspeitas, padrinho/accountability, export CSV/PDF, melhor horário do grupo |
| **v1.3** | Social | Multi-grupo com convite por link, placar semanal com salvaguardas, pontos STEP UP, duelo 1x1 de 7 dias, kudos, retrospectiva mensal/anual |
| **v1.4** | Notificações | Recap semanal **por e-mail primeiro** (100% da base), Web Push Android-first com agendamento no servidor, teto duro de 3 por semana |
| **v2.0** | Registro de treino | ~~Fase A: tipo de treino + nota + esforço 1 a 5 no check-out~~ — **entregue em 2026-08-28**, antecipada por pedido dos usuários. Fase B: catálogo de exercícios, séries, cargas, PRs, gráficos — **só se a Fase A mostrar adesão** |
| **v2.x** | Condicional | Geofence / QR de validação de local — **só contra fraude observada**, não imaginada |

**Ponto de decisão na v1.3**: é onde a ambição (pessoal / portfólio / SaaS)
passa a decidir arquitetura. Até lá, não é preciso responder.

---

## Restrições permanentes do produto

Valem para todas as versões. Não são preferência de estilo.

1. **Nunca notificar terceiros sobre a inatividade de alguém.** O placar mostra
   quem **fez**, jamais quem faltou. Em grupo fechado onde todos se conhecem, o
   risco não é comparação abstrata — é vergonha.
2. **Não somos registrador de ponto eletrônico.** A Portaria MTP 671/2021 exige
   do REP-P registro de programa no INPI, arquivos AFD e AEJ assinados,
   comprovante ao trabalhador, espelho mensal e retenção por 5 anos.
   Consequências práticas: tirar "ponto", "jornada" e "hora extra" de todo
   texto visível; Termos de Uso vedando expressamente o uso para controle de
   jornada; e o export da v1.2 chamado **"Relatório de frequência de atividade
   física"**, com aviso no cabeçalho. Antes de vender para RH, validar com
   advogado trabalhista.
3. **Zero biometria e zero dado clínico** (LGPD art. 5º, II e art. 11) — sem
   foto, peso, medida, lesão ou bioimpedância. Se houver geofence, gravar
   apenas `validado: true/false` e o id do local, **descartando as
   coordenadas**. O supervisor vê frequência, nunca as anotações pessoais do
   usuário. Retenção declarada e exclusão de conta que realmente apaga.
4. **CREF (Lei 9.696/1998)**: o usuário registrar o próprio treino é livre; o
   supervisor **prescrever** ficha para outra pessoa é atividade privativa de
   profissional registrado. Foi por isso que "supervisor monta o treino" ficou
   fora deste roadmap.

## Armadilhas descartadas de propósito

IA que monta treino (nosso modelo de dados — dois timestamps — não contém
informação para prescrever nada); integração com wearables (HealthKit exige app
nativo e somos PWA); biblioteca de vídeos e aulas (o Nike Training Club é
inteiramente grátis); ranking global entre estranhos; gamificação paga (foi o
ponto mais atacado do Garmin Connect+); liga com rebaixamento (inviável em
grupo de 20 pessoas que se conhecem); financeiro e integração com catraca (core
dos ERPs, guerra perdida); avaliação física e bioimpedância (dado sensível).

## Pendências em aberto

- **Ambição do projeto** — pessoal, portfólio ou SaaS. Decidir até a v1.3.
- **Cold start do Render.** No plano free o backend dorme após 15 min e o
  primeiro acesso leva 30–60s. Isso briga diretamente com engajamento: o app
  que se quer abrir na porta da academia é o que mais sofre. Resolver antes da
  v1.4.
- **Provedor de e-mail transacional** — necessário na v1.2.
- **Renomear "registro de ponto"?** Está no README, no `TimeEntry` e na
  descrição do pacote. A troca é barata hoje e fica mais cara a cada versão.
