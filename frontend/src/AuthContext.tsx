import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { entrar, registrar } from "./api";
import { registrarAvisoDeExpiracao, tokenExpirado } from "./sessao";
import type { RegisterResponse, Usuario } from "./types";

const STORAGE_KEY = "gym-monkey.auth";

interface SessaoArmazenada {
  token: string;
  user: Usuario;
}

interface AuthContextValue {
  token: string | null;
  user: Usuario | null;
  login: (email: string, password: string) => Promise<void>;
  cadastrar: (
    name: string,
    email: string,
    password: string,
  ) => Promise<RegisterResponse>;
  logout: () => void;
  /** A sessao caiu sozinha (nao foi a pessoa que tocou em Sair). */
  sessaoExpirada: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function carregarSessao(): SessaoArmazenada | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const sessao = JSON.parse(raw) as SessaoArmazenada;

    // Cracha vencido nao vira estado logado. Sem esta checagem o app abriria
    // "logado", sairia pedindo dado e so descobriria a verdade pelo 401 -- e
    // com o servidor dormindo isso custa mais de um minuto de espera para
    // chegar numa tela de login que podia ter aparecido na hora.
    if (!sessao?.token || tokenExpirado(sessao.token)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return sessao;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<SessaoArmazenada | null>(carregarSessao);
  const [sessaoExpirada, setSessaoExpirada] = useState(false);

  const salvarSessao = useCallback((nova: SessaoArmazenada) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nova));
    setSessao(nova);
  }, []);

  // Quem responde ao 401 e este contexto, porque so ele sabe derrubar a sessao.
  // A camada de api nao conhece React e por isso avisa por callback.
  useEffect(() => {
    registrarAvisoDeExpiracao(() => {
      localStorage.removeItem(STORAGE_KEY);
      setSessao(null);
      setSessaoExpirada(true);
    });

    return () => registrarAvisoDeExpiracao(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const resposta = await entrar({ email, password });
      setSessaoExpirada(false);
      salvarSessao({ token: resposta.accessToken, user: resposta.user });
    },
    [salvarSessao],
  );

  const cadastrar = useCallback(
    // Cadastro NAO loga: a conta entra pendente de aprovacao. Devolve a
    // resposta pra tela mostrar a mensagem e voltar pro modo de login.
    (name: string, email: string, password: string) =>
      registrar({ name, email, password }),
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSessao(null);
    // Sair por vontade propria nao e sessao expirada: dizer "sua sessao
    // expirou" para quem acabou de tocar em Sair seria confuso.
    setSessaoExpirada(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token: sessao?.token ?? null,
      user: sessao?.user ?? null,
      login,
      cadastrar,
      logout,
      sessaoExpirada,
    }),
    [sessao, login, cadastrar, logout, sessaoExpirada],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
