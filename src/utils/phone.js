// Маска казахстанского номера: +7 (7XX) XXX-XX-XX.
// Понимает ввод с +7, с 8, с 7 (11 цифр) и без кода страны (701…).
// Разделители добавляются только когда за ними уже есть цифра — иначе Backspace «застревает».
function nationalDigits(input) {
  const digits = input.replace(/\D/g, '');
  let n = digits;
  if (input.trimStart().startsWith('+7')) n = digits.slice(1);
  else if (digits[0] === '8') n = digits.slice(1);
  // 11-я цифра при номере на 7/8: значит, первой был набран код страны («7 701…»)
  if (n.length === 11 && (n[0] === '7' || n[0] === '8')) n = n.slice(1);
  return n;
}

export function formatPhone(input) {
  if (!input.replace(/[\s+]/g, '')) return input.trim() === '+' ? '+' : '';
  const n = nationalDigits(input).slice(0, 10);
  let out = '+7';
  if (n.length > 0) out += ' (' + n.slice(0, 3);
  if (n.length > 3) out += ') ' + n.slice(3, 6);
  if (n.length > 6) out += '-' + n.slice(6, 8);
  if (n.length > 8) out += '-' + n.slice(8, 10);
  return out;
}

export const isPhoneComplete = (value) => nationalDigits(value).length === 10;
