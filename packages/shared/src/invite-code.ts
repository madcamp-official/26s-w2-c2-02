export const inviteCodeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const inviteCodeLength = 6;

const koreanKeyboardMap: Record<string, string> = {
  ㅂ: 'q',
  ㅈ: 'w',
  ㄷ: 'e',
  ㄱ: 'r',
  ㅅ: 't',
  ㅛ: 'y',
  ㅕ: 'u',
  ㅑ: 'i',
  ㅐ: 'o',
  ㅔ: 'p',
  ㅁ: 'a',
  ㄴ: 's',
  ㅇ: 'd',
  ㄹ: 'f',
  ㅎ: 'g',
  ㅗ: 'h',
  ㅓ: 'j',
  ㅏ: 'k',
  ㅣ: 'l',
  ㅋ: 'z',
  ㅌ: 'x',
  ㅊ: 'c',
  ㅍ: 'v',
  ㅠ: 'b',
  ㅜ: 'n',
  ㅡ: 'm',
  ㅃ: 'Q',
  ㅉ: 'W',
  ㄸ: 'E',
  ㄲ: 'R',
  ㅆ: 'T',
  ㅒ: 'O',
  ㅖ: 'P',
  ㄳ: 'rt',
  ㄵ: 'sw',
  ㄶ: 'sg',
  ㄺ: 'fr',
  ㄻ: 'fa',
  ㄼ: 'fq',
  ㄽ: 'ft',
  ㄾ: 'fx',
  ㄿ: 'fv',
  ㅀ: 'fg',
  ㅄ: 'qt',
  ㅘ: 'hk',
  ㅙ: 'ho',
  ㅚ: 'hl',
  ㅝ: 'nj',
  ㅞ: 'np',
  ㅟ: 'nl',
  ㅢ: 'ml'
};

const choseong = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const jungseong = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const jongseong = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function koreanCharacterToQwerty(character: string) {
  const direct = koreanKeyboardMap[character];

  if (direct) return direct;

  const code = character.charCodeAt(0);

  if (code < 0xac00 || code > 0xd7a3) return character;

  const offset = code - 0xac00;
  const initial = Math.floor(offset / 588);
  const medial = Math.floor((offset % 588) / 28);
  const final = offset % 28;

  return [choseong[initial], jungseong[medial], jongseong[final]]
    .filter(Boolean)
    .map((part) => koreanKeyboardMap[part] ?? '')
    .join('');
}

export function convertKoreanKeyboardInput(value: string) {
  return Array.from(value, koreanCharacterToQwerty).join('');
}

export function normalizeInviteCode(value: string) {
  return convertKoreanKeyboardInput(value)
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
