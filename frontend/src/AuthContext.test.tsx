import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "./AuthContext";
import { avisarSessaoExpirada } from "./sessao";

vi.mock("./api", async () => {
  const real = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...real,
    entrar: vi.fn(),
    registrar: vi.fn(),
  };
});

const { entrar, registrar, ApiError } = await import("./api");

const STORAGE_KEY = "gym-monkey.auth";

/** JWT de mentira: so o payload importa para o prazo. */
function tokenQueVence(emSegundosAPartirDeAgora: number): string {
  const exp = Math.floor(Date.now() / 1000) + emSegundosAPartirDeAgora;
  const meio = btoa(JSON.stringify({ sub: "user-1", exp }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `cabecalho.${meio}.assinatura`;
}

const usuario = {
  id: "user-1",
  name: "Fulano",
  email: "fulano@example.com",
  role: "USER" as const,
};

function Sonda() {
  const { token, user, login, cadastrar, logout, sessaoExpirada } = useAuth();
  const [erro, setErro] = useState<string | null>(null);

  // O AuthScreen real envolve login/cadastrar em try/catch; a sonda faz o
  // mesmo para que uma rejeicao esperada nao vire unhandled rejection.
  const capturando = (acao: () => Promise<unknown>) => async () => {
    try {
      await acao();
    } catch (error) {
      setErro((error as Error).message);
    }
  };

  return (
    <div>
      <span data-testid="token">{token ?? "sem-token"}</span>
      <span data-testid="user">{user?.name ?? "sem-user"}</span>
      <span data-testid="erro">{erro ?? "sem-erro"}</span>
      <span data-testid="expirada">{sessaoExpirada ? "sim" : "nao"}</span>
      <button onClick={capturando(() => login("fulano@example.com", "senha1234"))}>
        entrar
      </button>
      <button
        onClick={capturando(() => cadastrar("Fulano", "fulano@example.com", "senha1234"))}
      >
        cadastrar
      </button>
      <button onClick={logout}>sair</button>
    </div>
  );
}

function renderizar() {
  return render(
    <AuthProvider>
      <Sonda />
    </AuthProvider>,
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.mocked(entrar).mockReset();
    vi.mocked(registrar).mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("estado inicial", () => {
    it("comeca sem sessao quando o localStorage esta vazio", () => {
      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(screen.getByTestId("user")).toHaveTextContent("sem-user");
    });

    it("restaura a sessao salva no localStorage", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: "token-salvo", user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("token-salvo");
      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");
    });

    it("ignora json corrompido no localStorage em vez de quebrar a tela", () => {
      localStorage.setItem(STORAGE_KEY, "{isso-nao-e-json");

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
    });

    it("nao le a chave antiga gyn-monkey.auth", () => {
      localStorage.setItem(
        "gyn-monkey.auth",
        JSON.stringify({ token: "token-antigo", user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
    });
  });

  describe("login", () => {
    it("guarda token e usuario no estado e no localStorage", async () => {
      vi.mocked(entrar).mockResolvedValue({ accessToken: "token-novo", user: usuario });
      renderizar();

      await userEvent.click(screen.getByText("entrar"));

      await waitFor(() => {
        expect(screen.getByTestId("token")).toHaveTextContent("token-novo");
      });
      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
        token: "token-novo",
        user: usuario,
      });
    });

    it("repassa o erro da API e nao cria sessao", async () => {
      vi.mocked(entrar).mockRejectedValue(new ApiError("E-mail ou senha invalidos"));
      renderizar();

      await userEvent.click(screen.getByText("entrar"));

      await waitFor(() => {
        expect(screen.getByTestId("erro")).toHaveTextContent(
          "E-mail ou senha invalidos",
        );
      });
      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("cadastro", () => {
    it("NAO loga apos criar a conta (fica pendente de aprovacao)", async () => {
      vi.mocked(registrar).mockResolvedValue({
        status: "pending_approval",
        message: "Conta criada! Aguarde aprovacao.",
      });
      renderizar();

      await userEvent.click(screen.getByText("cadastrar"));

      // registrar foi chamado, mas nenhuma sessao foi criada.
      await waitFor(() => {
        expect(vi.mocked(registrar)).toHaveBeenCalled();
      });
      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("logout", () => {
    it("limpa o estado e remove a sessao do localStorage", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: "token-salvo", user: usuario }),
      );
      renderizar();
      expect(screen.getByTestId("token")).toHaveTextContent("token-salvo");

      await userEvent.click(screen.getByText("sair"));

      await waitFor(() => {
        expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      });
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe("useAuth fora do provider", () => {
    it("lanca erro explicativo", () => {
      // Silencia o error boundary do React no console durante este teste
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      expect(() => render(<Sonda />)).toThrow(
        "useAuth deve ser usado dentro de um AuthProvider",
      );

      spy.mockRestore();
    });
  });
  describe("sessao expirada", () => {
    it("token vencido no localStorage nao vira estado logado", () => {
      // Sem isto o app abriria "logado", sairia pedindo dado e so descobriria
      // a verdade pelo 401 -- com o servidor dormindo, mais de um minuto de
      // espera para chegar numa tela de login que podia aparecer na hora.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: tokenQueVence(-60), user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      // E limpa o que nao serve mais: deixar o cracha vencido guardado so
      // adiaria a mesma descoberta para a proxima abertura.
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("token ainda valido no localStorage e restaurado normalmente", () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: tokenQueVence(3600), user: usuario }),
      );

      renderizar();

      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");
    });

    it("401 do servidor derruba a sessao e diz por que", async () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: tokenQueVence(3600), user: usuario }),
      );
      renderizar();
      expect(screen.getByTestId("user")).toHaveTextContent("Fulano");

      // O que a camada de api dispara ao receber 401 numa rota com cracha.
      act(() => avisarSessaoExpirada());

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(screen.getByTestId("expirada")).toHaveTextContent("sim");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("sair por vontade propria NAO conta como sessao expirada", async () => {
      // Dizer "sua sessao expirou" para quem acabou de tocar em Sair inverte a
      // causa: sugere que o app derrubou a pessoa, quando foi ela que saiu.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: tokenQueVence(3600), user: usuario }),
      );
      renderizar();

      await userEvent.click(screen.getByText("sair"));

      expect(screen.getByTestId("token")).toHaveTextContent("sem-token");
      expect(screen.getByTestId("expirada")).toHaveTextContent("nao");
    });

    it("entrar de novo apaga o aviso de expirada", async () => {
      vi.mocked(entrar).mockResolvedValue({
        accessToken: "token-novo",
        user: usuario,
      });
      renderizar();
      act(() => avisarSessaoExpirada());
      expect(screen.getByTestId("expirada")).toHaveTextContent("sim");

      await userEvent.click(screen.getByText("entrar"));

      await waitFor(() =>
        expect(screen.getByTestId("expirada")).toHaveTextContent("nao"),
      );
    });
  });
});
