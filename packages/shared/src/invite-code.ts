export const inviteCodeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const inviteCodeLength = 6;

export function normalizeInviteCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[0O1IL]/g, '')
    .slice(0, inviteCodeLength);
}

export function formatInviteCode(value: string) {
  const normalized = normalizeInviteCode(value);

  return normalized.length > 3
    ? `${normalized.slice(0, 3)}-${normalized.slice(3)}`
    : normalized;
}

export function isInviteCodeComplete(value: string) {
  return normalizeInviteCode(value).length === inviteCodeLength;
}

export function createInviteCode(random = Math.random) {
  let code = '';

  for (let index = 0; index < inviteCodeLength; index += 1) {
    code += inviteCodeAlphabet[Math.floor(random() * inviteCodeAlphabet.length)];
  }

  return code;
}
