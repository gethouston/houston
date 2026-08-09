// Texto em português para a landing. A árvore de chaves quem manda é o en.js:
// este arquivo espelha ela exatamente (mesmos caminhos, mesmos tamanhos de
// array), e scripts/check-locales.mjs garante isso.
//
// Regras:
// - Chaves terminadas em `Html` podem trazer marcação e são renderizadas com
//   `| safe`. Todo o resto é texto puro e o template escapa.
// - Nada de travessão longo. Use vírgula, dois-pontos ou uma frase nova.
// - `{price}` e `{days}` são os únicos marcadores. Os templates substituem a
//   partir de _data/pricing.js, então nenhum preço fica escrito na mão dentro
//   de uma tradução.
// - A estrutura (tons de avatar, elencos de rostos, caminhos de logo, selos)
//   vive em _data/landing.js. Os arrays daqui casam por índice com os de lá.
// - A subárvore `js` é serializada na página como window.HOUSTON_I18N pelo
//   _includes/landing/i18n-data.njk. Só entram ali textos de runtime.

export default {
  meta: {
    title: "Houston: agentes de IA que fazem o trabalho de verdade",
    description:
      "O Houston é o espaço de trabalho compartilhado onde pessoas e agentes de IA trabalham juntos. Agentes compartilhados, um único quadro de missões e papéis para o time inteiro. Grátis para até três pessoas.",
    ogTitle: "Houston: agentes de IA que fazem o trabalho de verdade",
    ogDescription:
      "O Houston é o espaço de trabalho compartilhado onde pessoas e agentes de IA trabalham juntos. Agentes compartilhados, um único quadro de missões e papéis para o time inteiro. Grátis para até três pessoas.",
    twTitle: "Houston: agentes de IA que fazem o trabalho de verdade",
    twDescription:
      "O Houston é o espaço de trabalho compartilhado onde pessoas e agentes de IA trabalham juntos. Agentes compartilhados, um único quadro de missões e papéis para o time inteiro. Grátis para até três pessoas.",
    jsonLdDescription:
      "App de computador gratuito que coloca agentes de IA para fazer trabalho de verdade por você, com a assinatura de ChatGPT ou Claude que você já tem e mais de 1.000 integrações.",
    ogImageAlt: "Houston: agentes de IA que fazem o trabalho de verdade.",
  },

  nav: {
    skip: "Pular para o conteúdo",
    primary: "Principal",
    multiplayer: "Multiplayer",
    agents: "Agentes",
    features: "Funcionalidades",
    pricing: "Preços",
    faq: "Perguntas",
    resources: "Recursos",
    agentStore: "Loja de agentes",
    guides: "Guias",
    vision: "Visão",
    changelog: "Novidades",
    github: "GitHub",
    githubLabel: "Houston no GitHub",
    download: "Baixar",
    menu: "Menu",
    langLabel: "Idioma",
    links: {
      guides: "/guides/",
    },
  },

  hero: {
    h1Html: "Um app para todos os agentes de IA do seu&nbsp;time",
    sub: "O Houston dá ao seu time um único lugar para usar agentes de IA, com qualquer modelo e conectados às ferramentas que vocês já usam, para que cada agente e tudo o que ele aprende pertença à empresa e não à conta de uma pessoa.",
    ctaDownload: "Baixar o app",
    ctaSeeHow: "Ver como funciona",
    windowAlt:
      "O Houston, o app de computador: o quadro de missões compartilhado de um time, onde os agentes movem tarefas entre Em execução, Precisa de você e Pronto, com os rostos de quem está em cada missão agrupados ao lado",
    app: {
      workspace: "Acme Studio",
      nav: {
        missionControl: "Central de missões",
        integrations: "Integrações",
        models: "Modelos de IA",
        usage: "Uso",
        agentStore: "Loja de agentes",
        settings: "Configurações",
      },
      sharedAgents: "Agentes compartilhados",
      search: "Buscar missões",
      guide: "Me guie",
      newMission: "Nova missão",
      tabs: {
        activity: "Atividade",
        routines: "Rotinas",
        integrations: "Integrações",
        files: "Arquivos",
        archived: "Arquivadas",
        agentSettings: "Configurações do agente",
      },
      cols: {
        running: "Em execução",
        needsYou: "Precisa de você",
        done: "Pronto",
      },
      peopleGroup: "Pessoas nesta missão",
      agents: {
        houston: "Assistente pessoal",
        "chief-of-staff": "Chefe de Gabinete",
        bookkeeper: "Contador",
        "sales-rep": "Executivo de Vendas",
      },
      boardTitle: "Assistente pessoal",
      needsCard: {
        title: "Aprovar a renovação do fornecedor",
        desc: "Condições comparadas, esperando seu aval",
      },
      doneCard: {
        title: "Dar retorno no e-mail urgente",
        desc: "4 respostas prontas, 17 arquivados",
      },
    },
  },

  multiplayer: {
    title: "A IA deixou de ser um jogo solo.",
    phrase1: "A IA vive trancada em conversas privadas.",
    phrase2: "O Houston coloca seus agentes na frente do time inteiro.",
    tabsLabel: "Casos de uso",
    tabs: ["Vendas", "Contabilidade", "Contratação", "Suporte"],
    agentName: "Executivo de Vendas",
    mission: "Refazer o relatório de pipeline do Q3",
    composer: "Fale com seu time e com o agente...",
    peopleLabel: "Pessoas nesta conversa",
    msgs: [
      {
        who: "Julian",
        textHtml:
          "Refaça o relatório de pipeline do Q3. Puxe todo negócio aberto do HubSpot, cruze com as conversas de e-mail no Gmail e me diga o que vai fechar de verdade.",
      },
      {
        who: "Executivo de Vendas",
        textHtml:
          "Estou nisso. 63 negócios abertos no HubSpot, cruzados com o Gmail. 12 estão parados há mais de 3 semanas e 5 estão travados esperando um contrato do nosso lado.",
      },
      {
        who: "Felipe",
        textHtml:
          'Tire as contas que cancelaram e inclua as renovações deste trimestre. <span class="mention">@Julian</span> os parados são decisão sua.',
      },
      {
        who: "Executivo de Vendas",
        textHtml:
          "Atualizado. Tirei 4 contas que cancelaram e somei 9 renovações. O pipeline ponderado é de $1.4M, com $380K em risco real por causa das conversas paradas.",
      },
      {
        who: "Julian",
        textHtml:
          "Corra atrás dos parados. Deixe onde o time inteiro consiga ver.",
      },
      {
        who: "Executivo de Vendas",
        textHtml:
          'Pronto. O relatório está no quadro compartilhado, os negócios em risco sinalizados e um retorno escrito para cada um. <span class="mention">@Julian</span> confirme e eu envio os 12.',
      },
    ],
  },

  parallel: {
    title: "Multiagente por natureza.",
    lines: [
      "Cada time e cada projeto precisa de agentes diferentes. O Houston nasceu multiagente desde o dia zero.",
      "E cada agente é multiconversa: cada cartão é uma conversa própria. É assim que você toca muitos projetos, com muita gente, em paralelo.",
      "Crie um agente para o seu negócio em minutos, ou comece de um que a comunidade já montou.",
    ],
    cta: "Explorar a Loja de agentes",
    tabsLabel: "Agentes",
    peopleLabel: "Pessoas nesta missão",
    agents: {
      "sales-rep": {
        name: "Executivo de Vendas",
        missionCount: "18 missões",
        more: "mais 13 missões",
        alt: "A coluna de missões do Executivo de Vendas: 18 missões em paralelo, as cinco primeiras à vista",
        cards: [
          {
            title: "Refazer o relatório de pipeline do Q3",
            desc: "Cruzando 63 negócios com o Gmail",
          },
          {
            title: "Preparar a renovação da Acme",
            desc: "O preço precisa da sua aprovação",
          },
          {
            title: "Dar retorno a 12 leads parados",
            desc: "3 respostas escritas, 2 negócios andando",
          },
          {
            title: "Escrever a proposta da Meridian",
            desc: "Escopo tirado das últimas três reuniões",
          },
          {
            title: "Registrar a semana no HubSpot",
            desc: "Cada ligação e cada resposta, no lugar",
          },
        ],
      },
      bookkeeper: {
        name: "Contador",
        missionCount: "14 missões",
        more: "mais 9 missões",
        alt: "A coluna de missões do Contador: 14 missões em paralelo, as cinco primeiras à vista",
        cards: [
          {
            title: "Conciliar março",
            desc: "Cruzando o QuickBooks com o extrato do banco",
          },
          {
            title: "Entregar o relatório de despesas do Q1",
            desc: "Faltam 2 recibos, sinalizados para você",
          },
          {
            title: "Cobrar 4 boletos vencidos",
            desc: "2 pagos, 2 prometidos para esta semana",
          },
          {
            title: "Montar o pacote de impostos",
            desc: "Juntando os extratos para a contabilidade",
          },
          {
            title: "Classificar as assinaturas novas",
            desc: "3 ferramentas achadas na fatura do cartão",
          },
        ],
      },
      "hr-manager": {
        name: "Gerente de Talentos",
        missionCount: "21 missões",
        more: "mais 16 missões",
        alt: "A coluna de missões do Gerente de Talentos: 21 missões em paralelo, as cinco primeiras à vista",
        cards: [
          {
            title: "Filtrar quem se candidatou a design",
            desc: "34 perfis contra o briefing da vaga",
          },
          {
            title: "Escrever a política de indicações",
            desc: "Primeira versão pronta para sua revisão",
          },
          {
            title: "Dar boas-vindas a Maya",
            desc: "Contas criadas, documento de integração enviado",
          },
          {
            title: "Marcar as entrevistas finais",
            desc: "5 candidatos, agendas encaixadas",
          },
          {
            title: "Renovar o plano de saúde",
            desc: "Três orçamentos comparados, um sinalizado",
          },
        ],
      },
      "support-rep": {
        name: "Analista de Suporte",
        missionCount: "16 missões",
        more: "mais 11 missões",
        alt: "A coluna de missões do Analista de Suporte: 16 missões em paralelo, as cinco primeiras à vista",
        cards: [
          {
            title: "Zerar a fila do fim de semana",
            desc: "41 chamados, escrevendo respostas",
          },
          {
            title: "Escalar o erro de cobrança",
            desc: "3 relatos batem, precisa de um engenheiro",
          },
          {
            title: "Enviar o resumo da semana",
            desc: "Os principais assuntos, resumidos para o time",
          },
          {
            title: "Atualizar a central de ajuda",
            desc: "4 artigos reescritos a partir de chamados reais",
          },
          {
            title: "Etiquetar os pedidos de novidades",
            desc: "12 registrados para a revisão de produto",
          },
        ],
      },
    },
  },

  compound: {
    title: "Ensine uma vez. Melhor para sempre.",
    lines: [
      "Corrija o agente uma vez e fica valendo, para todo mundo. Cada aprendizado, habilidade e arquivo que ele carrega é do time inteiro.",
      "Isso é acumular: a cada semana seus agentes conhecem seu negócio melhor do que na semana anterior.",
      "Quem chega herda tudo no primeiro dia, e nada vai embora pela porta.",
    ],
    tabsLabel: "O que o agente carrega",
    tabs: {
      learnings: "Aprendizados",
      skills: "Habilidades",
      context: "Contexto",
    },
    agentName: "Executivo de Vendas",
    agentSub: "Agente compartilhado · Acme Studio",
    countLabel: "aprendizados",
    learnings: {
      alt: "Os aprendizados do agente, ensinados pelo time e crescendo: contas que cancelaram fora da conta, donos do negócio em cópia, renovações a partir da data do contrato, descontos com aval, ligações registradas no HubSpot",
      rows: [
        {
          note: "Deixar de fora do pipeline as contas que cancelaram",
          when: "há 2 dias",
        },
        {
          note: "Colocar o dono do negócio em cópia antes de enviar qualquer coisa",
          when: "há 5 dias",
        },
        {
          note: "Contar as renovações a partir da data do contrato",
          when: "há 1 semana",
        },
        {
          note: "Descontos acima de 15% precisam de aval",
          when: "há 2 semanas",
        },
        {
          note: "Registrar toda ligação no HubSpot, no mesmo dia",
          when: "há 3 semanas",
        },
      ],
    },
    skills: {
      alt: "As habilidades do agente e as ferramentas de cada uma: relatório de pipeline com HubSpot e Gmail, sequência de retorno com Gmail, rascunho de proposta com Notion, resumo de reunião com Slack e Notion, retrospectiva de ganhos e perdas com HubSpot e Slack",
      rows: [
        { note: "Relatório de pipeline" },
        { note: "Sequência de retorno" },
        { note: "Rascunho de proposta" },
        { note: "Resumo de reunião" },
        { note: "Retrospectiva de ganhos e perdas" },
      ],
    },
    context: {
      alt: "O contexto do agente, uma galeria de arquivos do time: tabela de preços, notas do cliente ideal, metas do Q3, casos de sucesso, manual de objeções, roteiro da demo",
      tiles: [
        { name: "Tabela de preços", meta: "2 páginas" },
        { name: "Notas do cliente ideal", meta: "atualizado há 3 dias" },
        { name: "Metas do Q3", meta: "ao vivo" },
        { name: "Casos de sucesso", meta: "pasta" },
        { name: "Manual de objeções", meta: "9 jogadas" },
        { name: "Roteiro da demo", meta: "atualizado há 1 semana" },
      ],
    },
  },

  stack: {
    title: "Conecta com tudo o que você já usa.",
    tiles: [
      {
        n: "1.000+",
        l: "integrações, as ferramentas onde seu time já trabalha",
        more: "mais 990",
      },
      {
        n: "400+",
        l: "modelos, troque o de cada agente quando quiser",
        more: "mais 30 provedores",
      },
      {
        n: "Use sua assinatura de IA",
        l: "ChatGPT, Claude e os planos de programação que você já paga. Sem uma segunda conta.",
        more: "ou traga qualquer API key",
      },
      {
        n: "Modelos locais",
        l: "um computador atende o time inteiro, totalmente privado",
        more: "ou qualquer servidor compatível com OpenAI",
      },
    ],
  },

  pricing: {
    title: "Pronto para multiplicar seu time por 10 da noite para o dia?",
    lead: "Grátis para as três primeiras pessoas. Suba de plano quando o time inteiro quiser entrar.",
    free: {
      name: "Grátis",
      note: "para você, ou para um time de até três",
      items: [
        "Seu espaço de trabalho pessoal, grátis para sempre",
        "Até três pessoas quando você quiser",
        "Todas as mais de 1.000 integrações",
        "Funciona com sua assinatura de IA",
        "Agentes da comunidade, direto da loja",
      ],
      cta: "Baixar o app",
    },
    team: {
      chip: "Mais popular",
      name: "Time",
      per: "/pessoa/mês",
      note: "cobrado por ano · {price} cobrado por mês",
      items: [
        "Tudo do plano Grátis",
        "Colegas ilimitados",
        "Uso ilimitado, agentes a qualquer hora",
        "Agentes compartilhados e espaços de time",
        "Papéis e limites",
      ],
      cta: "Começar teste grátis",
    },
    enterprise: {
      name: "Empresarial",
      amount: "Sob medida",
      note: "para times maiores",
      items: ["SSO", "Revisão de segurança", "Implantação para o time inteiro"],
      cta: "Fale com a gente",
    },
  },

  faq: {
    title: "Perguntas, respondidas",
    groups: [
      {
        title: "Multiplayer e times",
        items: [
          {
            q: "O time inteiro pode trabalhar no mesmo agente?",
            aHtml:
              "Pode. Compartilhe um agente e escolha quem pode usar e quem pode administrar. Todo mundo trabalha no mesmo quadro de missões e consegue retomar uma missão de onde outra pessoa parou.",
          },
          {
            q: "Quais são os papéis?",
            aHtml:
              "Três: dono, administrador e membro. O dono cuida da cobrança e pode fazer tudo. Os administradores adicionam pessoas, criam agentes e mudam as configurações. Os membros usam os agentes que recebem.",
          },
          {
            q: "Quem vê quais agentes?",
            aHtml:
              "Você decide, agente por agente. Cada pessoa só vê e usa os agentes compartilhados com ela, então o resto do espaço de trabalho fica privado.",
          },
          {
            q: "O que é um espaço?",
            aHtml:
              "Cada pessoa ganha um espaço pessoal que é só dela. Ao lado ficam os espaços de time para o trabalho compartilhado, e você troca entre eles em um clique.",
          },
          {
            q: "Dá para colocar limites em um agente compartilhado?",
            aHtml:
              "Dá. Em cada agente compartilhado você escolhe quais aplicativos e quais modelos de IA ele pode usar. Cada pessoa continua escolhendo o próprio modelo dentro do que você permite.",
          },
          {
            q: "Compartilhar um agente apaga o histórico dele?",
            aHtml:
              "Não. Mova ele para um time e o histórico e as habilidades continuam lá, e seus colegas conseguem retomar qualquer missão do ponto em que ela está.",
          },
          {
            q: "No computador ou na web?",
            aHtml:
              "Nos dois. Você chega nos mesmos espaços, agentes e missões pelo app de computador ou pela web.",
          },
        ],
      },
      {
        title: "Agentes e ferramentas",
        items: [
          {
            q: "Quais agentes já vêm prontos?",
            aHtml:
              "Um time completo: assistente pessoal, contador, gerente de talentos, analista de suporte, executivo de vendas, gerente administrativo, analista financeiro, líder de crescimento e mais.",
          },
          {
            q: "Dá para adicionar ou criar mais?",
            aHtml:
              'Dá. Veja mais de 30 na <a href="https://agents.gethouston.ai">Loja de agentes</a>, ou crie o seu em minutos.',
          },
          {
            q: "Com o que os agentes conseguem se conectar?",
            aHtml:
              "Com mais de 1.000 ferramentas que você já usa, como Gmail, Slack, QuickBooks, HubSpot e Google Drive.",
          },
          {
            q: "Posso usar meu próprio plano do ChatGPT ou do Claude?",
            aHtml:
              "Pode. Conecte o plano de ChatGPT ou Claude que você já paga e não existe uma segunda conta de IA. Prefere chaves de API ou outro provedor? Também funciona.",
          },
          {
            q: "Quais modelos os agentes podem usar?",
            aHtml:
              "Mais de 400, de todos os grandes provedores. Cada agente pode rodar um modelo diferente, cada pessoa escolhe o seu dentro disso, e os administradores definem o teto do time.",
          },
          {
            q: "Dá para rodar modelos locais?",
            aHtml:
              "Dá. Rode um modelo local em um computador e ele serve tokens para os agentes do time inteiro. Privado por padrão, e sem nenhuma conta por token.",
          },
        ],
      },
      {
        title: "Preços e cobrança",
        items: [
          {
            q: "O que é grátis?",
            aHtml:
              "O Houston é grátis para até três pessoas em um espaço, com uso limitado e sem cartão. O suficiente para colocar agentes em trabalho de verdade e sentir o valor. Quando o time inteiro quiser entrar, ou você precisar de uso ilimitado, é só subir para o plano Time.",
          },
          {
            q: "Quem paga por um time?",
            aHtml:
              "O dono. Todo mundo que você convida entra no plano do dono, então os membros nunca colocam um cartão próprio.",
          },
          {
            q: "O que conta como uma pessoa?",
            aHtml:
              "Um membro que aceita o seu convite. Convites pendentes não são cobrados, e a cobrança é proporcional quando alguém entra ou sai.",
          },
          {
            q: "Como funciona o teste grátis?",
            aHtml:
              "Um espaço de time ganha {days} dias de teste grátis, sem cartão. Começa quando a sua segunda pessoa aceita.",
          },
          {
            q: "O que acontece quando o teste acaba?",
            aHtml:
              "Nada é apagado. O espaço volta para o plano grátis: até três pessoas e uso limitado. Cada agente e cada missão continuam no lugar. Coloque um cartão quando quiser.",
          },
          {
            q: "Os membros baixam ou pagam?",
            aHtml:
              "Os membros só aceitam o convite e baixam o app. A cobrança fica com o dono.",
          },
          {
            q: "Agentes a qualquer hora e plano Empresarial?",
            aHtml:
              "O plano Time mantém os agentes compartilhados rodando mesmo com os computadores fechados. O plano Empresarial soma login único, SLA de disponibilidade, suporte prioritário em inglês e espanhol, e implantação privada.",
          },
        ],
      },
      {
        title: "Como pegar o app",
        items: [
          {
            q: "Em quais sistemas o Houston roda?",
            aHtml:
              'Baixe para <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="mac">macOS</button> ou <button class="dl-os-link" data-dl-trigger data-dl-source="faq-os" data-dl-os="windows">Windows</button>. No Windows, escolha x64 (Intel ou AMD) ou ARM64 (Surface, Snapdragon).',
          },
          {
            q: "Como eu entro?",
            aHtml:
              "O Houston é grátis enquanto estamos em beta. Toque em baixar, conte quem você é e o instalador começa na hora.",
          },
        ],
      },
    ],
  },

  footer: {
    blurb:
      "O espaço de trabalho onde pessoas e agentes de IA trabalham juntos. Grátis para testar, e para o time inteiro quando você quiser.",
    download: "Baixar",
    mac: "macOS",
    windows: "Windows",
    product: "Produto",
    company: "Empresa",
    resources: "Recursos",
    contact: "Contato",
    twitter: "Twitter / X",
    credit: "Houston. Código aberto.",
    privacy: "Política de Privacidade",
    terms: "Termos de Uso",
    unsubscribe: "Cancelar inscrição",
    unsubscribeSubject: "Cancelar inscrição",
    unsubscribeBody:
      "Por favor, removam este e-mail das comunicações do Houston.",
    langLabel: "Idioma",
  },

  gate: {
    title: "Baixe o Houston",
    lead: "Conte quem você é e o seu download começa na hora.",
    close: "Fechar",
    name: {
      label: "Nome completo",
      placeholder: "Ana Souza",
      error: "Escreva seu nome completo para continuar.",
    },
    email: {
      label: "E-mail",
      placeholder: "ana@empresa.com",
      error: "Escreva um e-mail válido para continuar.",
    },
    phone: {
      label: "Telefone",
      optional: "(melhor se for pelo WhatsApp)",
      placeholder: "11 91234 5678",
      error: "Escreva seu telefone para continuar.",
      ccLabel: "Código do país",
    },
    linkedin: {
      label: "LinkedIn",
      placeholder: "https://www.linkedin.com/in/voce",
      error: "Escreva uma URL válida do LinkedIn para continuar.",
    },
    country: {
      label: "País",
      placeholder: "Escolha seu país",
      error: "Escolha seu país para continuar.",
      searchPlaceholder: "Buscar países",
      empty: "Nada encontrado",
      menuLabel: "Lista de países",
    },
    submit: "Continuar para o download",
    formError: "Algo deu errado. Tente de novo.",
    fineprintHtml:
      'Ao continuar você aceita receber novidades do produto Houston. Cancele quando quiser. Veja nossa <a href="/privacy/">Política de Privacidade</a>.',
    done: {
      title: "Tudo pronto",
      lead: "Escolha seu download e boa viagem.",
    },
    macBtn: "Baixar para Mac",
    winX64: "Windows (x64 / Intel / AMD)",
    winArm: "Windows (ARM64 / Surface, Snapdragon)",
    notSure: "Não sabe qual escolher?",
    notSureBody:
      'A maioria dos computadores é x64 (processadores Intel ou AMD). Só um Surface Pro X, um Surface Pro 9 5G, um notebook com Snapdragon X ou outra máquina Windows baseada em ARM precisa do ARM64. Na primeira instalação vai aparecer um aviso do SmartScreen: toque em "Executar assim mesmo". A assinatura de código completa está a caminho.',
    switchArch: "Escolheu errado? Troque para a outra versão →",
  },

  // Aparece para quem chega com o navegador em outro idioma. O texto em inglês
  // é só a âncora de paridade: aqui o convite é em português.
  langBanner: {
    text: "Este site também está em português.",
    cta: "Ver em português",
    dismiss: "Continuar em inglês",
  },

  // Tudo daqui para baixo viaja ao navegador como window.HOUSTON_I18N.
  js: {
    people: {
      julian: "Julian",
      felipe: "Felipe",
      maya: "Maya",
      ana: "Ana",
    },
    heroDemo: {
      agents: {
        houston: "Assistente pessoal",
        "sales-rep": "Executivo de Vendas",
        bookkeeper: "Contador",
        "chief-of-staff": "Chefe de Gabinete",
      },
      scripts: {
        houston: {
          mission: "Zerar a caixa de entrada",
          card: {
            title: "Dar retorno no e-mail urgente",
            running: "Lendo 23 não lidos, escrevendo respostas",
            done: "4 respostas prontas, 17 arquivados",
          },
          needsYou: {
            title: "Aprovar a renovação do fornecedor",
            desc: "Condições comparadas, esperando seu aval",
          },
        },
        "sales-rep": {
          mission: "Refazer o pipeline do Q3",
          card: {
            title: "Refazer o relatório de pipeline do Q3",
            running: "Cruzando negócios do HubSpot com conversas do Gmail",
            done: "Relatório pronto, 6 negócios sinalizados em risco",
          },
          needsYou: {
            title: "Aprovar a renovação da Acme",
            desc: "Rascunho pronto, esperando seu aval",
          },
        },
        bookkeeper: {
          mission: "Conciliar o mês passado",
          card: {
            title: "Conciliar 842 transações",
            running: "Cruzando o Stripe com o extrato do banco",
            done: "838 bateram, 4 sinalizadas para revisão",
          },
          needsYou: {
            title: "Revisar 4 cobranças sinalizadas",
            desc: "Sem nota fiscal registrada, a decisão é sua",
          },
        },
        "chief-of-staff": {
          mission: "Preparar o informe do conselho",
          card: {
            title: "Preparar o informe do conselho",
            running: "Puxando indicadores e assuntos em aberto",
            done: "O resumo de uma página está na sua caixa de entrada",
          },
          needsYou: {
            title: "Aprovar o plano de lançamento",
            desc: "Cronograma montado, esperando seu OK",
          },
        },
      },
    },
    chat: {
      scenarios: {
        sales: {
          label: "Vendas",
          agent: "Executivo de Vendas",
          mission: "Refazer o relatório de pipeline do Q3",
          turns: [
            "Refaça o relatório de pipeline do Q3. Puxe todo negócio aberto do HubSpot, cruze com as conversas de e-mail no Gmail e me diga o que vai fechar de verdade.",
            "Estou nisso. 63 negócios abertos no HubSpot, cruzados com o Gmail. 12 estão parados há mais de 3 semanas e 5 estão travados esperando um contrato do nosso lado.",
            "Tire as contas que cancelaram e inclua as renovações deste trimestre. @Julian os parados são decisão sua.",
            "Atualizado. Tirei 4 contas que cancelaram e somei 9 renovações. O pipeline ponderado é de $1.4M, com $380K em risco real por causa das conversas paradas.",
            "Corra atrás dos parados. Deixe onde o time inteiro consiga ver.",
            "Pronto. O relatório está no quadro compartilhado, os negócios em risco sinalizados e um retorno escrito para cada um. @Julian confirme e eu envio os 12.",
          ],
        },
        bookkeeping: {
          label: "Contabilidade",
          agent: "Contador",
          mission: "Fechar os livros do mês passado",
          turns: [
            "Feche o mês passado. Puxe cada transação do Stripe e do banco, cruze tudo e sinalize o que não bater.",
            "Já estou nisso. 842 transações entre o Stripe e o extrato do banco. 838 bateram direitinho. 3 cobranças do banco estão sem nota fiscal e 1 reembolso ficou registrado duas vezes. @Julian esse reembolso parece seu, consegue confirmar?",
            "Confirmado, emitimos por engano. Classifique as 3 cobranças como software.",
            "Pronto. Reembolso anotado, 3 cobranças classificadas como software. Os livros fecham no centavo.",
            "Ótimo. Mande para a contabilidade.",
            "Enviado. O mês conciliado já está com a contabilidade. @Felipe o resumo de uma página ficou na pasta compartilhada para o seu aval.",
          ],
        },
        hiring: {
          label: "Contratação",
          agent: "Gerente de Talentos",
          mission: "Contratar um designer sênior",
          turns: [
            "Abra a vaga de designer sênior. Publique e depois filtre todo mundo que se candidatar contra o briefing.",
            "Publicada no LinkedIn e na página de vagas. 41 pessoas até agora, cada uma avaliada contra o briefing. Estou priorizando design de produto e experiência B2B.",
            "Suba para o topo quem tem experiência em fintech. @Julian você vai querer ver os dois primeiros.",
            "Reordenado. Os 9 melhores agora, 4 com passagem por fintech. Anexei notas e portfólio de cada um.",
            "Marque conversas com os 3 melhores.",
            "Marcadas. Três conversas de apresentação na sua agenda esta semana. @Felipe quer que eu inclua você nos convites do painel?",
          ],
        },
        support: {
          label: "Suporte",
          agent: "Analista de Suporte",
          mission: "Zerar a fila de suporte",
          turns: [
            "A fila de suporte está acumulada, 34 chamados abertos em dois dias. Faça a triagem e resolva o que der.",
            "Passando pelos 34. 19 são a mesma dúvida de cobrança depois da mudança de preço, 8 são troca de senha e 7 precisam de uma pessoa.",
            "Mande para os 19 de cobrança as novas perguntas frequentes de preço, e troque as 8 senhas.",
            "Pronto. 27 chamados respondidos e fechados pela caixa compartilhada. Os 7 que pedem julgamento ficaram etiquetados e esperando.",
            "Os 7 são sobre o quê?",
            "Cinco dúvidas sobre funcionalidades com respostas escritas, e dois reembolsos acima do nosso limite. @Felipe aprove esses e tudo sai hoje.",
          ],
        },
      },
    },
    compound: {
      justNow: "agora mesmo",
      pool: [
        {
          note: "Cotar o preço anual na moeda do cliente",
          who: "Felipe",
        },
        {
          note: "Chamar o suporte quando um negócio menciona erros",
          who: "Julian",
        },
        {
          note: "Nunca prometer uma data sem olhar o roadmap",
          who: "Maya",
        },
        {
          note: "Resumir cada demo nas notas do negócio",
          who: "Julian",
        },
        {
          note: "Sinalizar concorrentes citados em qualquer conversa",
          who: "Felipe",
        },
        {
          note: "Enviar os e-mails de resumo antes do meio-dia, no fuso do cliente",
          who: "Ana",
        },
      ],
    },
    gate: {
      preparing: "Preparando seu download…",
      submit: "Continuar para o download",
      needWindows: "Precisa para Windows?",
      needMac: "Precisa para Mac?",
      countrySearch: "Buscar países",
      countryEmpty: "Nada encontrado",
      ccLabel: "Código do país",
      ccSearch: "Buscar códigos de país",
    },
  },
};
