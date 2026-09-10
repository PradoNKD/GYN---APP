import { afterEach, describe, expect, it, vi } from "vitest";
import {
  avisarSessaoExpirada,
  registrarAvisoDeExpiracao,
  tokenExpirado,
} from "./sessao";

/** Monta um JWT de mentira: so o meio (payload) importa para o `exp`. */
function tokenCom(payload: Record<string, unknown>): string {
  const meio = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `cabecalho.${meio}.assinatura`;
}

const AGORA = new Date("2026-09-10T12:00:00Z").getTime();
const emSegundos = (ms: number) => Math.floor(ms / 1000);

afterEach(() => registrarAvisoDeExpiracao(null));

describe("tokenExpirado", () => {
  it("token com prazo no futuro nao esta expirado", () => {
    const daqui1h = tokenCom({ exp: emSegundos(AGORA) + 3600 });

    expect(tokenExpirado(daqui1h, AGORA)).toBe(false);
  });

  it("token com prazo no passado esta expirado", () => {
    const ha1h = tokenCom({ exp: emSegundos(AGORA) - 3600 });

    expect(tokenExpirado(ha1h, AGORA)).toBe(true);
  });

  it("le `exp` em segundos, nao em milissegundos", () => {
    // O erro classico: comparar `exp` direto com Date.now(). Um exp valido
    // (~1.7 bilhao) pareceria estar la nos anos 1970 em milissegundos, e TODO
    // token seria dado como expirado -- expulsando todo mundo.
    const daqui10s = tokenCom({ exp: emSegundos(AGORA) + 10 });

    expect(tokenExpirado(daqui10s, AGORA)).toBe(false);
  });

  // Na duvida o servidor decide: ele e a autoridade, e um erro de leitura aqui
  // nao pode expulsar quem esta logado. No pior caso passa uma requisicao que
  // volta 401, e esse caminho ja esta tratado.
  it.each([
    ["formato que nao e JWT", "isso-nao-e-um-token"],
    ["base64 quebrado", "cabecalho.$$$nao-e-base64$$$.assinatura"],
    ["payload sem campo exp", tokenCom({ sub: "u1" })],
    ["exp que nao e numero", tokenCom({ exp: "amanha" })],
    ["string vazia", ""],
  ])("%s: NAO expulsa, deixa o servidor decidir", (_caso, token) => {
    expect(tokenExpirado(token, AGORA)).toBe(false);
  });

  it("o instante exato do vencimento ja conta como expirado", () => {
    const agoraMesmo = tokenCom({ exp: emSegundos(AGORA) });

    expect(tokenExpirado(agoraMesmo, AGORA)).toBe(true);
  });
});

describe("aviso de sessao expirada", () => {
  it("chama quem se registrou", () => {
    const avisado = vi.fn();
    registrarAvisoDeExpiracao(avisado);

    avisarSessaoExpirada();

    expect(avisado).toHaveBeenCalledTimes(1);
  });

  it("sem ninguem registrado, nao quebra", () => {
    // Acontece de verdade: um 401 pode chegar entre a montagem e a desmontagem
    // do provider. Explodir aqui derrubaria o app inteiro por causa do aviso.
    expect(() => avisarSessaoExpirada()).not.toThrow();
  });

  it("cancelar o registro para de avisar", () => {
    const avisado = vi.fn();
    registrarAvisoDeExpiracao(avisado);
    registrarAvisoDeExpiracao(null);

    avisarSessaoExpirada();

    expect(avisado).not.toHaveBeenCalled();
  });
});
