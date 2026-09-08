# Painel de Análise de Retorno — AS-IS × TO-BE

Projeto reorganizado a partir do HTML original do Painel de Melhorias Gertec.

## Estrutura

```text
painel/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── firebase-config.js
│   └── firebase-service.js
├── firestore.rules
├── firebase.json
├── .gitignore
└── README.md
```

## O que foi corrigido

- removida a dependência `claude.use("db")`, que não funciona em uma página web comum;
- integração real com Firebase Authentication + Cloud Firestore;
- salvamento em nuvem e sincronização em tempo real;
- login com Google;
- implementação da função `initTheme()`, que era chamada no código mas não existia;
- correção da numeração do wizard (Indicador = etapa 4; Validação = etapa 5);
- manutenção da lógica AS-IS × TO-BE, ROI, payback, economia anual, horas economizadas;
- o percentual de retrabalho agora entra no esforço/custo como repetição proporcional do trabalho (ex.: 10% = 10% de esforço adicional);
- exclusão de processo também remove seus acompanhamentos, evitando dados órfãos;
- valores TO-BE iguais a zero passam a ser aceitos quando representarem automação total;
- manutenção de frentes, setores, status e indicadores customizáveis;
- parâmetros e indicadores também são persistidos no Firestore.

## 1. Criar o projeto no Firebase

1. Acesse o Firebase Console.
2. Crie um projeto.
3. Adicione um aplicativo Web (`</>`).
4. Copie o objeto `firebaseConfig`.
5. Abra `js/firebase-config.js` e substitua os valores de exemplo pelos valores do seu projeto.

## 2. Criar o Firestore

1. Firebase Console > Firestore Database.
2. Criar banco de dados.
3. Escolher a região.
4. Depois publique as regras presentes em `firestore.rules`.

> As regras incluídas exigem usuário autenticado. Antes de publicar o painel para muitas pessoas, restrinja os usuários autorizados (por e-mail, domínio ou custom claims).

## 3. Ativar login Google

1. Firebase Console > Authentication.
2. Sign-in method / Provedores.
3. Ative Google.
4. Salve.

## 4. Rodar localmente

Não abra o HTML com duplo clique (`file://`), porque módulos ES e autenticação funcionam melhor via servidor HTTP.

No terminal, dentro da pasta `painel`:

```bash
python -m http.server 5500
```

Abra:

```text
http://localhost:5500
```

Você também pode usar a extensão Live Server do VS Code.

## 5. Estrutura criada no Firestore

```text
processos/{processoId}
acompanhamentos/{acompanhamentoId}
meta/parametros
meta/seed                  (somente se SEED_DEMO_DATA=true)
```

### `processos`

Cada documento contém:

- frente
- setor
- nome
- responsável
- status
- `asis`
- `impl`
- `tobe`
- indicador antes/depois
- validação
- categoria de benefício
- observações

### `acompanhamentos`

Registros mensais de resultado real:

- processoId
- mês/ano
- horas reais
- evidência
- observação

### `meta/parametros`

Guarda:

- frentes customizadas
- setores customizados
- status customizados
- indicadores customizados
- indicador principal por frente
- dias úteis/mês
- jornada diária

## 6. Dados de demonstração

Em `js/firebase-config.js`:

```js
export const SEED_DEMO_DATA = false;
```

Use `true` apenas se quiser popular o Firestore com os exemplos do arquivo original. Depois volte para `false`.

## 7. Publicar no Firebase Hosting (opcional)

Instale a Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init
firebase deploy
```

Ao executar `firebase init`, selecione Firestore e Hosting, use esta pasta como `public` e não sobrescreva `index.html`.

## Observação de segurança

A configuração do Firebase no front-end não é uma senha. O controle real de acesso depende de Authentication + Firestore Security Rules. As regras deste projeto permitem leitura/escrita a qualquer usuário autenticado; para produção, limite quem pode entrar.
