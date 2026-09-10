/**
 * Sessao expirada: como o app descobre e quem avisa quem.
 *
 * Antes disto ninguem tratava 401. O token vencia (eram 12h) e o app **nao
 * voltava para o login**: mostrava "Unauthorized" em ingles, em vermelho, com
 * um botao "Tentar de novo" que falharia para sempre. A unica saida era achar
 * Perfil -> Sair sozinho.
 *
 * Sao duas defesas, e elas cobrem coisas diferentes:
 *
 * 1. `tokenExpirado` le o prazo no proprio token, na abertura do app. Evita
 *    sair pedindo dado com um cracha que ja se sabe vencido -- e, quando o
 *    servidor esta dormindo, evita esperar mais de um minuto pelo cold start
 *    so para ouvir "voce precisa entrar de novo".
 * 2. `avisarSessaoExpirada`, disparado pela camada de api quando o servidor
 *    responde 401. Esta e a que vale de fato, porque o servidor pode recusar
 *    por motivo que o token nao conta -- conta desativada, por exemplo.
 */

let aoExpirar: (() => void) | null = null;

/**
 * Registra quem deve ser avisado quando a sessao cair. Existe porque a camada
 * de api nao conhece React e nao pode chamar o `logout` do contexto direto.
 * Passar `null` cancela o registro.
 */
export function registrarAvisoDeExpiracao(callback: (() => void) | null): void {
  aoExpirar = callback;
}

export function avisarSessaoExpirada(): void {
  aoExpirar?.();
}

/**
 * O token ja passou da validade?
 *
 * **Na duvida, responde `false`.** Se o token nao puder ser lido -- formato
 * estranho, base64 quebrado, sem campo `exp` --, quem decide e o servidor, que
 * e a autoridade de verdade. Um erro de leitura aqui nunca pode expulsar quem
 * esta logado; no maximo deixa passar uma requisicao que vai voltar 401, e o
 * caminho do 401 ja esta coberto.
 *
 * `agora` e injetavel para o teste nao depender do relogio.
 */
export function tokenExpirado(token: string, agora: number = Date.now()): boolean {
  const payload = token.split(".")[1];
  if (!payload) return false;

  try {
    // JWT usa base64url: '-' e '_' no lugar de '+' e '/'.
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;

    if (typeof exp !== "number") return false;

    // `exp` vem em segundos, Date.now() em milissegundos.
    return agora >= exp * 1000;
  } catch {
    return false;
  }
}
