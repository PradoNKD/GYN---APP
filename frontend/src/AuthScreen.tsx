import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { ApiError } from "./api";
import { useTemaEscuroFixo } from "./tema";

export function AuthScreen() {
  // A tela de entrada e escura sempre, independente do tema escolhido: e onde
  // vai entrar o fundo com o logo do app.
  useTemaEscuroFixo();

  const { login, cadastrar, sessaoExpirada } = useAuth();
  const [modo, setModo] = useState<"login" | "cadastro">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);

    try {
      if (modo === "login") {
        await login(email, password);
      } else {
        const resposta = await cadastrar(name, email, password);
        // Cadastro nao loga: mostra a mensagem de aprovacao pendente e volta
        // pro modo login, ja com o e-mail preenchido.
        setModo("login");
        setPassword("");
        setAviso(resposta.message);
      }
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Nao foi possivel conectar ao servidor");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="card">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" className="mascot" width={32} height={32} />
        <h1>GYM MONKEY</h1>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        {modo === "cadastro" && (
          <input
            type="text"
            placeholder="Nome"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        )}

        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={modo === "cadastro" ? 8 : undefined}
          pattern={modo === "cadastro" ? "(?=.*[A-Za-z])(?=.*\\d).+" : undefined}
          title={modo === "cadastro" ? "Minimo 8 caracteres, com letra e numero" : undefined}
          required
        />

        {modo === "cadastro" && <p className="auth-dica">Minimo 8 caracteres, com letra e numero</p>}

        {/* So aparece quando a sessao caiu sozinha, e some assim que a pessoa
            tenta entrar. Sem esta frase o app volta para o login do nada, e
            parecer que ele "esqueceu" quem voce e assusta mais do que dizer o
            que houve. Cede a vez para qualquer outro aviso ou erro da tela --
            esses sao sobre o que a pessoa acabou de fazer. */}
        {sessaoExpirada && !aviso && !erro && (
          <p className="auth-aviso">
            Sua sessao expirou por seguranca. Entre de novo para continuar.
          </p>
        )}

        {aviso && <p className="auth-aviso">{aviso}</p>}
        {erro && <p className="auth-erro">{erro}</p>}

        <button type="submit" className="btn btn--checkin" disabled={carregando}>
          {carregando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>

      <button
        type="button"
        className="link-btn"
        onClick={() => {
          setErro(null);
          setAviso(null);
          setModo((atual) => (atual === "login" ? "cadastro" : "login"));
        }}
      >
        {modo === "login" ? "Nao tem conta? Cadastre-se" : "Ja tem conta? Entrar"}
      </button>
    </main>
  );
}
