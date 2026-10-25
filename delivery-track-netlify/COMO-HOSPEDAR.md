# Delivery Track na Netlify + Supabase

Este ZIP contém a **versão adaptada**, mas ainda não contém as credenciais de um banco real. É necessário criar um projeto Supabase e configurar variáveis secretas na Netlify. Não coloque senhas/chaves dentro do HTML ou deste ZIP.

## 1. Criar o banco

1. Entre em https://supabase.com e crie um projeto.
2. Abra o **SQL Editor** e execute todo o arquivo `SUPABASE-BANCO.sql`.
3. Em **Project Settings > API Keys**, copie a **Secret API Key** (`sb_secret_...`) ou, se necessário, a chave legada `service_role`. Nunca use essa chave no navegador.
4. Copie também a **Project URL**, no formato `https://xxxxx.supabase.co`.

## 2. Publicar a pasta inteira na Netlify

**Use a importação por GitHub/Git (recomendado)**, para que a Netlify publique tanto as páginas quanto a função de servidor. Envie a pasta `delivery-track-netlify` como raiz do repositório, e use:

- Build command: *(vazio)*
- Publish directory: `public`
- Functions directory: `netlify/functions`
- Base directory: raiz do projeto (vazio)

Não envie apenas `public`: isso deixaria o site sem API de pedidos e GPS.

## 3. Variáveis de ambiente na Netlify

Em **Site configuration > Environment variables** (escopo **Functions**, incluindo produção), crie:

| Nome | Valor |
|---|---|
| `SUPABASE_URL` | URL do seu projeto Supabase |
| `SUPABASE_SECRET_KEY` | Secret API Key do Supabase |
| `ADMIN_USER` | `dono` (ou nome que escolher) |
| `ADMIN_PASSWORD` | Senha forte e exclusiva |
| `ADMIN_NAME` | `EDU PODS` |
| `SESSION_SECRET` | Texto aleatório longo, com pelo menos 32 caracteres |

Para gerar `SESSION_SECRET` no PowerShell:

```powershell
$bytes = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Se usar a chave legada, configure `SUPABASE_SERVICE_ROLE_KEY` em vez de `SUPABASE_SECRET_KEY`. Nunca coloque duas credenciais diferentes sem saber qual está ativa.

Depois de salvar as variáveis, **faça um novo deploy**.

## 4. Testes indispensáveis

1. Abra `https://SEU-SITE.netlify.app/login` e entre como administrador.
2. No painel crie uma conta de entregador e um pedido de teste.
3. Copie o link do cliente e abra em outro celular.
4. Entre no celular do entregador, escolha o pedido e permita localização no navegador.
5. Veja a posição atualizar no link do cliente após alguns segundos.
6. Teste status entregue e confirme que pedido segue salvo depois de recarregar.

O rastreamento usa consultas a cada **4 segundos**, não WebSocket. O GPS no navegador exige HTTPS e permissão do usuário; em alguns celulares pode parar de atualizar quando o navegador entra em segundo plano ou a tela é bloqueada.

## Importante

- O sistema foi adaptado para Netlify Functions + Supabase. **Não há sincronização de pedidos antigos automaticamente** com `data/db.json` do projeto original. Guarde um backup se já houver pedidos reais.
- Uma única loja pequena é o cenário esperado. Muitas atualizações simultâneas da mesma entrega podem exigir uma rotina transacional no banco.
- Os custos e limites gratuitos de Netlify/Supabase podem mudar. Confira nos painéis antes de usar.
- Se o login funcionar mas as APIs derem erro 500, confira as variáveis e se executou o SQL.
- A localização é dado pessoal: só compartilhe o link com o cliente certo, e estabeleça prazo para apagar histórico de rotas/pedidos.
