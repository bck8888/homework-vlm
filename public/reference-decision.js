export function decideReference(scores, minimum=.90, margin=.01) {
 const ranked=[...scores].sort((a,b)=>b.score-a.score);
 const best=ranked[0];
 const bestNormal=ranked.filter(x=>x.item.group==='normal')[0];
 // Normal A/B are interchangeable acceptable designs; do not reject their mutual tie.
 const rival=ranked.find(x=>best.item.group==='normal'?x.item.group!=='normal':x.item.id!==best.item.id);
 const gap=rival?best.score-rival.score:Infinity;
 const accepted=best.score>=minimum && gap>=margin;
 return {status:accepted?best.item.group:'review',best,bestNormal,
   reason:accepted?'기준 이미지 코사인 유사도·후보 간 차이 통과':'기준 이미지 유사도 또는 후보 간 차이 부족',gap};
}
