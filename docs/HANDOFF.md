# Handoff — estado do projeto e próximos passos

Documento pra retomar o trabalho de qualquer máquina. Vive no repositório de
propósito: `git clone` já te entrega tudo isto, sem depender de nenhuma outra
ferramenta.

Última atualização: 2026-09-02.

---

## Onde o projeto está

**No ar** 🎉 — https://pradonkd.github.io/GYM---MONKEY/ (frontend no GitHub
Pages, backend em https://gym-monkey-api.onrender.com, banco no Neon). Deploy
concluído e validado ponta a ponta em 2026-08-18.

App de check-in de academia: frontend (React+Vite) + backend (NestJS) +
Postgres, com autenticação por usuário, histórico agrupado por dia,
streak/resumo semanal, tema claro/escuro e PWA. Desde a **v0.9** a tela roda
sobre a entidade `WorkoutSession` (`/sessions`), com correção auditada e as
regras de integridade no servidor. Na **v1.0** o número principal da home passou
a ser a **meta semanal** (com streak de semanas e congelamento); a streak diária
virou recorde histórico.

**Qualidade:** 623 testes automatizados (339 no backend, 284 no frontend),
rodando em CI (GitHub Actions) a cada push/PR. Badge no [README](../README.md).

**Validar antes de subir:** [AMBIENTE-DE-TESTE](AMBIENTE-DE-TESTE.md) levanta o
app local com contas já preparadas (`npm run semear-teste`) nos cenários que não
se produzem clicando — streak de semanas, congelamento gasto, reparo, recomeço.

**Qual build está no ar:** <https://gym-monkey-api.onrender.com/health> devolve
`{"status":"ok","database":"up","version":"<sha curto>"}`. O `version` é o
commit; `database` é um `SELECT 1` de verdade, então 503 com `"down"` significa
API de pé sem conseguir falar com o Neon.

### O que está em aberto agora

A **v1.1 — navegação por abas** está **entregue e em produção** desde
2026-09-02: três abas no rodapé (**Treino / Histórico / Perfil**), router
próprio por hash — porque o GitHub Pages não tem fallback de SPA e um F5 numa
rota de caminho daria 404 —, um `?` que explica os conceitos no toque (em
celular não existe hover, então `title` nunca apareceria) e a tipografia
padronizada em tokens, com guarda contra valor cru. **Sem aba Grupo**: hoje só
uma pessoa usa o app, então ela abriria vazia; entra na v1.3.

2026-09-10: **cold start resolvido, e sessão de 30 dias.** A medição desmentiu
o que eu havia registrado em 03/09: o cold start real é de **73 segundos**, não
os "30 a 60" da documentação, e a janela de 27s desistia antes do servidor
acordar. Agora a janela é de 90s e um workflow (`manter-acordado.yml`) pinga
`/health` de 5 em 5 min das 5h às 24h para o serviço nunca dormir — não é 24h
porque o plano free dá 750 horas/mês e acordado o mês todo consome ~744.
No mesmo dia, o token passou de 12h para 30 dias e o app finalmente **trata
401**: antes ele mostrava "Unauthorized" em inglês em vez de voltar ao login.

2026-09-03: **cold start deixou de parecer erro.** O backend dorme no plano free
do Render e leva 30 a 60s para acordar, o que fazia a primeira abertura do dia
mostrar erro com sinal ótimo. A leitura agora insiste com espera crescente (27s)
e explica a espera; a escrita **não se repete, se verifica** — repetir o toggle
inverteria o treino quando foi a *resposta* que se perdeu. Seis commits, e
**quatro saíram do teste no iPhone real**: contradição entre dois avisos na
mesma tela, botões encavalados por margem herdada e rótulo afirmando estado que
o app não leu passaram todos por uma suíte verde.

**Offline-first foi DESCARTADO em 2026-09-03** por decisão do dono do produto
("não é o momento; talvez se o projeto expandir"). **Não reofertar** sem que ele
traga o assunto. O levantamento do que exigiria — aceitar horário do cliente com
revalidação, idempotência, reconciliar duas verdades na tela e IndexedDB — ficou
registrado no PROXIMOS-PASSOS, junto com o gatilho para reabrir: alguém perder
um treino por falta de sinal.

Da v1.1 faltam **comprovante compartilhável** e o **onboarding de instalação**.

A **v0.9 — Fundação está entregue e em produção** (2026-08-27), junto com o
tema claro/escuro, o polimento mobile, a auditoria de segurança e a trava de
correção de datas.

A **v1.0** (meta semanal, streak de semanas, congelamento, reparo e modo
recomeço) está **entregue e em produção** desde 2026-08-28, junto com o
`/health` que informa a versão do build. O fechamento semanal é **preguiçoso,
sem job agendado** — o porquê está no PROXIMOS-PASSOS.

A **Fase A do registro de treino** (v2.0) foi antecipada em 2026-08-28 por
pedido dos usuários: no check-out dá pra marcar o que treinou, o esforço de 1 a
5 e uma anotação curta — tudo opcional, e nada disso entra em contagem. A Fase B
(catálogo de exercícios, séries, cargas) só se esta mostrar adesão real.

A **v1.0 está completa e em produção** desde 2026-08-31 (build `9957d2e`): além
da meta semanal, entraram o mapa do ano, 16 marcos, 3 recordes e o *fresh start*
do 1º do mês. O próximo passo é
a **v1.1** (onboarding de PWA, comprovante compartilhável) ou a Fase B do
registro — esta última só se a Fase A mostrar adesão.

Estado detalhado, pendências manuais e o escopo das próximas versões vivem em
[PROXIMOS-PASSOS.md](PROXIMOS-PASSOS.md), na seção **Estado atual — onde
paramos**.

### A stack, e o trade-off aceito

**GitHub Pages** (frontend) + **Render** (backend) + **Neon** (Postgres), toda
gratuita. Railway foi descartado por ser pago.

O trade-off segue valendo: no plano free o backend "dorme" após ~15 min ocioso,
e o primeiro acesso depois disso demora ~30–60s (cold start). Foi aceito para a
fase de validação, mas **briga diretamente com engajamento** — o app que se
quer abrir na porta da academia é justamente o que mais sofre. Está registrado
como pendência em [PROXIMOS-PASSOS.md](PROXIMOS-PASSOS.md), para resolver antes
da v1.4.

### Como o deploy foi construído

Histórico, para quando for preciso entender uma decisão:

- **Endurecimento de segurança** (`34de999`): fail-fast de `JWT_SECRET` no boot
  (sem segredo forte o app não sobe), `/health`, `trust proxy` pro rate
  limiting atrás de proxy, `prisma migrate deploy` no release, `engines`
  fixando o Node.
- **Migração pra Postgres** (`9545c37`): Prisma trocado de SQLite pra
  `postgresql`, migration nativa gerada, testes rodando contra Postgres (local
  e um container `postgres:17` no CI).
- **Preparo de publicação** (`d9fac0b`): `base` via `VITE_BASE` no
  `vite.config.ts` (subcaminho do Pages), com o manifest do PWA derivado dele;
  `deploy-pages.yml` publicando o frontend; `render.yaml` como blueprint do
  backend.

---

## Rodar localmente numa máquina nova

Pré-requisitos: **Node 22–24** e **PostgreSQL 17** instalados.

```bash
# 1. Banco: criar os dois bancos locais (uma vez)
#    (usuario/senha padrão do Postgres local: postgres/postgres)
psql -U postgres -c "CREATE DATABASE gym_monkey_dev;"
psql -U postgres -c "CREATE DATABASE gym_monkey_test;"

# 2. Backend
cd backend
npm install
cp .env.example .env          # depois edite o .env (ver abaixo)
npx prisma migrate deploy      # cria as tabelas no gym_monkey_dev
npm run start:dev              # http://localhost:3000

# 3. Frontend (outro terminal)
cd frontend
npm install
npm run dev                    # http://localhost:5173
```

**Editar o `backend/.env`** (não é versionado — tem segredo):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gym_monkey_dev?schema=public"
JWT_SECRET="<gere um de 32+ chars>"
PORT=3000
FRONTEND_URL="http://localhost:5173"
```

Gerar um `JWT_SECRET` forte:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Testes

```bash
# Backend (precisa do Postgres de teste rodando)
cd backend
npm test           # 41 unitários
npm run test:e2e   # 47 e2e (usa o banco gym_monkey_test)

# Frontend
cd frontend
npm test           # 128 testes (Vitest)
```

O banco de teste vem de `TEST_DATABASE_URL` (default local em
`test/test-db-url.js`); no CI é um Postgres de serviço.

---

## Configuração de produção (referência)

Está tudo montado e no ar desde 2026-08-18 — **não há nada a fazer aqui**. Esta
seção existe para o caso de precisar recriar a infra, trocar de provedor ou
entender por que alguma coisa está de um jeito específico. As armadilhas abaixo
custaram tempo na primeira vez.

### Neon (Postgres)

Projeto na região mais perto do Brasil. A `DATABASE_URL` usada no Render aponta
para o **host direto, não o pooler**.

### Render (backend)

Criado como **Blueprint** a partir do `render.yaml` na raiz, que já define
build, start (com `migrate deploy`), health check e variáveis — não se
configura campo a campo. Três segredos ficam como `sync:false` e são
preenchidos no painel:

- `DATABASE_URL` — a connection string do Neon (host direto).
- `JWT_SECRET` — segredo próprio de produção, diferente do de desenvolvimento.
- `FRONTEND_URL` — o **origin** do Pages, `https://pradonkd.github.io`, **sem o
  caminho do repositório**. O CORS casa por origin, então `.../GYM---MONKEY`
  quebra.

URL pública: `https://gym-monkey-api.onrender.com`.

### GitHub Pages (frontend)

- Settings > Secrets and variables > Actions > **Variables**: `VITE_API_URL`
  com a URL do Render. Sem ela o workflow falha de propósito, para não publicar
  um front apontando pra localhost.
- Settings > **Pages**: Source = **GitHub Actions**.
- O `deploy-pages` dispara em push que toque `frontend/**`, ou manualmente em
  Actions > Run workflow.

### Se mexer no CORS ou na URL da API

Trocar `FRONTEND_URL` no Render exige redeploy. Smoke test na URL pública
depois: registrar → login → check-in → check-out.

---

## Notas e pendências

- **Vulnerabilidade sem correção**: `deepmerge-ts` (via Prisma CLI, devDep) —
  detalhes no [README](../README.md#vulnerabilidades-conhecidas-em-dependências).
  Aguardando o Prisma atualizar.
- **Avisos de CI não-bloqueantes**: deprecação do `actions/checkout@v4` e
  `setup-node@v4` (Node 20→24) — dá pra subir pra `@v5` quando quiser; e um
  warning cosmético de fast-refresh no `AuthContext.tsx`.
- **Branch**: trabalho todo na `main`; sem branches abertas.
