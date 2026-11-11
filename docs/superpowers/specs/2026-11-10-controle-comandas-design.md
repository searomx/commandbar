# Controle de comandas do bar

## Decisões aprovadas

Aplicação integrada em Next.js, com PostgreSQL e Prisma 7 existentes.
Interface em português do Brasil, responsiva, com temas claro e escuro.
Formulários com o componente oficial `next/form`, validação Zod e operações
autenticadas no servidor. Zustand controla apenas o estado da interface,
nunca a autoridade sobre pagamentos, permissões ou totais.

O acesso é de funcionários (`User`); clientes (`Customer`) não fazem login.
O catálogo de produtos será previamente cadastrado. Não haverá tela de
gerenciamento de produtos nesta versão.

## Arquitetura e responsabilidades

- Autenticação: verifica credenciais, mantém sessão persistida e autoriza
  operações no servidor. Senhas são armazenadas como hash, nunca em texto.
- Comandas: administra clientes, itens, fechamento e cálculo monetário.
- Pagamento: gera Pix e registra confirmação manual de recebimento.
- Turnos: mantém o painel compartilhado e autoriza encerramento global.
- Interface: apresenta os dados do servidor e controla diálogos, seleção
  de comanda, tema e mensagens de validação.

Preservar as versões existentes de Next.js e Prisma. Verificar as versões
estáveis compatíveis de Zustand, Zod e Tailwind antes de alterar dependências.
Não atualizar nem provisionar o servidor PostgreSQL como parte da implementação.
Antes de escrever código Next.js, consultar a documentação instalada do projeto.

## Autenticação e acesso

Login por e-mail e senha, usando o modelo `User`. Sessão em cookie HttpOnly,
Secure em produção e SameSite adequado, com expiração e revogação no servidor.
Nunca enviar o hash da senha ao navegador. Falhas de login não revelam se
um e-mail está cadastrado. Aplicar proteção contra tentativas repetidas e
validar a origem das operações de escrita.

Funcionários autenticados podem operar clientes, comandas e confirmação
manual de pagamento. Encerrar o turno exige e-mail e senha de uma conta ativa
com papel ADMIN ou MANAGER, verificados novamente no servidor. Não é necessário
que essa conta seja a mesma que iniciou a sessão.

O provisionamento inicial de usuários com hash e produtos existentes deve ser
documentado, sem credenciais padrão em código. Cadastro público de funcionários
e gerenciamento de usuários ficam fora do escopo.

## Painel e cadastro de cliente

Cabeçalho com nome do funcionário, alternância de tema, botão
“Adicionar Comanda” e botão “Encerrar aplicativo”.

Cada card mostra número da comanda, nome do cliente, total formatado em reais
e situação de pagamento em português. Comandas novas começam como PENDING.

“Adicionar Comanda” abre diálogo com seleção pesquisável de clientes.
Uma ação dentro do diálogo revela nome e telefone para cadastrar um cliente;
após salvar, atualizar a lista e selecionar o cliente criado sem sair do diálogo.
O nome é obrigatório. Telefone é opcional, conforme o modelo existente, e
validado quando preenchido.

Uma comanda pertence a um único cliente. Novas comandas são criadas por ação
explícita, não automaticamente por dia. Não impor unicidade de comanda por
cliente sem requisito adicional.

## Itens e valores

Clicar em uma comanda editável abre editor lateral à direita em telas grandes
e painel em tela cheia nas pequenas. Selecionar produto existente e informar
quantidade; preço e unidade são capturados do catálogo pelo servidor.
Permitir adicionar, alterar quantidade e remover itens enquanto a comanda
estiver aberta para consumo.

Usar Decimal para cálculos persistidos. Total é a soma dos valores dos itens,
arredondados a centavos de maneira consistente. Não aceitar totais ou preços
arbitrários enviados pelo navegador. Persistir alterações e recalcular o total
na mesma transação; só anunciar sucesso após confirmação do servidor.

O preço de cada item é um retrato do catálogo no momento da inclusão.
Alterações posteriores no produto não alteram consumos já registrados.
Controle e baixa de estoque não fazem parte desta versão.

## Fechamento e pagamento

Pressionar um card editável durante três segundos abre o editor em modo de
fechamento. Cancelar o temporizador ao soltar antes do prazo, mover para rolar
ou cancelar o ponteiro; impedir que o clique posterior dispare uma segunda ação.
Disponibilizar também uma ação explícita “Fechar comanda” acessível por teclado.

Confirmar o fechamento bloqueia edição dos itens e apresenta pagamento.
O status financeiro continua PENDING até confirmação de recebimento.
Comandas sem itens ou sem valor positivo não podem iniciar cobrança.

Gerar QR Code Pix estático válido e Pix copia e cola com valor da comanda,
identificador de referência, chave Pix, nome e cidade do recebedor configurados
no ambiente. Validar essa configuração e mostrar erro explícito se ausente
ou inválida; não gerar QR Code fictício nem marcar recebimento automaticamente.

Cancelar o QR Code remove a cobrança da interface e permite selecionar outro
meio (dinheiro ou cartão) para confirmação manual. Isso não revoga uma
transferência nem invalida um Pix estático já copiado ou fotografado; exibir
essa limitação ao funcionário.

Após conferir o recebimento, o funcionário confirma o pagamento. O servidor
registra paymentStatus=PAID, paymentDate com horário do servidor, meio utilizado
e funcionário responsável. Confirmações repetidas não geram registros duplicados.
O card fica verde-claro, com indicação textual “Pago”, sem ações interativas.
Não integrar provedores, webhooks ou confirmação automática nesta versão.

## Turnos e reabertura

Turno é global e persistente, compartilhado pelos dispositivos. Fechar uma aba,
atualizar a página ou sair da sessão não encerra o turno.
Todos os cards do turno permanecem no painel, inclusive os pagos.

“Encerrar aplicativo” solicita autorização de ADMIN/MANAGER e confirmação.
O encerramento registra responsável e horário; não apaga contas nem histórico.
Requisições de escrita de telas de um turno já encerrado são rejeitadas
explicitamente e solicitam atualização.

O próximo acesso autenticado após o encerramento abre um novo turno, de modo
atômico para evitar turnos simultâneos. Somente comandas não pagas dos turnos
anteriores entram no novo painel, em vermelho-claro com indicação “Pendente
de turno anterior”. Elas voltam a aceitar edição, inclusive se estavam
aguardando pagamento; uma nova cobrança exige novo fechamento.

Pagas de turnos anteriores permanecem no banco e não aparecem no painel atual.
Uma interface de consulta de histórico não faz parte desta versão.
Telas abertas sincronizam alterações de outras sessões por atualização
periódica e ao recuperar o foco; o servidor sempre revalida o estado atual.

## Persistência e consistência

Estender o esquema preservando User, Customer, Product, Order e OrderItem.
Adicionar persistência de sessões, turnos e vínculo de comandas aos painéis
dos turnos, mantendo a origem e a passagem de pendências entre turnos.
Separar estado de consumo (aberto ou aguardando pagamento) do status financeiro.
Registrar fechamento, método de pagamento e responsáveis pelas ações relevantes.

Mudanças de itens, fechamento, pagamento e encerramento devem usar transações
e verificação de estado para impedir edição de conta paga, perda de atualização
ou pagamento concorrente com alteração do total. Operações concorrentes
conflitantes retornam mensagem para recarregar a comanda, sem sucesso aparente.

Migrações de desenvolvimento exigem um banco shadow separado e descartável.
Nunca usar o banco principal como shadow. Não executar reset, exclusão de dados
ou migração com risco de perda sem autorização explícita. Em produção, aplicar
migrações já criadas usando migrate deploy.

## Acessibilidade e apresentação

Labels visíveis, ordem de foco coerente, foco perceptível, contraste legível,
alvos de toque adequados e mensagens de erro associadas aos campos.
Diálogos têm nome acessível, foco contido e devolução de foco ao acionador.
Situações não são comunicadas apenas por cor. Anunciar alterações de total,
salvamento e erros sem deslocar o foco desnecessariamente.

Suportar desktop, notebook, tablet e smartphone sem rolagem horizontal.
Tema acompanha preferência do sistema até escolha manual persistida.
Respeitar prefers-reduced-motion. Disponibilizar estados de carregamento,
lista vazia, falta de produtos, falha de conexão e sessão expirada.
Não confirmar salvamento nem pagamento quando a operação falhar.

## Validação prevista

- Testes de validação de campos, quantidades, cálculo decimal e payload Pix.
- Testes de autenticação, expiração de sessão e autorização por papel.
- Testes de transações: alteração de itens, bloqueio no fechamento, pagamento
  idempotente, conflitos concorrentes e rejeição de conta paga.
- Testes de encerramento global e reabertura, permanência de cards pagos no
  turno e recuperação somente de pendências no próximo.
- Testes de interface: cadastro inline, clique e pressão longa de três segundos,
  cancelamento da pressão, fluxo alternativo por teclado e cancelamento do QR.
- Verificação de responsividade, foco dos diálogos, erros acessíveis, contraste,
  temas e movimento reduzido, além de lint, type-check e build.
- Verificar integração PostgreSQL somente quando a conexão e o shadow estiverem
  disponíveis. Relatar qualquer bloqueio, sem substituir persistência real por
  dados fictícios ou armazenamento apenas no navegador.
