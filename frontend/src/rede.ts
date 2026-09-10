/**
 * Nova tentativa e classificacao de falha de rede.
 *
 * Existe por causa de uma dor concreta e medida: o backend roda no plano free
 * do Render, dorme depois de ~15 min sem uso e leva **30 a 60 segundos** para
 * acordar. Isso acontece com sinal otimo, todo dia, e e o que faz o app parecer
 * quebrado na porta da academia. Sem nova tentativa, a primeira abertura do dia
 * simplesmente mostra erro.
 *
 * **O que pode e o que NAO pode ser retentado.** Repetir uma requisicao so e
 * seguro quando repetir nao muda nada -- ou seja, em leitura (GET). Em escrita
 * nao da: se a requisicao chegou ao servidor e foi a RESPOSTA que se perdeu,
 * repetir aplica a acao duas vezes. No `POST /sessions/toggle` isso seria pior
 * que o erro original -- a segunda chamada inverteria o estado, finalizando o
 * treino que a primeira acabou de abrir. Escrita, aqui, se **verifica** (ver
 * `toggleFoiAplicado` em calculos.ts), nao se repete.
 */

/** A requisicao nao chegou a ter resposta: sem rede, DNS, conexao cortada. */
export class ErroDeRede extends Error {}

/**
 * Respostas que valem nova tentativa.
 *
 * 502/503/504 sao exatamente o que um proxy devolve enquanto a aplicacao atras
 * dele ainda esta subindo -- o caso do Render acordando. 4xx fica fora de
 * proposito: e resposta pensada do servidor ("senha errada", "espere o
 * cooldown"), e insistir nao muda o veredito.
 */
export const STATUS_RETENTAVEIS = new Set([502, 503, 504]);

/**
 * Espera entre as tentativas. Cresce para nao martelar um servidor que sobe.
 *
 * A soma (90s) veio de **medicao, nao da documentacao**. A primeira versao
 * somava 27s, calibrada pelos "30 a 60 segundos" que o Render publica. Medido
 * em 2026-09-10, com o servico dormindo havia 7 dias, o primeiro byte levou
 * **73 segundos** -- ou seja, a janela desistia bem antes de o servidor
 * acordar, e o app mostrava erro justamente no caso que a nova tentativa existe
 * para resolver. Ja acordado, a mesma chamada leva 0,86s.
 *
 * 90s da margem sobre os 73 medidos sem esticar demais a espera de quem esta
 * com um problema de verdade. Se um dia a medicao subir de novo, o numero certo
 * e o medido -- nao o que a documentacao promete.
 */
export const ATRASOS_PADRAO = [1000, 2000, 4000, 8000, 15000, 20000, 20000, 20000];

/** Depois de quanto tempo vale avisar que o servidor esta acordando. */
export const AVISO_DEMORA_MS = 4000;

export function ehRetentavel(erro: unknown): boolean {
  if (erro instanceof ErroDeRede) return true;

  const status = (erro as { status?: unknown } | null)?.status;
  return typeof status === "number" && STATUS_RETENTAVEIS.has(status);
}

const dormir = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Executa `acao`, repetindo enquanto a falha for de transporte.
 *
 * `aoDemorar` e chamado uma vez, quando fica claro que a coisa vai demorar --
 * e a diferenca entre um botao "Carregando..." que parece travado e uma tela
 * que explica que o servidor esta acordando.
 *
 * Use **so em leitura**. Ver o comentario no topo do arquivo.
 */
export async function comRetentativa<T>(
  acao: () => Promise<T>,
  opcoes: {
    atrasos?: number[];
    aoDemorar?: () => void;
    /** Injetavel para o teste nao esperar de verdade. */
    esperar?: (ms: number) => Promise<void>;
    /** Injetavel para o teste simular aparelho sem conexao. */
    estaOnline?: () => boolean;
  } = {},
): Promise<T> {
  const atrasos = opcoes.atrasos ?? ATRASOS_PADRAO;
  const esperar = opcoes.esperar ?? dormir;
  const estaOnline = opcoes.estaOnline ?? (() => navigator.onLine !== false);
  let avisou = false;

  for (let tentativa = 0; ; tentativa++) {
    try {
      return await acao();
    } catch (erro) {
      // Falha que nao e de transporte e resposta do servidor: sobe na hora, sem
      // insistir. Idem quando as tentativas acabaram -- ai o erro real tem de
      // chegar a tela, e nao um "tentando..." infinito.
      if (!ehRetentavel(erro) || tentativa >= atrasos.length) throw erro;

      // O aparelho SABE que esta sem conexao: insistir 27 segundos so faria a
      // pessoa esperar meio minuto para ler "sem internet", que e a unica coisa
      // que ela precisava saber logo. Aqui desistir rapido e o servico melhor.
      //
      // `navigator.onLine` so e confiavel no negativo: `false` significa sem
      // interface de rede, e `true` nao promete internet (Wi-Fi de hotel, por
      // exemplo). Por isso ele serve para desistir, nunca para decidir tentar.
      if (!estaOnline()) throw erro;

      if (!avisou) {
        avisou = true;
        opcoes.aoDemorar?.();
      }

      await esperar(atrasos[tentativa]);
    }
  }
}
