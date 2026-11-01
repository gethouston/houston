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
    ctaRefer: "Indicar uma empresa",
    ctaHow: "Como funcionam as indicações",
    card: {
      label: "Você ganha até",
      per: "por empresa",
      terms: [
        "Valor integral para empresas com 30 ou mais funcionários",
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
        line: "Compartilhe a empresa e um contato lá, em cerca de dois minutos.",
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
  refer: {
    title: "Indique uma empresa.",
    lead: "Compartilhe a empresa e um contato lá. Nós cuidamos da abordagem.",
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
    sizeChoose: "Escolha um porte",
    sizes: [
      "1 a 19",
      "20 a 49",
      "50 a 199",
      "200 a 499",
      "500 a 999",
      "1.000 a 4.999",
      "5.000+",
    ],
    listing: "Solicitação",
    listingNone: "Não está na lista",
    contact: "Seu contato lá",
    contactHint:
      "Enviamos a apresentação por e-mail, então precisamos de um nome e um endereço.",
    contactName: "Nome do contato",
    contactEmail: "E-mail do contato",
    contactLinkedin: "LinkedIn do contato",
    linkedinPlaceholder: "linkedin.com/in/nome",
    fit: "Por que eles são uma boa opção?",
    fitPlaceholder: "Como você os conhece, que tipo de dados eles têm",
    optional: "Opcional",
    consent:
      "Podemos entrar em contato com a pessoa indicada para apresentar a Houston. Indique apenas quem gostaria disso.",
    submit: "Enviar indicação",
    privacy: "Como tratamos esses dados.",
    consentCheck:
      "Tenho a permissão dessa pessoa para compartilhar os dados dela com a Houston.",
    sending: "Enviando…",
    saved: {
      title: "Recebemos sua indicação.",
      line: "Nós a revisamos e avisamos você por email a cada etapa, da análise ao pagamento.",
    },
    errors: {
      yourName: "Seu nome é obrigatório.",
      yourEmail: "Digite um e-mail válido.",
      companyName: "O nome da empresa é obrigatório.",
      website: "Digite um site válido, como acme.com.",
      size: "Escolha o porte da empresa.",
      contactName: "O nome do contato é obrigatório.",
      contactEmail: "Digite um e-mail válido.",
      contactLinkedin: "Digite um link válido, como linkedin.com/in/nome.",
      sameCompany:
        "Você não pode indicar sua própria empresa. Ela pode entrar diretamente como parceira de dados.",
      consent:
        "Confirme que essa pessoa concorda em ser contatada pela Houston.",
    },
    mail: {
      subject: "Indicação: {company}",
      referrer: "Indicada por",
    },
    done: {
      title: "Sua indicação está pronta para enviar.",
      line: "Abrimos seu app de e-mail com tudo preenchido. Envie e nós seguimos daí.",
      fallback: "Nada abriu? Envie os dados para {inbox}.",
      again: "Indicar outra empresa",
    },
  },
  terms: {
    title: "As condições que definem quanto você ganha.",
    groups: [
      {
        title: "Como você recebe",
        lines: [
          "Até {amount} por empresa. A empresa precisa de pelo menos 20 funcionários em tempo integral para se qualificar. A partir de 30 funcionários você recebe o valor integral do pedido, e de 20 a 29 uma parte proporcional ao porte.",
          "Cada pedido mostra seu próprio valor: 10% do máximo que esse pedido paga à empresa, fixado no momento da indicação.",
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
          "Podemos entrar em contato com a pessoa indicada para apresentar a Houston. Indique apenas quem gostaria disso.",
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
        a: "Até {amount} por empresa. A empresa precisa de pelo menos 20 funcionários em tempo integral para se qualificar. A partir de 30 funcionários você recebe o valor integral do pedido, e de 20 a 29 uma parte proporcional ao porte.",
      },
      {
        q: "Quando eu recebo?",
        a: "Quando a empresa assina a licença de dados confirmamos sua recompensa, e a pagamos após a primeira entrega.",
      },
      {
        q: "Como é definido o valor de cada pedido?",
        a: "É 10% do máximo que esse pedido paga à empresa. Você o vê em cada pedido, e ele fica fixo no momento da indicação.",
      },
      {
        q: "Preciso conhecer alguém lá?",
        a: "Sim. Compartilhe um contato que possa falar sobre os dados da empresa, geralmente um fundador, um executivo ou um líder de operações.",
      },
      {
        q: "O que acontece depois da indicação?",
        a: "Analisamos a empresa e entramos em contato com a pessoa indicada. Enviamos um e-mail a cada avanço: enviada, em andamento, recompensa confirmada, paga.",
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
