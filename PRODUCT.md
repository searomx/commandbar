# Produto

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Os usuários principais são responsáveis com perfis master e manager. A equipe
do bar também utiliza o aplicativo para registrar e cobrar comandas.

## Product Purpose

O Comanda ajuda bares a controlar comandas individuais: registrar despesas por
cliente, acompanhar contas pendentes e pagas e concluir a operação do turno.

## Operating Context

- O atendimento ocorre durante o funcionamento do bar, em computadores e
  dispositivos móveis.
- As comandas são associadas a clientes e podem continuar pendentes entre turnos.
- Pix, dinheiro e cartão são opções de pagamento; a confirmação de recebimento
  é manual.
- Ao encerrar o turno, um ADMIN autoriza o fechamento e recebe por e-mail o
  relatório diário de movimentação em PDF.

## Capabilities and Constraints

- Os dados devem manter sua integridade e persistir entre sessões e turnos.
- O turno é compartilhado entre os dispositivos do estabelecimento.
- O aplicativo atende um único bar e não oferece cadastro público.
- O relatório diário considera as comandas criadas no dia do fechamento no
  horário de Brasília, incluindo valores pendentes e pagos.
- Não há conciliação automática de Pix nem movimentação automática de estoque.

## Brand Commitments

- Nome do produto: Comanda.
- Idioma da interface: português do Brasil.

## Evidence on Hand

- Os fluxos existentes e seus limites estão descritos no README do projeto.
- O aplicativo contém telas de login, painel de comandas e cobrança.

## Product Principles

- Preservar a integridade e a persistência dos dados operacionais.
- Tornar o registro, a consulta e a cobrança de comandas claros para a equipe.
- Distinguir pagamentos confirmados de contas ainda pendentes.
- Dar transparência ao encerramento de turno e ao relatório diário.

## Accessibility & Inclusion

- Os fluxos devem funcionar por teclado e sem depender exclusivamente de
  gestos; a interface respeita a preferência por movimento reduzido.
