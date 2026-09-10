import { ErroDeRede } from "./rede";
import { avisarSessaoExpirada } from "./sessao";
import type {
  AuthResponse,
  CatalogoDeConquistas,
  Correcao,
  MapaDoAno,
  MetaSemanal,
  PaginaSessoes,
  RegisterResponse,
  RegistroTreinoEntrada,
  Role,
  SemanaFechada,
  Sessao,
  UsuarioAdmin,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * Erro que o servidor RESPONDEU.
 *
 * Carrega o `status` porque quem decide se vale nova tentativa precisa
 * distinguir "o proxy ainda esta subindo a aplicacao" (502/503/504) de "o
 * servidor pensou e disse nao" (4xx). Sem o status, so restaria adivinhar pelo
 * texto da mensagem.
 */
class ApiError extends Error {
  // Campo declarado fora do construtor: o projeto usa `erasableSyntaxOnly`, que
  // proibe propriedade de parametro (`constructor(readonly status)`).
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (causa) {
    // `fetch` so rejeita quando nao houve resposta nenhuma: sem rede, DNS,
    // conexao cortada. Isso e categoria diferente de um erro que o servidor
    // respondeu, e a diferenca decide se vale insistir.
    throw new ErroDeRede(
      causa instanceof Error ? causa.message : "Falha de conexao",
    );
  }

  if (!response.ok) {
    // 401 numa rota que mandou cracha = o cracha foi recusado, e a sessao caiu.
    //
    // O `token &&` nao e detalhe: sem ele, o 401 de "e-mail ou senha
    // invalidos" -- que vem do proprio login, sem cracha nenhum -- dispararia
    // "sua sessao expirou" para quem nunca esteve logado.
    if (response.status === 401 && token) {
      avisarSessaoExpirada();
    }

    const body = await response.json().catch(() => null);
    const message = body?.message ?? "Erro inesperado ao falar com o servidor";
    throw new ApiError(
      Array.isArray(message) ? message.join(", ") : message,
      response.status,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// A politica de nova tentativa NAO vive aqui. Ela e decisao de experiencia de
// uso -- quantas vezes insistir, quanto esperar, quando avisar que o servidor
// esta acordando -- e depende de qual tela esta esperando. Esta camada so
// classifica a falha (ErroDeRede contra ApiError com status) e deixa quem chamou
// decidir. Ver rede.ts e o `carregar` do PontoScreen.

export function registrar(data: {
  name: string;
  email: string;
  password: string;
}) {
  return request<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function entrar(data: { email: string; password: string }) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// --- Sessoes de treino ---
// Substituem /time-entries: o servidor pareia, classifica e agrega. As rotas
// antigas continuam no ar como auditoria, mas a tela nao as usa mais.

export function buscarSessoes(
  token: string,
  opcoes: { cursor?: string; limite?: number } = {},
) {
  const params = new URLSearchParams();
  if (opcoes.cursor) params.set("cursor", opcoes.cursor);
  if (opcoes.limite) params.set("limite", String(opcoes.limite));
  const query = params.toString();

  return request<PaginaSessoes>(`/sessions${query ? `?${query}` : ""}`, { token });
}

/** Comeca ou finaliza o treino. Nao manda horario: quem marca e o servidor. */
export function alternarTreino(token: string) {
  return request<Sessao>("/sessions/toggle", {
    method: "POST",
    token,
  });
}

/**
 * Corrige os horarios de uma sessao. O motivo e obrigatorio porque toda
 * correcao fica registrada na auditoria com autor e antes/depois.
 */
export function corrigirSessao(
  token: string,
  id: string,
  dados: { startedAt?: string; endedAt?: string; reason: string },
) {
  return request<Sessao>(`/sessions/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(dados),
  });
}

/**
 * Registro do treino (Fase A). Rota separada da correcao de horario: rotulo e
 * nota nao entram em contagem nenhuma, entao editar e livre e nao consome a
 * unica correcao da sessao.
 */
export function anotarSessao(
  token: string,
  id: string,
  dados: RegistroTreinoEntrada,
) {
  return request<Sessao>(`/sessions/${id}/registro`, {
    method: "PATCH",
    token,
    body: JSON.stringify(dados),
  });
}

export function buscarCorrecoes(token: string, id: string) {
  return request<Correcao[]>(`/sessions/${id}/corrections`, { token });
}

// --- Meta semanal ---

/**
 * Troca a meta. A resposta traz a meta EM VIGOR (que nao muda agora) e a
 * agendada: a nova so vale a partir da semana seguinte, para ninguem baixar a
 * meta no domingo a noite depois de ver quantos treinos deu.
 */
export function alterarMeta(token: string, meta: number) {
  return request<Pick<MetaSemanal, "meta" | "metaAgendada">>("/sessions/meta", {
    method: "PUT",
    token,
    body: JSON.stringify({ meta }),
  });
}

/** Grade de dias treinados. Carregada uma vez, fora da paginacao do historico. */
export function buscarMapa(token: string) {
  return request<MapaDoAno>("/sessions/mapa", { token });
}

// --- Conquistas ---

export function buscarConquistas(token: string) {
  return request<CatalogoDeConquistas>("/sessions/conquistas", { token });
}

/** "Ja vi a festa". Sem isto a tela comemoraria o mesmo marco toda visita. */
export function marcarConquistasVistas(token: string) {
  return request<{ marcadas: number }>("/sessions/conquistas/vistas", {
    method: "POST",
    token,
  });
}

export function buscarSemanas(token: string) {
  return request<SemanaFechada[]>("/sessions/semanas", { token });
}

// --- Painel de supervisor ---

export function listarUsuarios(token: string) {
  return request<UsuarioAdmin[]>("/users", { token });
}

export function atualizarUsuario(
  token: string,
  id: string,
  data: { active?: boolean; role?: Role },
) {
  return request<UsuarioAdmin>(`/users/${id}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export { ApiError, ErroDeRede };
