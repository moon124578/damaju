// 한글 초성 검색 지원 유틸리티 함수
// 입력값의 초성(자음)을 추출하여 비교할 수 있도록 해줍니다.

const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

export function getChosung(str) {
  if (!str) return '';
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i) - 44032;
    if (charCode >= 0 && charCode <= 11172) {
      const chosungIndex = Math.floor(charCode / 588);
      result += CHOSUNG_LIST[chosungIndex];
    } else {
      result += str.charAt(i);
    }
  }
  return result;
}

// 대상 텍스트가 검색어(자음 혹은 일반문자 혼합)를 포함하는지 검사
export function matchChosung(target, query) {
  if (!target) return false;
  if (!query) return true;
  
  const targetLower = target.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // 만약 검색어가 순수 자음(초성)으로만 구성되어 있는 경우 초성 검색 실시
  const isChosungQuery = /^[ㄱ-ㅎ\s]+$/.test(queryLower);
  
  if (isChosungQuery) {
    const targetChosung = getChosung(targetLower);
    return targetChosung.includes(queryLower);
  }
  
  // 일반 검색
  return targetLower.includes(queryLower);
}
