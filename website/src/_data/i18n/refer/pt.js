// Cópia em português para /data-partners/refer. Espelho exato de en.js
// (scripts/check-locales.mjs verifica). Português do Brasil, com você.

export default {
  meta: {
    title: "Indique uma empresa à Houston Data Partners e ganhe até {amount}",
    description:
      "Conhece uma empresa com dados de negócio reais? Apresente-a à Houston. Quando ela licenciar seus dados, você ganha até {amount}, pagos após a primeira entrega.",
  },
  nav: {
    how: "Como funciona",
    companies: "Solicitações",
    terms: "Condições",
    faq: "Perguntas",
    cta: "Indicar uma empresa",
  },
  hero: {
    h1Lines: ["Conhece uma empresa?", "Ganhe pela indicação."],
    sub: "Apresente uma empresa que tenha dados de negócio reais. Quando ela licenciar esses dados com a Houston, você ganha até {amount}.",
    ctaHow: "Como funcionam as indicações",
    card: {
      label: "Você ganha até",
      per: "por empresa",
      terms: [
        "10% do valor que acordarmos pagar à empresa",
        "Confirmado quando a empresa assina a licença de dados",
        "Pago após a primeira entrega",
      ],
    },
  },
  how: {
    title: "Da apresentação ao pagamento, em quatro passos.",
    lead: "Você faz a apresentação. Nós fazemos todo o resto.",
    steps: [
      {
        title: "Encontre uma empresa",
        line: "Escolha uma solicitação aberta e pense em uma empresa que se encaixe.",
      },
      {
        title: "Indique",
        line: "Compartilhe a empresa e alguns dados sobre ela, em cerca de um minuto.",
      },
      {
        title: "Nós fazemos o trabalho",
        line: "Avaliamos os dados, fechamos uma licença e cuidamos da exportação.",
      },
      {
        title: "Você recebe",
        line: "Até {amount} por empresa, após a primeira entrega.",
      },
    ],
  },
  companies: {
    title: "Solicitações abertas de laboratórios de IA.",
    lead: "Escolha um setor e abra uma solicitação para ver exatamente o que o comprador procura e quanto você ganha.",
    categories: [
      "Software",
      "Saúde",
      "Ciência e P&D",
      "Indústria",
      "Finanças",
      "Serviços profissionais",
      "Mídia e games",
      "Empresas em operação",
    ],
    notListed:
      "Conhece uma empresa que não está nesta lista? Você ainda pode indicá-la e ganhar quando ela licenciar seus dados.",
    cta: "Indicar uma empresa",
  },
  track: {
    title: "Depois da indicação",
    note: "Enviamos um e-mail a cada avanço da sua indicação, da análise ao pagamento.",
    states: [
      {
        label: "Enviada",
        line: "Recebemos sua indicação e estamos analisando.",
      },
      {
        label: "Em andamento",
        line: "Estamos trabalhando com eles. Avisaremos como ficou.",
      },
      {
        label: "Recompensa confirmada",
        line: "Sua recompensa está confirmada e a caminho.",
      },
      {
        label: "Recompensa paga",
        line: "Sua recompensa foi paga.",
      },
    ],
  },
  form: {
    you: "Sobre você",
    yourName: "Seu nome",
    yourEmail: "Seu e-mail",
    company: "A empresa",
    companyName: "Nome da empresa",
    website: "Site da empresa",
    websitePlaceholder: "acme.com",
    size: "Número de funcionários",
    sizePlaceholder: "30",
    years: "Anos de atuação",
    yearsPlaceholder: "12",
    industry: "Setor",
    industryPlaceholder: "Selecione o setor",
    consent:
      "Nós entramos em contato com a empresa e mantemos você informado a cada etapa.",
    submit: "Enviar indicação",
    privacy: "Como tratamos esses dados.",
    sending: "Enviando…",
    needsJs: "Ative o JavaScript para enviar uma indicação.",
    saved: {
      title: "Recebemos sua indicação.",
      line: "Nós a revisamos e avisamos você por email a cada etapa, da análise ao pagamento.",
    },
    errors: {
      send: "Não conseguimos enviar sua indicação. Verifique sua conexão e tente de novo.",
      size: "Diga mais ou menos quantas pessoas trabalham lá.",
      years: "Digite os anos de atuação como um número inteiro, como 12.",
      industry: "Escolha o setor da empresa.",
      yourName: "Seu nome é obrigatório.",
      yourEmail: "Digite um e-mail válido.",
      companyName: "O nome da empresa é obrigatório.",
      website: "Digite um site válido, como acme.com.",
      sameCompany:
        "Você não pode indicar sua própria empresa. Ela pode entrar diretamente como parceira de dados.",
    },
    again: "Indicar outra empresa",
  },
  terms: {
    title: "As condições que definem quanto você ganha.",
    groups: [
      {
        title: "Como você recebe",
        lines: [
          "Você recebe 10% do valor que acordarmos pagar à empresa pelos dados, qualquer que seja o porte, até {amount} nos pedidos abertos de hoje. A empresa precisa de pelo menos 20 funcionários em tempo integral para se qualificar.",
          "Cada pedido mostra o máximo que você pode ganhar com ele: 10% do máximo que esse pedido paga à empresa.",
          "Confirmamos o valor quando a empresa assina a licença de dados. Até lá, nada é devido.",
          "Pago após a primeira entrega da empresa.",
        ],
      },
      {
        title: "Quem pode indicar",
        lines: [
          "Qualquer pessoa, exceto laboratórios de IA.",
          "Você não pode indicar sua própria empresa. Se ela é sua, pode entrar diretamente como parceira de dados.",
          "Vale a primeira indicação válida de cada empresa. Uma empresa já indicada, ou que já trabalha com a Houston, não se qualifica.",
          "Você pode ter até cinco indicações abertas ao mesmo tempo.",
        ],
      },
      {
        title: "Bom saber",
        lines: [
          "Nós entramos em contato com a empresa para apresentar a Houston.",
          "A Houston decide se uma empresa se encaixa e pode recusar qualquer indicação.",
        ],
      },
    ],
  },
  faq: {
    title: "Perguntas frequentes.",
    items: [
      {
        q: "Quanto posso ganhar?",
        a: "Você recebe 10% do valor que acordarmos pagar à empresa pelos dados, qualquer que seja o porte, até {amount} nos pedidos abertos de hoje. A empresa precisa de pelo menos 20 funcionários em tempo integral para se qualificar.",
      },
      {
        q: "Quando eu recebo?",
        a: "Quando a empresa assina a licença de dados confirmamos sua recompensa, e a pagamos após a primeira entrega.",
      },
      {
        q: "Como é definido o valor de cada pedido?",
        a: "Cada pedido mostra 10% do máximo que paga à empresa, para você ver o máximo que pode ganhar. O que você recebe é 10% do valor que realmente acordarmos com a empresa.",
      },
      {
        q: "Preciso conhecer alguém lá?",
        a: "Ajuda, mas não é obrigatório. Diga qual é a empresa e nós entramos em contato.",
      },
      {
        q: "O que acontece depois da indicação?",
        a: "Analisamos a empresa e entramos em contato com ela. Enviamos um e-mail a cada avanço: enviada, em andamento, recompensa confirmada, paga.",
      },
      {
        q: "E se alguém indicou antes?",
        a: "Vale a primeira indicação válida, então uma empresa só pode ser indicada uma vez. Uma empresa que já trabalha com a Houston não se qualifica.",
      },
      {
        q: "Quantas posso ter abertas?",
        a: "Até cinco indicações aguardando análise ao mesmo tempo.",
      },
      {
        q: "O que a Houston faz com os dados?",
        a: "A Houston licencia dados de negócio reais para laboratórios de IA, que os usam para treinar e avaliar sistemas de IA. Confirmamos quais dados a empresa tem, assinamos um NDA e então fechamos uma licença de dados e um pagamento. Nossa equipe cuida da exportação e remove ou protege informações pessoais conforme a licença exige.",
      },
    ],
  },
  contact: {
    title: "Conhece uma empresa que se encaixa?",
    lead: "Indique em cerca de dois minutos. Nós cuidamos da abordagem, da licença e da exportação.",
    cta: "Indicar uma empresa",
    peopleLabel: "A equipe que cuida da abordagem",
  },
};
