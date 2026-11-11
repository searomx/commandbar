# Comanda

Controle de comandas individuais para bares, em português do Brasil, com
Next.js 16, React, Tailwind, Zustand, Zod, Prisma 7 e PostgreSQL.
Formulários usam o componente oficial `next/form`.

## Preparação

Use Node.js 22.12+ ou 24 e um PostgreSQL compatível com Prisma 7.
O servidor PostgreSQL existente não é atualizado por este projeto.

1. Configure um `.env` local, não versionado:

   ```dotenv
   DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO?schema=public"
   SHADOW_DATABASE_URL="postgresql://USUARIO:SENHA@HOST:5432/BANCO_SHADOW?schema=public"
   PIX_KEY="CHAVE_PIX_DO_ESTABELECIMENTO"
   PIX_NAME="NOME DO RECEBEDOR"
   PIX_CITY="CIDADE"
   ```

   Codifique caracteres especiais das credenciais como URL. Preserve opções
   TLS exigidas pelo provedor. CLI e adaptador usam o schema indicado na URL.
   Pix sem configuração válida informa o problema e permite dinheiro/cartão.

2. Instale e aplique as migrações existentes:

   ```bash
   npm install
   npm run db:deploy
   npm run db:generate
   ```

3. Crie o primeiro ADMIN usando variáveis de ambiente temporárias:

   ```bash
   export ADMIN_NAME="Responsavel"
   export ADMIN_EMAIL="responsavel@example.com"
   read -rs -p "Senha inicial (mínimo 12 caracteres): " ADMIN_PASSWORD
   echo
   export ADMIN_PASSWORD
   npm run db:seed
   unset ADMIN_PASSWORD ADMIN_EMAIL ADMIN_NAME
   ```

   O comando não substitui usuários existentes. Senhas são protegidas com
   scrypt e salt aleatório. Usuários antigos com senha em texto puro não podem
   entrar: um administrador deve migrar essas senhas para o mesmo formato,
   sem converter texto puro em um mecanismo alternativo de login.
   Não existe cadastro público nem credencial padrão.

4. Cadastre previamente o catálogo, por exemplo com Prisma Studio:

   ```bash
   npx prisma studio --config prisma7.config.ts
   ```

   Preencha `Product`: nome, descrição, unidade, preço, marca e quantidade em
   estoque. O aplicativo não insere produtos fictícios e não movimenta estoque
   automaticamente. Outros funcionários também são provisionados pelo
   responsável, com senha no formato produzido por `hashPassword` em
   `lib/password.ts`; não grave senhas em texto puro.

5. Inicie:

   ```bash
   npm run dev
   ```

   Acesse `http://localhost:3000`. Para produção, use `npm run build` e
   `npm start`, com HTTPS para o cookie de sessão seguro.

## Operação

- Faça login com uma conta de funcionário e abra o turno global.
- Use **Adicionar Comanda** para selecionar ou cadastrar um cliente.
  Só pode existir uma comanda não paga por cliente.
- Clique no card para lançar produtos e alterar quantidades. O preço fica
  registrado no item; mudanças futuras de catálogo não alteram itens antigos.
  Subtotais são arredondados para centavos e somados com precisão decimal.
- Segure o card por **três segundos** ou use **Fechar para cobrança** no painel.
  Em dispositivos móveis, o painel ocupa a tela; todo o fluxo funciona por
  teclado, sem depender do gesto.
- Confira o resumo e escolha Pix, dinheiro ou cartão. O Pix é estático com
  valor e referência da comanda. **A confirmação é manual**: verifique o
  recebimento no banco ou terminal antes de marcar a caixa de confirmação.
- **Cancelar Pix** oculta o QR e permite outro meio; um código estático já
  compartilhado não é revogado. Isso não registra pagamento.
- Só **Confirmar pagamento** grava `PAID`, a data do servidor e o meio de
  pagamento. O card fica verde e bloqueado, até o encerramento do turno.
- **Encerrar aplicativo** encerra o turno de todos os dispositivos após
  reautenticação de ADMIN/MANAGER. Não fecha a aba do navegador.
  No próximo turno, apenas pendências antigas voltam em vermelho-claro,
  clicáveis. Contas pagas continuam no banco como histórico.
- Atualizar a página ou sair da conta não encerra o turno.
  Use **Atualizar comandas** para obter alterações de outros dispositivos.

Temas claro/escuro seguem inicialmente o sistema e permitem escolha local.
Labels, mensagens de erro, foco visível, diálogos com contenção de foco e
preferência por movimento reduzido fazem parte da interface.

## Migrações e shadow database

A configuração tem nome personalizado: passe `--config prisma7.config.ts`
quando executar a CLI diretamente.

`migrate deploy` aplica migrações existentes e **não precisa de shadow**.
Para desenvolver novas migrações:

```bash
npx prisma migrate dev --config prisma7.config.ts --name descricao_da_alteracao
npm run db:generate
```

Se o usuário não tem `CREATEDB`, um administrador precisa criar previamente
um banco separado, descartável, de propriedade do usuário das migrações e
configurar sua URL como `SHADOW_DATABASE_URL`.

**Nunca use o banco principal como shadow: o Prisma apaga os dados do shadow.**
`P3014` indica ausência de permissão quando o Prisma tenta criá-lo;
`P1003` indica que o banco da URL não existe no servidor configurado.
Não use `migrate dev`, `reset` ou `db push --force-reset` em produção.

A migração inclui um índice parcial que impede duas contas não pagas para
o mesmo cliente. Se houver duplicatas anteriores, revise-as com o responsável
antes de migrar; a aplicação não apaga contas para resolver conflitos.
E-mails são únicos também sem distinção entre maiúsculas e minúsculas.
Contas antigas que diferem apenas por capitalização precisam ser revisadas
antes de aplicar o índice de unicidade.

## Validação

```bash
npm run lint
npm test
npm run test:integration
npx tsc --noEmit
npm run build
```

Os testes de integração criam um schema `commandbar_test_<aleatorio>`,
aplicam migrações e o removem ao concluir. Exigem permissão `CREATE` no banco
de desenvolvimento, não `CREATEDB`; não modificam tabelas do schema principal.

Para inspecionar dados fictícios isolados no navegador, após o build:

```bash
npx tsx tests/browser-server.ts
```

O comando exibe uma senha de teste aleatória e serve `localhost:3100`, usando
schema `commandbar_browser_<aleatorio>`. Dados e Pix são exclusivamente
ilustrativos. Ao interromper com Ctrl+C, o servidor e o schema são removidos.
Nunca utilize o Pix de teste para receber pagamentos reais.

## Limites desta versão

Não inclui conciliação automática de Pix, integração de cartão, controle
automático de estoque, cadastro público de funcionários, recuperação de senha
ou tela de consulta histórica. Dados históricos permanecem no PostgreSQL.
Operações financeiras e mudanças de turno são transacionais, serializadas
por estabelecimento; esta versão atende um único bar.
