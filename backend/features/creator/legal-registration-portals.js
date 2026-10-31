"use strict";

// Curated government/registry entry points, not a promise that every structure
// must register. Do not guess destinations for the remaining ISO territories.
const REGISTRATION_PORTALS = Object.freeze({
  FR: { name: "Guichet unique des formalités d’entreprises (INPI)", url: "https://formalites.entreprises.gouv.fr/", other: {name:"Artistes-auteurs — vérifier si une déclaration personnelle est nécessaire",url:"https://entreprendre.service-public.gouv.fr/vosdroits/F22388"} },
  GB: { name: "GOV.UK — activité indépendante (HMRC)", url: "https://www.gov.uk/become-sole-trader/register-sole-trader", other: {name:"GOV.UK — constituer une société",url:"https://www.gov.uk/limited-company-formation/register-your-company"} },
  US: { name: "SBA — immatriculer une entreprise selon l’État", url: "https://www.sba.gov/business-guide/launch-your-business/register-your-business" },
  CA: { name: "Canada.ca — enregistrement auprès de l’ARC", url: "https://www.canada.ca/en/services/taxes/business-registration.html" },
  BE: { name: "Belgium.be / SPF Finances — créer son entreprise", url: "https://finances.belgium.be/fr/entreprises/creer-une-entreprise" },
  CH: { name: "EasyGov — services aux entreprises suisses", url: "https://www.easygov.swiss/" },
  AU: { name: "Australian Business Registration Service", url: "https://register.business.gov.au/" },
  NZ: { name: "Business.govt.nz — démarrer une activité", url: "https://www.business.govt.nz/business-stage-or-type/starting-a-business" },
  IE: { name: "Gov.ie — enregistrer un nom d’entreprise", url: "https://www.gov.ie/en/department-of-enterprise-tourism-and-employment/services/registering-a-business-name/" },
  DE: { name: "BMWK — démarches de création en Allemagne", url: "https://www.existenzgruendungsportal.de/" },
  NL: { name: "Business.gov.nl — inscription au registre KVK", url: "https://business.gov.nl/regulations/register-your-business-in-the-business-register/" },
  IT: { name: "Impresa in un giorno — guichet SUAP", url: "https://www.impresainungiorno.gov.it/" },
  ES: { name: "CIRCE — création d’entreprise en Espagne", url: "https://paeelectronico.es/" },
  PT: { name: "Portal das Finanças — início de atividade", url: "https://info.portaldasfinancas.gov.pt/pt/apoio_ao_contribuinte/Cidadaos/Atividade_profissional/Declaracoes_de_atividade/Inicio_de_atividade/Paginas/default.aspx" },
  PL: { name: "Biznes.gov.pl — inscription CEIDG", url: "https://biznes.gov.pl/pl/firma/cudzoziemcy/chce-prowadzic-biznes-w-polsce/proc_736-wpis-do-ceidg" },
  RO: { name: "Guichet national — registre du commerce ONRC", url: "https://serviciipublice.gov.ro/serviciu/inregistrare-cereri" },
  AL: { name: "QKB — immatriculation en Albanie", url: "https://qkb.gov.al/en/info-commercial-register/business-registration/" },
  ID: { name: "OSS — licence et inscription d’entreprise", url: "https://oss.go.id/" },
  MA: { name: "Direct Entreprise — création au Maroc", url: "https://www.directentreprise.ma/" },
  BR: { name: "REDESIM — ouverture de CNPJ", url: "https://www.gov.br/empresas-e-negocios/pt-br/redesim/abrir-cnpj" }
});

module.exports = { REGISTRATION_PORTALS };
