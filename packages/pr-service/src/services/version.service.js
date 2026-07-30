const { diffLines } = require('diff');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { resolvePRAccess, PR_NOT_FOUND } = require('./pr.service');

async function assertViewAccess(prId, caller) {
  const { pr, access } = await resolvePRAccess(prId, caller);
  if (!pr || !access) {
    throw PR_NOT_FOUND();
  }
  return pr;
}

/** GET /prs/:id/versions — same access as GET /prs/:id. */
async function listVersions(prId, caller) {
  await assertViewAccess(prId, caller);
  return prisma.pRVersion.findMany({ where: { prId }, orderBy: { versionNumber: 'asc' } });
}

// Title and description are diffed together as one block of text — PRVersion
// only stores those two fields, and the endpoint's contract is a single
// {added, removed} pair, not one per field.
function contentOf(version) {
  return `${version.title}\n\n${version.description}`;
}

function computeDiff(oldText, newText) {
  const parts = diffLines(oldText, newText);
  const added = [];
  const removed = [];
  for (const part of parts) {
    const lines = part.value.split('\n').filter((line, i, arr) => !(i === arr.length - 1 && line === ''));
    if (part.added) added.push(...lines);
    else if (part.removed) removed.push(...lines);
  }
  return { added, removed };
}

/**
 * GET /prs/:id/versions/:n/diff — diffs version n against n-1. Version 1
 * has no n-1 (it's the baseline snapshot taken when review starts, see
 * pr.service.js's updatePR) and correctly 400s rather than pretending an
 * empty diff — there's genuinely nothing before it to compare against.
 */
async function getDiff(prId, versionNumber, caller) {
  await assertViewAccess(prId, caller);

  const n = Number(versionNumber);
  if (!Number.isInteger(n) || n < 1) {
    throw new AppError('Invalid version number', 400, 'VALIDATION_ERROR');
  }
  if (n === 1) {
    throw new AppError('Version 1 is the baseline — there is no prior version to diff against', 400, 'NO_PRIOR_VERSION');
  }

  const [current, previous] = await Promise.all([
    prisma.pRVersion.findFirst({ where: { prId, versionNumber: n } }),
    prisma.pRVersion.findFirst({ where: { prId, versionNumber: n - 1 } }),
  ]);
  if (!current || !previous) {
    throw new AppError('Version not found', 404, 'NOT_FOUND');
  }

  return computeDiff(contentOf(previous), contentOf(current));
}

module.exports = { listVersions, getDiff };
