const { orgScope } = require('@froncort/shared');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

/** GET /orgs/:orgId/feature-flags — "ANY (own org)". No PSA per api_reference.md. */
async function listFeatureFlags(orgId, caller) {
  if (!orgScope.ownsResource(orgId, caller.activeOrgId)) {
    throw new AppError('Organization not found', 404, 'NOT_FOUND');
  }
  return prisma.featureFlag.findMany({ where: { orgId }, orderBy: { key: 'asc' } });
}

module.exports = { listFeatureFlags };
