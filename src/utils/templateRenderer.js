import Handlebars from 'handlebars';

export function renderTemplateString(template, context = {}){
  try {
    const tpl = Handlebars.compile(template);
    return tpl(context);
  } catch (err) {
    console.error('Template render error', err && err.message);
    throw err;
  }
}

export function buildContext({ contract, tenant, organization }){
  // Whitelist keys to expose to templates
  return {
    contract: {
      title: contract.title,
      expiry_date: contract.expiry_date ? contract.expiry_date.toISOString().slice(0,10) : null,
      effective_date: contract.effective_date ? contract.effective_date.toISOString().slice(0,10) : null
    },
    tenant: {
      name: tenant && (tenant.name || tenant.businessName) || null,
      id: tenant && tenant._id
    },
    organization: {
      id: organization && organization._id,
      name: organization && (organization.name || organization.title)
    }
  };
}
