import { describe, expect, it, vi } from "vitest";
import {
  AVISO_DEMORA_MS,
  comRetentativa,
  ehRetentavel,
  ErroDeRede,
  STATUS_RETENTAVEIS,
} from "./rede";

/** Erro com status, como o `ApiError` que a camada de api levanta. */
function erroComStatus(status: number) {
  return Object.assign(new Error(`http ${status}`), { status });
}

/** Nao espera de verdade: o teste nao pode levar 27 segundos. */
const semEsperar = () => Promise.resolve();

describe("ehRetentavel", () => {
  it("falha de transporte vale nova tentativa", () => {
    expect(ehRetentavel(new ErroDeRede("sem rede"))).toBe(true);
  });

  it("502, 503 e 504 valem: e o proxy enquanto a app sobe", () => {
    for (const status of STATUS_RETENTAVEIS) {
      expect(ehRetentavel(erroComStatus(status))).toBe(true);
    }
  });

  // Insistir num 4xx nao muda o veredito, e gasta a cota do rate limit.
  it.each([400, 401, 403, 404, 409, 429])("%d NAO vale nova tentativa", (status) => {
    expect(ehRetentavel(erroComStatus(status))).toBe(false);
  });

  it("500 nao vale: e erro dentro da aplicacao, nao servidor subindo", () => {
    // Repetir um 500 costuma repetir o mesmo bug e esconder o problema real.
    expect(ehRetentavel(erroComStatus(500))).toBe(false);
  });

  it("erro comum, sem status, nao vale", () => {
    expect(ehRetentavel(new Error("qualquer coisa"))).toBe(false);
    expect(ehRetentavel(null)).toBe(false);
    expect(ehRetentavel(undefined)).toBe(false);
  });
});

describe("comRetentativa", () => {
  it("nao repete o que deu certo de primeira", async () => {
    const acao = vi.fn().mockResolvedValue("ok");

    await expect(comRetentativa(acao, { esperar: semEsperar })).resolves.toBe("ok");
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("insiste e devolve o resultado quando a rede volta", async () => {
    // O caso do Render acordando: erra algumas vezes e depois responde.
    const acao = vi
      .fn()
      .mockRejectedValueOnce(new ErroDeRede("sem rede"))
      .mockRejectedValueOnce(erroComStatus(503))
      .mockResolvedValue("acordou");

    await expect(comRetentativa(acao, { esperar: semEsperar })).resolves.toBe(
      "acordou",
    );
    expect(acao).toHaveBeenCalledTimes(3);
  });

  it("nao insiste em erro que o servidor pensou", async () => {
    const acao = vi.fn().mockRejectedValue(erroComStatus(401));

    await expect(comRetentativa(acao, { esperar: semEsperar })).rejects.toThrow(
      "http 401",
    );
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it("desiste depois das tentativas e deixa o erro real chegar na tela", async () => {
    // Sem isto a tela ficaria em "carregando" para sempre, o que e pior que
    // mostrar o erro: a pessoa nao sabe se deve esperar ou tentar de novo.
    const acao = vi.fn().mockRejectedValue(new ErroDeRede("sem rede"));

    await expect(
      comRetentativa(acao, { atrasos: [1, 1], esperar: semEsperar }),
    ).rejects.toThrow(ErroDeRede);
    expect(acao).toHaveBeenCalledTimes(3); // a primeira + duas tentativas
  });

  it("avisa que vai demorar, UMA vez, e so quando demora", async () => {
    const aoDemorar = vi.fn();
    const acao = vi
      .fn()
      .mockRejectedValueOnce(new ErroDeRede("x"))
      .mockRejectedValueOnce(new ErroDeRede("x"))
      .mockResolvedValue("ok");

    await comRetentativa(acao, { aoDemorar, esperar: semEsperar });

    // Duas falhas, um aviso: repetir o aviso a cada tentativa faria a tela
    // piscar a mesma mensagem.
    expect(aoDemorar).toHaveBeenCalledTimes(1);
  });

  it("nao avisa quando deu certo de primeira", async () => {
    const aoDemorar = vi.fn();

    await comRetentativa(() => Promise.resolve("ok"), {
      aoDemorar,
      esperar: semEsperar,
    });

    expect(aoDemorar).not.toHaveBeenCalled();
  });

  it("espera mais a cada tentativa, para nao martelar servidor subindo", async () => {
    const esperas: number[] = [];
    const acao = vi
      .fn()
      .mockRejectedValueOnce(new ErroDeRede("x"))
      .mockRejectedValueOnce(new ErroDeRede("x"))
      .mockResolvedValue("ok");

    await comRetentativa(acao, {
      atrasos: [10, 20, 40],
      esperar: (ms) => {
        esperas.push(ms);
        return Promise.resolve();
      },
    });

    expect(esperas).toEqual([10, 20]);
  });

  it("o tempo total das tentativas cobre o cold start MEDIDO do Render", async () => {
    // 73 segundos, medidos em 2026-09-10 com o servico dormindo havia 7 dias.
    // A primeira versao deste teste exigia 25s, numero tirado dos "30 a 60s"
    // que a documentacao do Render promete -- e passava verde enquanto a janela
    // real desistia antes de o servidor acordar. O piso agora e a medicao.
    const { ATRASOS_PADRAO } = await import("./rede");
    const total = ATRASOS_PADRAO.reduce((a, b) => a + b, 0);

    expect(total).toBeGreaterThanOrEqual(73000);
  });

  it("o aviso de demora chega antes de a pessoa achar que travou", () => {
    expect(AVISO_DEMORA_MS).toBeLessThanOrEqual(5000);
  });
});

describe("aparelho sem conexao", () => {
  it("desiste na hora quando o aparelho sabe que esta offline", async () => {
    // Insistir 27s para depois dizer "sem internet" e fazer a pessoa esperar
    // meio minuto pela unica informacao que ela precisava logo.
    const acao = vi.fn().mockRejectedValue(new ErroDeRede("sem rede"));
    const aoDemorar = vi.fn();

    await expect(
      comRetentativa(acao, {
        estaOnline: () => false,
        aoDemorar,
        esperar: semEsperar,
      }),
    ).rejects.toThrow(ErroDeRede);

    expect(acao).toHaveBeenCalledTimes(1);
    expect(aoDemorar).not.toHaveBeenCalled();
  });

  it("online: insiste normalmente", async () => {
    const acao = vi
      .fn()
      .mockRejectedValueOnce(new ErroDeRede("x"))
      .mockResolvedValue("ok");

    await expect(
      comRetentativa(acao, { estaOnline: () => true, esperar: semEsperar }),
    ).resolves.toBe("ok");
    expect(acao).toHaveBeenCalledTimes(2);
  });
});
