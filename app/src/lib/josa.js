// 받침에 맞춘 조사
//   particle('보컬곡', '은', '는') → '은'      josa('민수', '을', '를') → '민수를'
// 마지막 글자가 한글이 아니면 '을(를)'처럼 둘 다 씀
export function particle(word, withBatchim, without) {
  const c = word.charCodeAt(word.length - 1);
  if (Number.isNaN(c) || c < 0xac00 || c > 0xd7a3) return `${withBatchim}(${without})`;
  return (c - 0xac00) % 28 ? withBatchim : without;
}

export const josa = (word, withBatchim, without) => `${word}${particle(word, withBatchim, without)}`;
